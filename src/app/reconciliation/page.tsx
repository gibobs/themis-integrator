import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { ReconciliationClient } from './reconciliation-client';

export const metadata = { title: 'Conciliación · themis-integrator' };

export default function ReconciliationPage() {
	return (
		<div>
			<PageHeader
				title="Conciliación"
				description="Enlaza las operaciones que nacen en la plataforma de Gibobs (autoprescripción) con tu propio externalId y devuélveselo a Themis en lote."
			/>

			<div className="mb-6 space-y-4">
				<Callout tone="warn" title="Solo para autoprescripción">
					El write-back <strong>solo</strong> aplica a operaciones de autoprescripción: las que nacen en la
					plataforma de Gibobs y llegan sin tu referencia. Las que tú das de alta por intake ya viajan con tu{' '}
					<strong>externalId</strong>, así que no hay nada que conciliar.
				</Callout>
				<Callout tone="info" title="El ciclo de conciliación">
					<ol className="list-decimal space-y-1 pl-5">
						<li>
							<strong>Descubrir</strong>: con el change-feed o con pending-sync localizas las operaciones de
							autoprescripción que aún no tienen tu externalId.
						</li>
						<li>
							<strong>Asignar</strong>: les pones tu propio externalId (la referencia con la que las identificas
							en tu sistema).
						</li>
						<li>
							<strong>Devolver en lote</strong>: haces write-back para que Themis enlace cada operationId con tu
							externalId.
						</li>
					</ol>
				</Callout>
			</div>

			<ReconciliationClient />
		</div>
	);
}
