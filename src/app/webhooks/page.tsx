import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { WebhooksClient } from './webhooks-client';

export const metadata = { title: 'Webhooks · themis-integrator' };

export default async function WebhooksPage({
	searchParams,
}: {
	searchParams: Promise<{ operationId?: string }>;
}) {
	const { operationId } = await searchParams;
	return (
		<div>
			<PageHeader
				title="Webhook entrante (emisión de eventos)"
				description="Empuja eventos de back-office a Themis: construye el sobre, autogestiona el sourceEventId y observa el efecto en el detalle de la operación."
			/>
			<div className="mb-4">
				<Callout tone="info" title="Cómo funciona el webhook entrante">
					El webhook de Themis es <strong>entrante</strong>: eres tú quien empuja el evento
					(<code>POST /themis/webhook/v1/events</code>) y Themis responde <code>202</code>. No hay
					firma ni secreto: la autenticidad es el token M2M. La idempotencia y el orden los llevas
					tú con el <strong>sourceEventId</strong> (entero creciente y único por operación):
					reenviar el mismo par <code>(operationId, sourceEventId)</code> es un{' '}
					<strong>replay idempotente</strong> (mismo <code>eventRef</code>) y un valor inferior al
					último visto se descarta como <strong>fuera de orden</strong>. Ojo: el <code>202</code>{' '}
					valida el <strong>sobre, no el efecto</strong> — el expediente asignado se confirma
					abriendo el <strong>detalle</strong> de la operación (no re-aflora en el change-feed).
				</Callout>
			</div>
			<WebhooksClient initialOperationId={operationId ?? ''} />
		</div>
	);
}
