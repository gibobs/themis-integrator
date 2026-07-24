/**
 * Área `webhooks`: emisión de eventos de back-office hacia Themis.
 *
 * El webhook de Themis es *entrante*: el integrador **empuja** el evento y Themis
 * responde `202` validando el sobre (no el efecto). **No** se envía
 * `Idempotency-Key`: la idempotencia y el orden los gobierna el `sourceEventId`
 * (entero creciente y único por operación), fiel a la doc de Themis.
 */
import 'server-only';
import type { ThemisClient } from './client';
import type { ThemisWebhookEventAcceptedResource, ThemisWebhookEventRequest } from './types';

const WEBHOOK = '/themis/webhook/v1';

export function createWebhooks(client: ThemisClient) {
	return {
		/**
		 * Empuja un evento de back-office a Themis. Responde `202 { eventRef, receivedAt }`.
		 * Un reenvío del mismo `(operationId, sourceEventId)` devuelve el mismo `eventRef`.
		 */
		async sendEvent(
			body: ThemisWebhookEventRequest,
		): Promise<ThemisWebhookEventAcceptedResource> {
			const res = await client.request<ThemisWebhookEventAcceptedResource>({
				method: 'POST',
				path: `${WEBHOOK}/events`,
				body,
			});
			return res.data;
		},
	};
}

export type ThemisWebhooks = ReturnType<typeof createWebhooks>;
