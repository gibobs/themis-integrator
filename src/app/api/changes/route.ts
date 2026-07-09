/**
 * BFF del change-feed.
 *
 *  POST /api/changes → lectura incremental de cambios (Themis
 *  query.getOperationsChanges) para detectar el DRIFT de estado de tus
 *  operaciones y descubrir autoprescripciones sin enlazar.
 *
 * El progreso (`since`) se guarda por combinación de filtros (feedKey) en el
 * almacén local, así que cada llamada solo trae lo posterior. Cada cambio se
 * refleja localmente vía `absorbDiscovered` (upsert del índice sin PII).
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange, ThemisListChangesQuery } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { feedKey, getSince, setSince } from '@/lib/db/feed';
import { absorbDiscovered } from '@/lib/db/operations';

interface ChangesRequest {
	origin?: 'ALL' | 'INTAKE' | 'AUTOPRESCRIPTION';
	linked?: 'ALL' | 'LINKED' | 'UNLINKED';
	limit?: number;
	cursor?: string;
	reset?: boolean;
}

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const body = ((await request.json().catch(() => ({}))) ?? {}) as ChangesRequest;
		const origin = body.origin ?? 'ALL';
		const linked = body.linked ?? 'LINKED';
		const limit = body.limit ?? 50;

		const key = feedKey(origin, linked);
		// `reset` ignora el progreso guardado y relee desde el principio; el `cursor`
		// pagina dentro de una misma consulta (y tiene prioridad sobre `since`).
		const since = body.reset ? undefined : (getSince(key) ?? undefined);

		const query: ThemisListChangesQuery = {
			limit,
			linked,
			origin,
			since,
			cursor: body.cursor,
		};

		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{ method: 'POST', path: '/themis/query/v1/operations/changes', note: 'change-feed' },
			() => themis.query.getOperationsChanges(query),
		);

		// Reflejamos el drift localmente y calculamos la última `version` procesada.
		let maxVersion = 0;
		for (const item of result.items) {
			absorbDiscovered({
				operationId: item.operationId,
				origin: item.origin,
				type: item.type,
				businessStatus: item.status,
				stage: item.stage ?? null,
				externalId: item.externalId ?? null,
			});
			const v = Number(item.version);
			if (Number.isFinite(v) && v > maxVersion) maxVersion = v;
		}
		if (result.items.length > 0) setSince(key, String(maxVersion));

		return NextResponse.json(
			withExchanges(
				{
					items: result.items,
					hasMore: result.hasMore,
					nextCursor: result.nextCursor,
					since: getSince(key),
					feedKey: key,
				},
				themis.getExchanges(),
			),
		);
	} catch (error) {
		return problemResponse(error, captured);
	}
}
