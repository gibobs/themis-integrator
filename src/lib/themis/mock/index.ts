/**
 * Transporte mock: enruta peticiones crudas a los handlers que simulan Themis
 * sobre `themis-mock.db`. Respeta la semántica del contrato (idempotencia,
 * handoff, 202/201, write-back por-ítem, change-feed con `version`).
 */
import 'server-only';
import { ulid } from '../../util/ulid';
import type { RawRequest, RawResponse, Transport } from '../http';
import {
	getMockDb,
	isQueryable,
	materialize,
	materializeAll,
	nextVersion,
	type MockRow,
} from './store';

function json(status: number, body: unknown): RawResponse {
	return { status, headers: { 'content-type': 'application/json' }, body };
}

function problem(status: number, code: string, detail: string): RawResponse {
	return json(status, {
		type: `https://api.gibobs.com/errors/${code.toLowerCase()}`,
		title: code,
		status,
		code,
		detail,
	});
}

function encodeCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}
function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
		return typeof parsed.o === 'number' ? parsed.o : 0;
	} catch {
		return 0;
	}
}

function splitPath(path: string): { pathname: string; query: URLSearchParams } {
	const [pathname, qs] = path.split('?');
	return { pathname: pathname!, query: new URLSearchParams(qs ?? '') };
}

function toOperationResource(row: MockRow) {
	return {
		operationId: row.operation_id,
		externalId: row.external_id ?? undefined,
		origin: row.origin,
		name: row.name ?? undefined,
		type: row.type,
		status: row.business_status,
		stage: row.stage ?? '',
		substage: row.substage ?? undefined,
		amount: row.amount ?? undefined,
		province: row.province ?? undefined,
		riskManager: row.risk_manager_json ? JSON.parse(row.risk_manager_json) : undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function wantsSync(prefer: string | undefined): boolean {
	return !!prefer && /wait\s*=/.test(prefer);
}

function shouldFail(body: Record<string, unknown>): boolean {
	const ext = String(body.externalId ?? '');
	const email = String((body.requester as Record<string, unknown> | undefined)?.email ?? '');
	const meta = body.metadata as Record<string, unknown> | undefined;
	return /fail/i.test(ext) || /fail/i.test(email) || meta?.simulateFail === true;
}

export function createMockTransport(): Transport {
	const db = getMockDb();

	return async (req: RawRequest): Promise<RawResponse> => {
		const now = Date.now();
		const { pathname, query } = splitPath(req.path);
		const body = (req.body ?? {}) as Record<string, unknown>;
		const method = req.method;

		// ── auth ──────────────────────────────────────────────────────────────
		if (method === 'POST' && pathname === '/themis/auth/v1/token') {
			return json(200, {
				access_token: 'mock.' + ulid(now),
				expires_in: 3600,
				token_type: 'Bearer',
				scopes: ['intake', 'query'],
			});
		}

		// ── intake: alta ────────────────────────────────────────────────────────
		if (method === 'POST' && pathname === '/themis/intake/v1/operations') {
			return createOperation(db, req, body, now);
		}

		// ── intake: estado del alta ──────────────────────────────────────────────
		const statusMatch = pathname.match(/^\/themis\/intake\/v1\/operations\/([^/]+)\/status$/);
		if (method === 'GET' && statusMatch) {
			return creationStatus(db, decodeURIComponent(statusMatch[1]!), now);
		}

		// ── intake: write-back ────────────────────────────────────────────────────
		if (method === 'POST' && pathname === '/themis/intake/v1/operations/sync') {
			return writeBack(db, body);
		}

		// ── intake: pendientes de conciliar ───────────────────────────────────────
		if (method === 'GET' && pathname === '/themis/intake/v1/operations/pending-sync') {
			return pendingSync(db, query, now);
		}

		// ── intake: handoff ──────────────────────────────────────────────────────
		if (method === 'POST' && pathname === '/themis/intake/v1/handoff/launch-token/redeem') {
			return redeemLaunchToken(db, body, now);
		}
		const handoffStatus = pathname.match(
			/^\/themis\/intake\/v1\/handoff\/operations\/([^/]+)\/status$/,
		);
		if (method === 'GET' && handoffStatus) {
			return creationStatus(db, decodeURIComponent(handoffStatus[1]!), now);
		}

		// ── query ────────────────────────────────────────────────────────────────
		if (method === 'POST' && pathname === '/themis/query/v1/operations') {
			return listOperations(db, body, now);
		}
		if (method === 'POST' && pathname === '/themis/query/v1/operations/changes') {
			return getChanges(db, body, now);
		}
		const historyMatch = pathname.match(/^\/themis\/query\/v1\/operations\/([^/]+)\/history$/);
		if (method === 'GET' && historyMatch) {
			return getHistory(db, decodeURIComponent(historyMatch[1]!), now);
		}
		const detailMatch = pathname.match(/^\/themis\/query\/v1\/operations\/([^/]+)$/);
		if (method === 'GET' && detailMatch) {
			return getDetail(db, decodeURIComponent(detailMatch[1]!), now);
		}

		return problem(404, 'THEMIS_NOT_FOUND', `Ruta no simulada: ${method} ${pathname}`);
	};
}

// ── Handlers ───────────────────────────────────────────────────────────────

function findByOperationId(db: ReturnType<typeof getMockDb>, id: string): MockRow | undefined {
	return db.prepare(`SELECT * FROM mock_operations WHERE operation_id = ?`).get(id) as
		| MockRow
		| undefined;
}

function createOperation(
	db: ReturnType<typeof getMockDb>,
	req: RawRequest,
	body: Record<string, unknown>,
	now: number,
): RawResponse {
	// Validación mínima del contrato.
	const type = body.type;
	if (type !== 'MORTGAGE' && type !== 'SUBROGATION') {
		return problem(400, 'THEMIS_VALIDATION', 'type debe ser MORTGAGE o SUBROGATION.');
	}
	const requester = body.requester as Record<string, unknown> | undefined;
	if (!requester?.email) return problem(400, 'THEMIS_VALIDATION', 'requester.email es obligatorio.');
	const applicants = body.applicants as unknown[] | undefined;
	if (!Array.isArray(applicants) || applicants.length < 1) {
		return problem(400, 'THEMIS_VALIDATION', 'applicants debe contener al menos un titular.');
	}
	if (type === 'MORTGAGE' && (!body.property || !body.mortgage)) {
		return problem(400, 'THEMIS_VALIDATION', 'property y mortgage son obligatorios para MORTGAGE.');
	}
	if (type === 'SUBROGATION' && !body.subrogation) {
		return problem(400, 'THEMIS_VALIDATION', 'subrogation es obligatorio para SUBROGATION.');
	}

	const idempKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
	const externalId = body.externalId ? String(body.externalId) : null;

	// Idempotencia HTTP (misma Idempotency-Key) o de negocio (mismo externalId).
	const existingId = idempKey
		? (db.prepare(`SELECT operation_id FROM mock_idempotency WHERE key = ?`).get(idempKey) as
				| { operation_id: string }
				| undefined)
		: undefined;
	const existingByExt = externalId ? findByExternalId(db, externalId) : undefined;
	const existing = existingId ? findByOperationId(db, existingId.operation_id) : existingByExt;
	if (existing) return buildCreateResponse(db, existing, now);

	const handoff = body.isHandoff !== false; // default true
	const sync = !handoff && wantsSync(req.headers['prefer'] || req.headers['Prefer']);
	const fail = shouldFail(body);

	const operationId = ulid(now);
	const mainApplicant = applicants[0] as Record<string, unknown> | undefined;
	const property = body.property as Record<string, unknown> | undefined;
	const addr = property?.address as Record<string, unknown> | undefined;
	const mortgage = body.mortgage as Record<string, unknown> | undefined;
	const province = (addr?.province as string | undefined) ?? null;
	const amount = (mortgage?.amount as number | undefined) ?? null;
	const name = mainApplicant
		? `${mainApplicant.name ?? ''} ${mainApplicant.firstSurname ?? ''}`.trim()
		: null;
	const launchToken = handoff ? ulid(now) : null;
	// En síncrono lo dejamos ya PROCESSED; en async arranca su reloj ahora.
	const startedAt = sync ? now - 5000 : now;
	const creationStatus = sync ? 'PROCESSED' : 'RECEIVED';
	const ts = new Date(now).toISOString();

	db.prepare(
		`INSERT INTO mock_operations
			(operation_id, external_id, origin, type, name, business_status, stage, substage, amount, province,
			 risk_manager_json, detail_json, is_handoff, creation_status, creation_started_at, fail, launch_token, version, created_at, updated_at)
		 VALUES (@operationId, @externalId, 'INTAKE', @type, @name, 'active', @stage, NULL, @amount, @province,
			 @riskManagerJson, @detailJson, @isHandoff, @creationStatus, @startedAt, @fail, @launchToken, @version, @ts, @ts)`,
	).run({
		operationId,
		externalId,
		type,
		name,
		stage: sync ? 'documentation' : null,
		amount,
		province,
		riskManagerJson: body.riskManager ? JSON.stringify(body.riskManager) : null,
		detailJson: JSON.stringify(body),
		isHandoff: handoff ? 1 : 0,
		creationStatus,
		startedAt,
		fail: fail ? 1 : 0,
		launchToken,
		version: nextVersion(db),
		ts,
	});

	if (idempKey) {
		db.prepare(`INSERT OR IGNORE INTO mock_idempotency (key, operation_id) VALUES (?, ?)`).run(
			idempKey,
			operationId,
		);
	}

	const row = findByOperationId(db, operationId)!;
	return buildCreateResponse(db, row, now);
}

function buildCreateResponse(db: ReturnType<typeof getMockDb>, row: MockRow, now: number): RawResponse {
	const statusUrl = `/themis/intake/v1/operations/${row.operation_id}/status`;
	if (row.is_handoff === 0 && row.creation_status === 'PROCESSED') {
		// Camino síncrono: 201 con el recurso de la operación.
		return json(201, toOperationResource(row));
	}
	const accepted: Record<string, unknown> = {
		operationId: row.operation_id,
		externalId: row.external_id ?? undefined,
		status: 'RECEIVED',
		statusUrl,
	};
	if (row.is_handoff === 1 && row.launch_token) {
		// Misma forma que devuelve Themis real: ruta relativa + `launch_token`.
		accepted.continuationUrl = `/handoff/landing?launch_token=${row.launch_token}`;
	}
	return json(202, accepted);
}

function creationStatus(db: ReturnType<typeof getMockDb>, id: string, now: number): RawResponse {
	let row = findByOperationId(db, id);
	if (!row) return problem(404, 'THEMIS_OPERATION_NOT_FOUND', 'Operación no encontrada.');
	row = materialize(db, row, now);
	const res: Record<string, unknown> = {
		operationId: row.operation_id,
		externalId: row.external_id ?? undefined,
		status: row.creation_status,
	};
	if (row.creation_status === 'FAILED') {
		res.error = 'La estrategia de la marca rechazó el alta (simulado).';
		res.errorType = 'STRATEGY_VALIDATION_FAILED';
		res.statusClass = 'TERMINAL';
		res.attempts = 1;
		res.maxAttempts = 3;
	}
	return json(200, res);
}

function findByExternalId(db: ReturnType<typeof getMockDb>, externalId: string): MockRow | undefined {
	return db.prepare(`SELECT * FROM mock_operations WHERE external_id = ?`).get(externalId) as
		| MockRow
		| undefined;
}

function writeBack(db: ReturnType<typeof getMockDb>, body: Record<string, unknown>): RawResponse {
	const items = (body.items ?? []) as Array<{ operationId?: string; externalId?: string }>;
	if (!Array.isArray(items) || items.length < 1) {
		return problem(400, 'THEMIS_VALIDATION', 'items debe contener entre 1 y 500 enlaces.');
	}
	const results = items.map((item) => {
		const operationId = String(item.operationId ?? '');
		const externalId = String(item.externalId ?? '');
		const row = findByOperationId(db, operationId);
		if (!row) return { operationId, status: 'NOT_FOUND' as const };
		if (row.external_id === externalId) {
			return { operationId, externalId, status: 'ALREADY_LINKED' as const };
		}
		if (row.external_id && row.external_id !== externalId) {
			return { operationId, status: 'CONFLICT' as const };
		}
		const other = findByExternalId(db, externalId);
		if (other && other.operation_id !== operationId) {
			return { operationId, status: 'CONFLICT' as const };
		}
		db.prepare(
			`UPDATE mock_operations SET external_id = ?, version = ?, updated_at = ? WHERE operation_id = ?`,
		).run(externalId, nextVersion(db), new Date().toISOString(), operationId);
		return { operationId, externalId, status: 'LINKED' as const };
	});
	return json(200, { items: results });
}

function pendingSync(
	db: ReturnType<typeof getMockDb>,
	query: URLSearchParams,
	now: number,
): RawResponse {
	materializeAll(db, now);
	const limit = Math.min(Number(query.get('limit')) || 50, 500);
	const sort = query.get('sort') === 'ASC' ? 'ASC' : 'DESC';
	const offset = decodeCursor(query.get('cursor') ?? undefined);
	const rows = db
		.prepare(
			`SELECT operation_id FROM mock_operations
			 WHERE origin = 'AUTOPRESCRIPTION' AND external_id IS NULL AND creation_status = 'PROCESSED'
			 ORDER BY created_at ${sort} LIMIT ? OFFSET ?`,
		)
		.all(limit + 1, offset) as { operation_id: string }[];
	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit);
	return json(200, {
		items: page.map((r) => ({ operationId: r.operation_id })),
		hasMore,
		nextCursor: hasMore ? encodeCursor(offset + limit) : undefined,
	});
}

function redeemLaunchToken(
	db: ReturnType<typeof getMockDb>,
	body: Record<string, unknown>,
	now: number,
): RawResponse {
	const launchToken = String(body.launchToken ?? '');
	const row = db.prepare(`SELECT * FROM mock_operations WHERE launch_token = ?`).get(launchToken) as
		| MockRow
		| undefined;
	if (!row) return problem(401, 'THEMIS_UNAUTHENTICATED', 'launchToken inválido, expirado o ya canjeado.');
	const sessionToken = 'sess.' + ulid(now);
	// single-use: consumimos el launchToken.
	db.prepare(
		`UPDATE mock_operations SET session_token = ?, launch_token = NULL WHERE operation_id = ?`,
	).run(sessionToken, row.operation_id);
	return json(200, { sessionToken, expiresIn: 900, operationId: row.operation_id });
}

function listOperations(
	db: ReturnType<typeof getMockDb>,
	body: Record<string, unknown>,
	now: number,
): RawResponse {
	materializeAll(db, now);
	const limit = Math.min(Number(body.limit) || 50, 500);
	const sort = body.sort === 'ASC' ? 'ASC' : 'DESC';
	const linked = (body.linked as string) || 'ALL';
	const offset = decodeCursor(body.cursor as string | undefined);

	let rows = db
		.prepare(`SELECT * FROM mock_operations WHERE creation_status = 'PROCESSED'`)
		.all() as MockRow[];

	rows = rows.filter((r) => {
		if (linked === 'LINKED' && !r.external_id) return false;
		if (linked === 'UNLINKED' && r.external_id) return false;
		if (body.status && r.business_status !== body.status) return false;
		if (body.type && r.type !== body.type) return false;
		if (body.stage && r.stage !== body.stage) return false;
		if (body.substage && r.substage !== body.substage) return false;
		if (body.externalId && r.external_id !== body.externalId) return false;
		if (body.province && r.province !== body.province) return false;
		if (body.amountMin != null && (r.amount ?? 0) < Number(body.amountMin)) return false;
		if (body.amountMax != null && (r.amount ?? 0) > Number(body.amountMax)) return false;
		if (body.createdFrom && r.created_at < String(body.createdFrom)) return false;
		if (body.createdTo && r.created_at > String(body.createdTo)) return false;
		if (
			body.riskManagerEmail &&
			(!r.risk_manager_json ||
				JSON.parse(r.risk_manager_json).email !== body.riskManagerEmail)
		) {
			return false;
		}
		return true;
	});

	rows.sort((a, b) =>
		sort === 'ASC' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
	);

	const hasMore = rows.length > offset + limit;
	const page = rows.slice(offset, offset + limit);
	return json(200, {
		items: page.map(toOperationResource),
		hasMore,
		nextCursor: hasMore ? encodeCursor(offset + limit) : undefined,
	});
}

function getChanges(
	db: ReturnType<typeof getMockDb>,
	body: Record<string, unknown>,
	now: number,
): RawResponse {
	materializeAll(db, now);
	const limit = Math.min(Number(body.limit) || 50, 500);
	const linked = (body.linked as string) || 'LINKED';
	const origin = (body.origin as string) || 'ALL';
	const cursorOffset = body.cursor ? decodeCursor(body.cursor as string) : null;
	const since = body.since ? Number(body.since) : 0;

	let rows = db.prepare(`SELECT * FROM mock_operations`).all() as MockRow[];
	rows = rows.filter((r) => {
		if (origin !== 'ALL' && r.origin !== origin) return false;
		if (linked === 'LINKED' && !r.external_id) return false;
		if (linked === 'UNLINKED' && r.external_id) return false;
		return true;
	});
	rows.sort((a, b) => a.version - b.version);

	// `cursor` tiene prioridad sobre `since`.
	const startOffset =
		cursorOffset !== null ? cursorOffset : rows.findIndex((r) => r.version > since);
	const base = startOffset < 0 ? rows.length : startOffset;
	const hasMore = rows.length > base + limit;
	const page = rows.slice(base, base + limit);

	return json(200, {
		items: page.map((r) => ({
			operationId: r.operation_id,
			externalId: r.external_id,
			origin: r.origin,
			type: r.type,
			status: r.business_status,
			stage: r.stage ?? undefined,
			substage: r.substage ?? undefined,
			version: String(r.version),
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		})),
		hasMore,
		nextCursor: hasMore ? encodeCursor(base + limit) : undefined,
	});
}

function getDetail(db: ReturnType<typeof getMockDb>, id: string, now: number): RawResponse {
	let row = findByOperationId(db, id);
	if (!row) return problem(404, 'THEMIS_OPERATION_NOT_FOUND', 'Operación no encontrada.');
	row = materialize(db, row, now);
	if (!isQueryable(row)) {
		return problem(404, 'THEMIS_OPERATION_NOT_FOUND', 'La operación aún no está disponible en lectura.');
	}
	const detail = row.detail_json ? JSON.parse(row.detail_json) : {};
	return json(200, {
		...toOperationResource(row),
		applicants: detail.applicants ?? [],
		property: detail.property,
		mortgage: detail.mortgage,
		subrogation: detail.subrogation,
	});
}

function getHistory(db: ReturnType<typeof getMockDb>, externalId: string, now: number): RawResponse {
	materializeAll(db, now);
	const row = findByExternalId(db, externalId);
	if (!row) return problem(404, 'THEMIS_OPERATION_NOT_FOUND', 'Operación no encontrada por ese externalId.');
	const analyst = row.risk_manager_json ? JSON.parse(row.risk_manager_json) : undefined;
	const entries = [
		{ stage: 'intake', substage: undefined, status: 'active' },
		{ stage: 'analysis', substage: 'risk-review', status: 'active' },
		{ stage: row.stage ?? 'documentation', substage: row.substage ?? undefined, status: row.business_status },
	].map((e, i) => ({
		id: `${row.operation_id}-h${i}`,
		stage: e.stage,
		substage: e.substage,
		status: e.status,
		name: row.name ?? undefined,
		analyst,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
	return json(200, { items: entries });
}
