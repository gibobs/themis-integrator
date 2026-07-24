/**
 * BFF del webhook entrante (emisión de eventos).
 *
 *  POST /api/webhooks → empuja un evento de back-office a Themis
 *  (webhooks.sendEvent → POST /themis/webhook/v1/events). El integrador
 *  autogestiona el `sourceEventId` (secuencia única por operación), detecta el
 *  reenvío ANTES de llamar y refleja el resultado en su almacén local.
 *  GET  /api/webhooks → historial de eventos emitidos (opcional `?operationId=`).
 *
 * El `202` valida el sobre, no el efecto: el expediente asignado se confirma
 * consultando el detalle de la operación (no re-aflora en el change-feed).
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type {
	ThemisExchange,
	ThemisUnderwritingCaseAssignedPayload,
	ThemisWebhookEventType,
} from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import {
	getWebhookEvent,
	listWebhookEvents,
	nextSourceEventId,
	recordWebhookEvent,
} from '@/lib/db/webhook-events';

interface WebhookEventRequestBody {
	operationId?: string;
	type?: ThemisWebhookEventType;
	payload?: ThemisUnderwritingCaseAssignedPayload;
	occurredAt?: string;
	/** Opcional: si no llega, se autogestiona con `nextSourceEventId`. */
	sourceEventId?: number;
}

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const body = ((await request.json().catch(() => ({}))) ?? {}) as WebhookEventRequestBody;
		const operationId = (body.operationId ?? '').trim();
		if (!operationId) {
			return NextResponse.json(
				{ status: 400, code: 'INTEGRATOR_VALIDATION', detail: 'operationId es obligatorio.' },
				{ status: 400, headers: { 'content-type': 'application/problem+json' } },
			);
		}

		const type = body.type ?? 'UNDERWRITING_CASE_ASSIGNED';
		const payload = (body.payload ?? {}) as ThemisUnderwritingCaseAssignedPayload;
		// Si no llega `sourceEventId`, autogestionamos la secuencia por operación.
		const sourceEventId = body.sourceEventId ?? nextSourceEventId(operationId);
		const occurredAt = body.occurredAt ?? null;

		// ¿Reenvío? Se detecta ANTES de llamar: ¿ya teníamos ese (operationId, sourceEventId)?
		const priorEvent = getWebhookEvent(operationId, sourceEventId);

		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const accepted = await audited(
			{ method: 'POST', path: '/themis/webhook/v1/events', note: 'webhook-event' },
			() =>
				themis.webhooks.sendEvent({
					operationId,
					sourceEventId,
					type,
					occurredAt: occurredAt ?? undefined,
					payload,
				}),
		);

		// RESENT si ya existía la fila local y Themis devolvió el mismo `eventRef`
		// (replay idempotente confirmado); si no, ACCEPTED (primer envío).
		const outcome = priorEvent && priorEvent.eventRef === accepted.eventRef ? 'RESENT' : 'ACCEPTED';

		const event = recordWebhookEvent({
			operationId,
			sourceEventId,
			type,
			occurredAt,
			payload,
			eventRef: accepted.eventRef,
			receivedAt: accepted.receivedAt,
			outcome,
			httpStatus: 202,
		});

		return NextResponse.json(
			withExchanges({ event, outcome, sourceEventId, accepted }, themis.getExchanges()),
		);
	} catch (error) {
		return problemResponse(error, captured);
	}
}

export async function GET(request: Request) {
	try {
		const operationId = new URL(request.url).searchParams.get('operationId') || undefined;
		const items = listWebhookEvents(operationId);
		return NextResponse.json({ items });
	} catch (error) {
		return problemResponse(error);
	}
}
