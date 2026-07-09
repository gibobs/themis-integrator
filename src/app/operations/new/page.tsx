import { PageHeader } from '@/components/page-header';
import { Callout } from '@/components/ui/callout';
import { CreateForm } from './create-form';

export const metadata = { title: 'Nueva operación · themis-integrator' };

export default function NewOperationPage() {
	return (
		<div>
			<PageHeader
				title="Nueva operación"
				description="Origina (o simula) una operación y empújala a Themis. Tú eliges el externalId; Themis acuña el operationId y devuelve 202 (asíncrono/handoff) o 201 (síncrono)."
			/>
			<div className="mb-4">
				<Callout tone="info" title="Dos identificadores">
					El <strong>externalId</strong> es tu referencia (idempotencia de negocio, opcional). El{' '}
					<strong>operationId</strong> lo acuña Themis y es el handle para consultar estado y detalle.
				</Callout>
			</div>
			<CreateForm />
		</div>
	);
}
