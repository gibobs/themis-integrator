/**
 * Repositorio de las operaciones en el almacén local del integrador.
 */
import 'server-only';
import { getDb, nowIso } from './db';

export interface LocalOperation {
	id: string;
	externalId: string | null;
	operationId: string | null;
	type: string;
	isHandoff: boolean;
	creationStatus: string;
	continuationUrl: string | null;
	statusUrl: string | null;
	idempotencyKey: string | null;
	request: Record<string, unknown>;
	lastError: string | null;
	lastErrorType: string | null;
	businessStatus: string | null;
	stage: string | null;
	substage: string | null;
	origin: string;
	amount: number | null;
	province: string | null;
	createdAt: string;
	updatedAt: string;
}

interface Row {
	id: string;
	external_id: string | null;
	operation_id: string | null;
	type: string;
	is_handoff: number;
	creation_status: string;
	continuation_url: string | null;
	status_url: string | null;
	idempotency_key: string | null;
	request_json: string;
	last_error: string | null;
	last_error_type: string | null;
	business_status: string | null;
	stage: string | null;
	substage: string | null;
	origin: string;
	amount: number | null;
	province: string | null;
	created_at: string;
	updated_at: string;
}

function toLocal(row: Row): LocalOperation {
	return {
		id: row.id,
		externalId: row.external_id,
		operationId: row.operation_id,
		type: row.type,
		isHandoff: row.is_handoff === 1,
		creationStatus: row.creation_status,
		continuationUrl: row.continuation_url,
		statusUrl: row.status_url,
		idempotencyKey: row.idempotency_key,
		request: JSON.parse(row.request_json),
		lastError: row.last_error,
		lastErrorType: row.last_error_type,
		businessStatus: row.business_status,
		stage: row.stage,
		substage: row.substage,
		origin: row.origin,
		amount: row.amount,
		province: row.province,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export interface InsertOperationInput {
	id: string;
	externalId: string | null;
	type: string;
	isHandoff: boolean;
	idempotencyKey: string;
	request: Record<string, unknown>;
	origin?: string;
	amount?: number | null;
	province?: string | null;
}

export function insertOperation(input: InsertOperationInput): LocalOperation {
	const db = getDb();
	const ts = nowIso();
	db.prepare(
		`INSERT INTO operations
			(id, external_id, type, is_handoff, creation_status, idempotency_key, request_json, origin, amount, province, created_at, updated_at)
		 VALUES (@id, @externalId, @type, @isHandoff, 'PENDING', @idempotencyKey, @requestJson, @origin, @amount, @province, @ts, @ts)`,
	).run({
		id: input.id,
		externalId: input.externalId,
		type: input.type,
		isHandoff: input.isHandoff ? 1 : 0,
		idempotencyKey: input.idempotencyKey,
		requestJson: JSON.stringify(input.request),
		origin: input.origin ?? 'INTAKE',
		amount: input.amount ?? null,
		province: input.province ?? null,
		ts,
	});
	return getById(input.id)!;
}

/** Registra la respuesta del alta (202/201): operationId, urls y estado. */
export function recordCreateResponse(
	id: string,
	fields: {
		operationId: string;
		creationStatus: string;
		statusUrl?: string | null;
		continuationUrl?: string | null;
		externalId?: string | null;
	},
): void {
	getDb()
		.prepare(
			`UPDATE operations SET
				operation_id = @operationId,
				creation_status = @creationStatus,
				status_url = @statusUrl,
				continuation_url = @continuationUrl,
				external_id = COALESCE(@externalId, external_id),
				updated_at = @ts
			 WHERE id = @id`,
		)
		.run({
			id,
			operationId: fields.operationId,
			creationStatus: fields.creationStatus,
			statusUrl: fields.statusUrl ?? null,
			continuationUrl: fields.continuationUrl ?? null,
			externalId: fields.externalId ?? null,
			ts: nowIso(),
		});
}

export function updateCreationStatus(
	operationId: string,
	fields: { status: string; error?: string | null; errorType?: string | null },
): void {
	getDb()
		.prepare(
			`UPDATE operations SET
				creation_status = @status,
				last_error = @error,
				last_error_type = @errorType,
				updated_at = @ts
			 WHERE operation_id = @operationId`,
		)
		.run({
			operationId,
			status: fields.status,
			error: fields.error ?? null,
			errorType: fields.errorType ?? null,
			ts: nowIso(),
		});
}

/** Refleja el estado de negocio conocido por las lecturas / change-feed. */
export function updateBusinessState(
	operationId: string,
	fields: {
		businessStatus?: string | null;
		stage?: string | null;
		substage?: string | null;
		amount?: number | null;
		province?: string | null;
		externalId?: string | null;
	},
): void {
	getDb()
		.prepare(
			`UPDATE operations SET
				business_status = COALESCE(@businessStatus, business_status),
				stage = COALESCE(@stage, stage),
				substage = COALESCE(@substage, substage),
				amount = COALESCE(@amount, amount),
				province = COALESCE(@province, province),
				external_id = COALESCE(@externalId, external_id),
				updated_at = @ts
			 WHERE operation_id = @operationId`,
		)
		.run({
			operationId,
			businessStatus: fields.businessStatus ?? null,
			stage: fields.stage ?? null,
			substage: fields.substage ?? null,
			amount: fields.amount ?? null,
			province: fields.province ?? null,
			externalId: fields.externalId ?? null,
			ts: nowIso(),
		});
}

/**
 * Absorbe una operación descubierta en el change-feed / pending-sync que aún no
 * teníamos (típicamente autoprescripción). Idempotente por `operationId`.
 */
export function absorbDiscovered(input: {
	operationId: string;
	origin: string;
	type: string;
	businessStatus?: string | null;
	stage?: string | null;
	externalId?: string | null;
}): void {
	const db = getDb();
	const existing = getByOperationId(input.operationId);
	if (existing) {
		updateBusinessState(input.operationId, {
			businessStatus: input.businessStatus,
			stage: input.stage,
			externalId: input.externalId,
		});
		return;
	}
	const ts = nowIso();
	db.prepare(
		`INSERT INTO operations
			(id, external_id, operation_id, type, is_handoff, creation_status, request_json, business_status, stage, origin, created_at, updated_at)
		 VALUES (@id, @externalId, @operationId, @type, 0, 'PROCESSED', '{}', @businessStatus, @stage, @origin, @ts, @ts)`,
	).run({
		id: input.operationId,
		externalId: input.externalId ?? null,
		operationId: input.operationId,
		type: input.type,
		businessStatus: input.businessStatus ?? null,
		stage: input.stage ?? null,
		origin: input.origin,
		ts,
	});
}

/** Asigna nuestro externalId a una operación local tras un write-back LINKED. */
export function setExternalId(operationId: string, externalId: string): void {
	getDb()
		.prepare(`UPDATE operations SET external_id = @externalId, updated_at = @ts WHERE operation_id = @operationId`)
		.run({ operationId, externalId, ts: nowIso() });
}

export function getById(id: string): LocalOperation | null {
	const row = getDb().prepare(`SELECT * FROM operations WHERE id = ?`).get(id) as Row | undefined;
	return row ? toLocal(row) : null;
}

export function getByOperationId(operationId: string): LocalOperation | null {
	const row = getDb().prepare(`SELECT * FROM operations WHERE operation_id = ?`).get(operationId) as
		| Row
		| undefined;
	return row ? toLocal(row) : null;
}

export function getByExternalId(externalId: string): LocalOperation | null {
	const row = getDb().prepare(`SELECT * FROM operations WHERE external_id = ?`).get(externalId) as
		| Row
		| undefined;
	return row ? toLocal(row) : null;
}

/**
 * Recupera la operación cuya `continuationUrl` contiene este launchToken. Permite
 * a la landing de handoff resolver el `operationId` localmente (el integrador lo
 * conoce), sin depender de que el canje lo devuelva.
 */
export function findByLaunchToken(launchToken: string): LocalOperation | null {
	if (!launchToken) return null;
	const row = getDb()
		.prepare(`SELECT * FROM operations WHERE continuation_url LIKE '%' || ? || '%' LIMIT 1`)
		.get(launchToken) as Row | undefined;
	return row ? toLocal(row) : null;
}

export function listLocal(limit = 100): LocalOperation[] {
	const rows = getDb()
		.prepare(`SELECT * FROM operations ORDER BY created_at DESC LIMIT ?`)
		.all(limit) as Row[];
	return rows.map(toLocal);
}

export function countLocal(): number {
	const row = getDb().prepare(`SELECT COUNT(*) AS n FROM operations`).get() as { n: number };
	return row.n;
}
