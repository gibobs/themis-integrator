/**
 * Log de auditoría de las llamadas a Themis. Da trazabilidad "de integrador":
 * qué se llamó, con qué status/código y cuánto tardó.
 */
import 'server-only';
import { getDb, nowIso } from './db';

export interface AuditEntry {
	id: number;
	ts: string;
	method: string;
	path: string;
	status: number | null;
	code: string | null;
	durationMs: number | null;
	note: string | null;
}

export function logCall(entry: {
	method: string;
	path: string;
	status?: number | null;
	code?: string | null;
	durationMs?: number | null;
	note?: string | null;
}): void {
	getDb()
		.prepare(
			`INSERT INTO audit_log (ts, method, path, status, code, duration_ms, note)
			 VALUES (@ts, @method, @path, @status, @code, @durationMs, @note)`,
		)
		.run({
			ts: nowIso(),
			method: entry.method,
			path: entry.path,
			status: entry.status ?? null,
			code: entry.code ?? null,
			durationMs: entry.durationMs ?? null,
			note: entry.note ?? null,
		});
}

export function recentAudit(limit = 50): AuditEntry[] {
	const rows = getDb()
		.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
		.all(limit) as {
		id: number;
		ts: string;
		method: string;
		path: string;
		status: number | null;
		code: string | null;
		duration_ms: number | null;
		note: string | null;
	}[];
	return rows.map((r) => ({
		id: r.id,
		ts: r.ts,
		method: r.method,
		path: r.path,
		status: r.status,
		code: r.code,
		durationMs: r.duration_ms,
		note: r.note,
	}));
}
