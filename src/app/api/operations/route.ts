/**
 * BFF de operaciones.
 *
 *  GET  /api/operations  → listado (Themis query.listOperations) con filtros.
 *  POST /api/operations  → alta (Themis intake.createOperation) + persistencia
 *                          local del mapeo externalId↔operationId y del estado.
 *
 * Es aquí donde el integrador aplica su lógica de idempotencia (Idempotency-Key
 * + externalId), elige el modo (Prefer) y guarda el resultado en su almacén.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange, ThemisLinkedFilter, ThemisListOperationsQuery } from '@/lib/themis';
import { createOperationRequestSchema } from '@/lib/themis/schema';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { newIdempotencyKey } from '@/lib/util/idempotency';
import { ulid } from '@/lib/util/ulid';
import {
	getByExternalId,
	insertOperation,
	recordCreateResponse,
	updateBusinessState,
	updateCreationStatus,
	type LocalOperation,
} from '@/lib/db/operations';

export async function GET(request: Request) {
	// Referencia viva a los intercambios; se rellena en cuanto se crea el cliente,
	// de modo que el catch puede adjuntarlos aunque la llamada falle.
	let captured: ThemisExchange[] = [];
	try {
		const sp = new URL(request.url).searchParams;
		const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
		const query: ThemisListOperationsQuery = {
			linked: (sp.get('linked') as ThemisLinkedFilter) || 'ALL',
			limit: num('limit') ?? 50,
			sort: sp.get('sort') === 'ASC' ? 'ASC' : 'DESC',
			cursor: sp.get('cursor') || undefined,
			status: (sp.get('status') as ThemisListOperationsQuery['status']) || undefined,
			type: (sp.get('type') as ThemisListOperationsQuery['type']) || undefined,
			stage: sp.get('stage') || undefined,
			externalId: sp.get('externalId') || undefined,
			province: sp.get('province') || undefined,
			amountMin: num('amountMin'),
			amountMax: num('amountMax'),
			riskManagerEmail: sp.get('riskManagerEmail') || undefined,
			createdFrom: sp.get('createdFrom') || undefined,
			createdTo: sp.get('createdTo') || undefined,
		};
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{ method: 'POST', path: '/themis/query/v1/operations', note: 'listado' },
			() => themis.query.listOperations(query),
		);
		return NextResponse.json(withExchanges(result, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const parsed = createOperationRequestSchema.safeParse(await request.json());
		if (!parsed.success) {
			return NextResponse.json(
				{ status: 400, code: 'INTEGRATOR_VALIDATION', detail: parsed.error.issues[0]?.message, issues: parsed.error.issues },
				{ status: 400, headers: { 'content-type': 'application/problem+json' } },
			);
		}
		const { mode, request: body } = parsed.data;
		const isHandoff = body.isHandoff;

		// Idempotencia de negocio: si ya tenemos ese externalId localmente, reusamos
		// su fila y su Idempotency-Key (reintento idempotente real).
		let local: LocalOperation | null = body.externalId ? getByExternalId(body.externalId) : null;
		if (!local) {
			local = insertOperation({
				id: ulid(),
				externalId: body.externalId ?? null,
				type: body.type,
				isHandoff,
				idempotencyKey: newIdempotencyKey(),
				request: body,
				amount: body.mortgage?.amount ?? body.subrogation?.amount ?? null,
				province: body.property?.address?.province ?? body.subrogation?.address?.province ?? null,
			});
		}

		// El handoff siempre es asíncrono; el modo síncrono solo aplica sin handoff.
		const prefer = !isHandoff && mode === 'sync' ? 'wait=5' : 'respond-async';

		const themis = await getThemisClient();
		captured = themis.getExchanges();
		try {
			const result = await audited(
				{ method: 'POST', path: '/themis/intake/v1/operations', note: `alta (${prefer})` },
				() =>
					themis.intake.createOperation(body, {
						idempotencyKey: local!.idempotencyKey!,
						prefer,
					}),
			);

			if (result.kind === 'created') {
				recordCreateResponse(local.id, {
					operationId: result.operation.operationId,
					creationStatus: 'PROCESSED',
					externalId: result.operation.externalId ?? null,
				});
				updateBusinessState(result.operation.operationId, {
					businessStatus: result.operation.status,
					stage: result.operation.stage,
					substage: result.operation.substage,
				});
				return NextResponse.json(
					withExchanges(
						{
							localId: local.id,
							kind: 'created',
							status: 201,
							operationId: result.operation.operationId,
							externalId: result.operation.externalId,
							operation: result.operation,
						},
						themis.getExchanges(),
					),
				);
			}

			recordCreateResponse(local.id, {
				operationId: result.accepted.operationId,
				creationStatus: result.accepted.status,
				statusUrl: result.accepted.statusUrl,
				continuationUrl: result.accepted.continuationUrl ?? null,
				externalId: result.accepted.externalId ?? null,
			});
			return NextResponse.json(
				withExchanges(
					{
						localId: local.id,
						kind: 'accepted',
						status: 202,
						operationId: result.accepted.operationId,
						externalId: result.accepted.externalId,
						statusUrl: result.accepted.statusUrl,
						continuationUrl: result.accepted.continuationUrl,
						isHandoff,
					},
					themis.getExchanges(),
				),
			);
		} catch (error) {
			// El alta no fue aceptada: reflejamos el fallo en el almacén local.
			if (local.operationId) {
				updateCreationStatus(local.operationId, {
					status: 'FAILED',
					error: error instanceof Error ? error.message : 'Error de alta',
				});
			}
			throw error;
		}
	} catch (error) {
		return problemResponse(error, captured);
	}
}
