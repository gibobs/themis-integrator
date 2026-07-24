import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { MilestonesClient } from './milestones-client';

export const metadata = { title: 'Hitos · themis-integrator' };

export default function MilestonesPage() {
	return (
		<div>
			<PageHeader
				title="Feed de hitos"
				description="Lectura incremental de las transiciones de negocio (hitos) de tus operaciones, con el origen que las provocó."
			/>
			<div className="mb-4">
				<Callout tone="info" title="Cómo funciona el feed de hitos">
					Cada fila es una transición <strong>ACHIEVED</strong> o <strong>REVOKED</strong> de un
					hito de negocio; el <strong>source</strong> indica quién la originó (core, documentación,
					backoffice o requisitos). El <strong>since</strong> trae solo lo posterior a la última{' '}
					<code>version</code> procesada y el <strong>cursor</strong> pagina dentro de una misma
					consulta. Es un índice <strong>sin datos personales</strong>: abre el detalle de cada
					operación para ver la PII.
				</Callout>
			</div>
			<MilestonesClient />
		</div>
	);
}
