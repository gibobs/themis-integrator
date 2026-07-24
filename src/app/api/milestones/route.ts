/**
 * BFF del feed de hitos (HITOS).
 *
 *  POST /api/milestones → lectura incremental de HITOS de negocio (Themis
 *  query.getOperationsMilestones): transiciones ACHIEVED/REVOKED de una
 *  operación, con su `source` (CORE, DOCS, BACKOFFICE, REQUIREMENTS).
 *
 * Es un feed SEPARADO del change-feed: el change-feed refleja el drift de
 * estado/etapa de la operación; este refleja hitos de negocio. El progreso
 * (`since`) se guarda por combinación de filtros (feedKey de hitos) en el
 * almacén local, así que cada llamada solo trae lo posterior. A diferencia del
 * change-feed, NO se hace `absorbDiscovered`: los hitos no son filas del índice
 * de operaciones.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type {
	ThemisExchange,
	ThemisMilestoneFeedFilters,
	ThemisMilestoneFeedQuery,
} from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { milestoneFeedKey, getSince, setSince } from '@/lib/db/feed';

interface MilestonesRequest {
	filters?: ThemisMilestoneFeedFilters;
	limit?: number;
	cursor?: string;
	reset?: boolean;
}

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const body = ((await request.json().catch(() => ({}))) ?? {}) as MilestonesRequest;

		const key = milestoneFeedKey(body.filters);
		// `reset` ignora el progreso guardado y relee desde el principio; el `cursor`
		// pagina dentro de una misma consulta (y tiene prioridad sobre `since`).
		const since = body.reset ? undefined : (getSince(key) ?? undefined);

		const query: ThemisMilestoneFeedQuery = {
			limit: body.limit ?? 50,
			since,
			cursor: body.cursor,
			filters: body.filters,
		};

		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{
				method: 'POST',
				path: '/themis/query/v1/operations/milestones',
				note: 'milestone-feed',
			},
			() => themis.query.getOperationsMilestones(query),
		);

		// Calculamos la última `version` procesada para avanzar el `since`.
		let maxVersion = 0;
		for (const item of result.items) {
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
