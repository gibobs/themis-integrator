/**
 * BFF de conciliación — write-back.
 *
 *  POST /api/reconciliation/write-back → enlaza en lote cada `operationId` con
 *  tu `externalId` (Themis intake.syncOperations). Para cada enlace confirmado
 *  (LINKED / ALREADY_LINKED) refleja el mapeo en el almacén local, absorbiendo
 *  la operación de autoprescripción si aún no la teníamos.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange, ThemisSyncOperationItem } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { newIdempotencyKey } from '@/lib/util/idempotency';
import { absorbDiscovered, setExternalId } from '@/lib/db/operations';

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const body = (await request.json()) as { items?: ThemisSyncOperationItem[] };
		const items = body.items ?? [];
		const idempotencyKey = newIdempotencyKey();
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{ method: 'POST', path: '/themis/intake/v1/operations/sync', note: 'write-back' },
			() => themis.intake.syncOperations({ items }, idempotencyKey),
		);

		// Reflejamos localmente cada enlace confirmado (autoprescripción absorbida).
		for (const item of result.items) {
			if ((item.status === 'LINKED' || item.status === 'ALREADY_LINKED') && item.externalId) {
				setExternalId(item.operationId, item.externalId);
				absorbDiscovered({
					operationId: item.operationId,
					origin: 'AUTOPRESCRIPTION',
					type: 'MORTGAGE',
					externalId: item.externalId,
				});
			}
		}

		return NextResponse.json(withExchanges(result, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
