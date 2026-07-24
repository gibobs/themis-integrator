/**
 * Repositorio de los eventos de webhook entrante en el almacén local.
 *
 * Es el lado del integrador: aquí se autogestiona el `sourceEventId` (entero
 * creciente y único por operación) y se deja traza del sobre empujado y de la
 * respuesta de Themis (`eventRef`/`receivedAt`). El *replay* idempotente se apoya
 * en la clave única `(operation_id, source_event_id)`.
 */
import 'server-only';
import { getDb, nowIso } from './db';

export interface WebhookEvent {
	id: number;
	operationId: string;
	sourceEventId: number;
	type: string;
	occurredAt: string | null;
	payload: Record<string, unknown>;
	eventRef: string | null;
	receivedAt: string | null;
	/** ACCEPTED (primer envío) | RESENT (reenvío idempotente del mismo evento). */
	outcome: string;
	httpStatus: number | null;
	createdAt: string;
	updatedAt: string;
}

interface Row {
	id: number;
	operation_id: string;
	source_event_id: number;
	type: string;
	occurred_at: string | null;
	payload_json: string;
	event_ref: string | null;
	received_at: string | null;
	outcome: string;
	http_status: number | null;
	created_at: string;
	updated_at: string;
}

function toWebhookEvent(row: Row): WebhookEvent {
	return {
		id: row.id,
		operationId: row.operation_id,
		sourceEventId: row.source_event_id,
		type: row.type,
		occurredAt: row.occurred_at,
		payload: JSON.parse(row.payload_json),
		eventRef: row.event_ref,
		receivedAt: row.received_at,
		outcome: row.outcome,
		httpStatus: row.http_status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Siguiente `sourceEventId` para una operación: `MAX(source_event_id) + 1`, o `1`
 * si aún no hay ninguno. La secuencia es única por operación (una sola, compartida
 * entre todos los `type`).
 */
export function nextSourceEventId(operationId: string): number {
	const row = getDb()
		.prepare(`SELECT MAX(source_event_id) AS max FROM webhook_events WHERE operation_id = ?`)
		.get(operationId) as { max: number | null };
	return (row.max ?? 0) + 1;
}

export function getWebhookEvent(
	operationId: string,
	sourceEventId: number,
): WebhookEvent | null {
	const row = getDb()
		.prepare(`SELECT * FROM webhook_events WHERE operation_id = ? AND source_event_id = ?`)
		.get(operationId, sourceEventId) as Row | undefined;
	return row ? toWebhookEvent(row) : null;
}

export interface RecordWebhookEventInput {
	operationId: string;
	sourceEventId: number;
	type: string;
	occurredAt?: string | null;
	payload: unknown;
	eventRef: string | null;
	receivedAt: string | null;
	outcome: string;
	httpStatus: number | null;
}

/**
 * Persiste (o refresca) un evento por su clave única `(operation_id,
 * source_event_id)`. En conflicto —un reenvío del mismo evento— **no** duplica ni
 * altera el sobre original (type / occurred_at / payload); solo refresca la
 * respuesta observada (`event_ref`, `received_at`, `outcome`, `http_status`).
 */
export function recordWebhookEvent(input: RecordWebhookEventInput): WebhookEvent {
	const db = getDb();
	const ts = nowIso();
	db.prepare(
		`INSERT INTO webhook_events
			(operation_id, source_event_id, type, occurred_at, payload_json, event_ref, received_at, outcome, http_status, created_at, updated_at)
		 VALUES (@operationId, @sourceEventId, @type, @occurredAt, @payloadJson, @eventRef, @receivedAt, @outcome, @httpStatus, @ts, @ts)
		 ON CONFLICT(operation_id, source_event_id) DO UPDATE SET
			event_ref = @eventRef,
			received_at = @receivedAt,
			outcome = @outcome,
			http_status = @httpStatus,
			updated_at = @ts`,
	).run({
		operationId: input.operationId,
		sourceEventId: input.sourceEventId,
		type: input.type,
		occurredAt: input.occurredAt ?? null,
		payloadJson: JSON.stringify(input.payload),
		eventRef: input.eventRef,
		receivedAt: input.receivedAt,
		outcome: input.outcome,
		httpStatus: input.httpStatus,
		ts,
	});
	return getWebhookEvent(input.operationId, input.sourceEventId)!;
}

/** Historial de eventos emitidos, opcionalmente acotado a una operación. */
export function listWebhookEvents(operationId?: string, limit = 100): WebhookEvent[] {
	const db = getDb();
	const rows = operationId
		? (db
				.prepare(
					`SELECT * FROM webhook_events WHERE operation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
				)
				.all(operationId, limit) as Row[])
		: (db
				.prepare(`SELECT * FROM webhook_events ORDER BY created_at DESC, id DESC LIMIT ?`)
				.all(limit) as Row[]);
	return rows.map(toWebhookEvent);
}
