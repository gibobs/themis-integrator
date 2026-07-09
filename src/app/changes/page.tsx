import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { ChangesClient } from './changes-client';

export const metadata = { title: 'Change-feed · themis-integrator' };

export default function ChangesPage() {
	return (
		<div>
			<PageHeader
				title="Change-feed"
				description="Lectura incremental de cambios para conciliar el estado de tus operaciones y descubrir autoprescripciones."
			/>
			<div className="mb-4">
				<Callout tone="info" title="Cómo funciona la lectura incremental">
					El <strong>since</strong> trae solo lo posterior a la última <code>version</code> procesada; el{' '}
					<strong>cursor</strong> pagina dentro de una misma consulta. Úsalo para detectar el{' '}
					<strong>drift</strong> de estado de tus operaciones y para descubrir{' '}
					<strong>autoprescripciones sin enlazar</strong>. El índice no trae datos personales: abre el
					detalle de cada operación para ver la PII.
				</Callout>
			</div>
			<ChangesClient />
		</div>
	);
}
