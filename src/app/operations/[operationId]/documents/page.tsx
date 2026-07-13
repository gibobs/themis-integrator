import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { RequestInspector } from '@/components/request-inspector';
import { DocumentsView } from '@/components/documents/documents-view';
import { getThemisClient, ThemisError } from '@/lib/themis';
import type {
	ThemisExchange,
	ThemisDocumentResource,
	ThemisDocumentStatusResult,
} from '@/lib/themis';
import { audited } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export default async function OperationDocumentsPage({
	params,
}: {
	params: Promise<{ operationId: string }>;
}) {
	const { operationId } = await params;

	const themis = await getThemisClient();
	let documents: ThemisDocumentResource[] | null = null;
	let status: ThemisDocumentStatusResult | null = null;
	let fetchError: unknown = null;
	try {
		const [list, docStatus] = await Promise.all([
			audited(
				{
					method: 'GET',
					path: `/themis/query/v1/operations/${operationId}/documents`,
					note: 'documentos',
				},
				() => themis.query.listOperationDocuments(operationId),
			),
			audited(
				{
					method: 'GET',
					path: `/themis/query/v1/operations/${operationId}/documents/status`,
					note: 'estado documental',
				},
				() => themis.query.getOperationDocumentsStatus(operationId),
			),
		]);
		documents = list.items;
		status = docStatus;
	} catch (e) {
		fetchError = e;
	}
	// Se capturan incluso en error (p. ej. un 404 si la operación no es de tu ámbito).
	const exchanges: ThemisExchange[] = themis.getExchanges();

	const errorMessage =
		fetchError instanceof ThemisError
			? `${fetchError.code}: ${fetchError.detail ?? fetchError.message}`
			: fetchError
				? (fetchError as Error).message
				: null;

	return (
		<div className="space-y-5">
			<div>
				<Link
					href={`/operations/${operationId}`}
					className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Volver a la operación
				</Link>
				<PageHeader
					title="Documentos"
					description="Documentos de la operación en Themis: solo lectura, por operationId. La descarga usa una URL presignada efímera (directa a S3, fuera de Themis)."
				/>
			</div>

			{errorMessage && (
				<Callout tone="danger" title="No se pudieron leer los documentos">
					{errorMessage}
				</Callout>
			)}

			{documents !== null && (
				<Card>
					<CardContent className="pt-5">
						<DocumentsView operationId={operationId} documents={documents} status={status} />
					</CardContent>
				</Card>
			)}

			<RequestInspector
				exchanges={exchanges}
				title="Lectura de documentos en Themis (request / response)"
			/>
		</div>
	);
}
