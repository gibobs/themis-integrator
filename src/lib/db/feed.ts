/**
 * Progreso del change-feed: guarda la última `version` procesada (`since`) por
 * combinación de filtros, para el consumo incremental.
 */
import 'server-only';
import { getDb, nowIso } from './db';

export function feedKey(origin: string, linked: string): string {
	return `changes:${origin}:${linked}`;
}

export function getSince(key: string): string | null {
	const row = getDb().prepare(`SELECT since FROM feed_state WHERE feed_key = ?`).get(key) as
		| { since: string | null }
		| undefined;
	return row?.since ?? null;
}

export function setSince(key: string, since: string): void {
	getDb()
		.prepare(
			`INSERT INTO feed_state (feed_key, since, updated_at) VALUES (@key, @since, @ts)
			 ON CONFLICT(feed_key) DO UPDATE SET since = @since, updated_at = @ts`,
		)
		.run({ key, since, ts: nowIso() });
}

export function resetSince(key: string): void {
	getDb().prepare(`DELETE FROM feed_state WHERE feed_key = ?`).run(key);
}

/**
 * Clave determinista del feed de hitos, análoga a `feedKey`, para guardar el
 * `since` por combinación de filtros. Sin filtros devuelve `'milestones'`; con
 * filtros añade las partes `clave=valores` ordenadas alfabéticamente por clave,
 * con los valores de cada parte también ordenados y las partes sin valores
 * omitidas. Ej.: `'milestones:sources=CORE,DOCS;status=REVOKED;types=READY_TO_BANK'`.
 *
 * La clave cubre *todos* los filtros de contenido (igual que `feedKey` cubre
 * `origin`+`linked`): así dos consultas que difieran en cualquier filtro llevan
 * su propio `since` y el consumo incremental no mezcla ni se salta transiciones.
 * Reutiliza getSince/setSince/resetSince tal cual (son genéricos por clave).
 */
export function milestoneFeedKey(filters?: {
	types?: string[];
	status?: string[];
	sources?: string[];
	operationIds?: string[];
	occurredFrom?: string;
	occurredTo?: string;
}): string {
	if (!filters) return 'milestones';
	const parts: string[] = [];
	for (const [name, values] of [
		['operationIds', filters.operationIds],
		['sources', filters.sources],
		['status', filters.status],
		['types', filters.types],
	] as const) {
		if (values && values.length > 0) {
			parts.push(`${name}=${[...values].sort().join(',')}`);
		}
	}
	if (filters.occurredFrom) parts.push(`occurredFrom=${filters.occurredFrom}`);
	if (filters.occurredTo) parts.push(`occurredTo=${filters.occurredTo}`);
	// Orden alfabético por clave para que la clave sea estable e independiente
	// del orden en que lleguen los filtros.
	parts.sort();
	return parts.length > 0 ? `milestones:${parts.join(';')}` : 'milestones';
}
