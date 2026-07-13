'use client';
/**
 * Panel de documentos embebido en el detalle de la operación.
 *
 * Al pulsar "Cargar documentos" pide al BFF el listado y el estado documental
 * (`GET …/documents` y `GET …/documents/status`), los pinta con `DocumentsView`
 * y muestra los intercambios en el inspector. Enlaza a la subpágina dedicada.
 */
import * as React from 'react';
import Link from 'next/link';
import { FileText, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Callout } from '@/components/ui/callout';
import { RequestInspector } from '@/components/request-inspector';
import { DocumentsView } from '@/components/documents/documents-view';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type {
	ThemisExchange,
	ThemisDocumentResource,
	ThemisDocumentStatusResult,
} from '@/lib/themis';

export function DocumentsPanel({ operationId }: { operationId: string }) {
	const [documents, setDocuments] = React.useState<ThemisDocumentResource[] | null>(null);
	const [status, setStatus] = React.useState<ThemisDocumentStatusResult | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const [list, docStatus] = await Promise.all([
				apiFetch<WithExchanges<{ items: ThemisDocumentResource[] }>>(
					`/api/operations/${operationId}/documents`,
				),
				apiFetch<WithExchanges<ThemisDocumentStatusResult>>(
					`/api/operations/${operationId}/documents/status`,
				),
			]);
			setDocuments(list.items);
			setStatus(docStatus);
			setExchanges([...(list._themis ?? []), ...(docStatus._themis ?? [])]);
		} catch (e) {
			setError(e instanceof ApiError ? e.message : (e as Error).message);
			if (e instanceof ApiError && e.exchanges) setExchanges(e.exchanges);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-3">
				{documents === null && (
					<Button variant="outline" size="sm" onClick={load} disabled={loading}>
						{loading ? <Spinner /> : <FileText className="size-4" />} Cargar documentos
					</Button>
				)}
				<Link
					href={`/operations/${operationId}/documents`}
					className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
				>
					Ver la vista completa <ArrowUpRight className="size-3.5" />
				</Link>
			</div>

			{error && (
				<Callout tone="danger" title="No se pudieron cargar los documentos">
					{error}
				</Callout>
			)}

			{documents !== null && (
				<DocumentsView operationId={operationId} documents={documents} status={status} />
			)}

			<RequestInspector exchanges={exchanges} title="Documentos en Themis (request / response)" />
		</div>
	);
}
