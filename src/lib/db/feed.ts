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
