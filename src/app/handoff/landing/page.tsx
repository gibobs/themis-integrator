import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { findByLaunchToken } from '@/lib/db/operations';
import { getEstigiaConfig, getThemisConfig } from '@/lib/themis';
import { HandoffLandingClient } from './landing-client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Continuar solicitud · themis-integrator' };

/**
 * Landing de continuación del handoff.
 *
 * Es la ruta a la que apunta la `continuationUrl` del 202 (Themis la devuelve
 * como `/handoff/landing?launch_token=…`). Aquí aterriza el cliente para
 * completar el alta: canjeamos el launchToken de un solo uso y seguimos el estado.
 */
export default async function HandoffLandingPage({
	searchParams,
}: {
	searchParams: Promise<{
		launch_token?: string;
		token?: string;
		operationId?: string;
		operation_id?: string;
	}>;
}) {
	const sp = await searchParams;
	const launchToken = sp.launch_token ?? sp.token ?? '';
	// El integrador conoce el operationId asociado al launchToken (lo guardó al
	// crear la operación): lo resolvemos aquí como respaldo para poder sondear el
	// estado aunque el canje no devuelva operationId.
	const operationIdHint =
		sp.operationId ?? sp.operation_id ?? findByLaunchToken(launchToken)?.operationId ?? undefined;

	// Para "cerrar el círculo": tras el alta, ofrecemos entrar a Estigia (app de
	// cliente) con el JWT del usuario. La URL base se configura en `.env.local` y
	// el botón solo aplica en modo real (en mock el token es simulado).
	const { mock } = getThemisConfig();
	const { baseUrl: estigiaBaseUrl } = getEstigiaConfig();

	return (
		<div className="space-y-4">
			<PageHeader
				title="Continuar tu solicitud"
				description="Estás completando una operación originada en modo handoff."
			/>
			<Callout tone="info" title="Continuación del handoff">
				En una integración real, esta pantalla la aloja la webapp de Gibobs; el integrador solo
				redirige aquí al cliente. Este integrador de referencia la sirve para poder demostrar el
				canje del <strong>launchToken</strong> (de un solo uso) y el seguimiento del estado.
			</Callout>

			{launchToken ? (
				<HandoffLandingClient
					launchToken={launchToken}
					operationIdHint={operationIdHint}
					estigiaBaseUrl={estigiaBaseUrl}
					mock={mock}
				/>
			) : (
				<Callout tone="warn" title="Falta el launchToken">
					La URL de continuación debe incluir <code>?launch_token=…</code>.
				</Callout>
			)}
		</div>
	);
}
