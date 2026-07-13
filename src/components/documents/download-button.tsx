'use client';
/**
 * Botón "Descargar" de un documento.
 *
 * Pide al BFF la URL presignada (`GET …/documents/{id}/url`) y dispara la
 * descarga **directa** a esa URL (simula S3, fuera de Themis). Expone al inspector
 * los intercambios de esa llamada, tanto en éxito como en error, vía `onExchanges`.
 */
import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange, ThemisDocumentUrlResource } from '@/lib/themis';

export function DocumentDownloadButton({
	operationId,
	documentId,
	fileName,
	onExchanges,
}: {
	operationId: string;
	documentId: string;
	fileName?: string;
	onExchanges?: (exchanges: ThemisExchange[]) => void;
}) {
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	async function download() {
		setLoading(true);
		setError(null);
		try {
			const res = await apiFetch<WithExchanges<ThemisDocumentUrlResource>>(
				`/api/operations/${operationId}/documents/${encodeURIComponent(documentId)}/url`,
			);
			if (res._themis) onExchanges?.(res._themis);
			// La descarga va directa a la URL presignada (no pasa por el BFF/Themis).
			const a = document.createElement('a');
			a.href = res.url;
			if (fileName) a.download = fileName;
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
		} catch (e) {
			setError(e instanceof ApiError ? e.message : (e as Error).message);
			if (e instanceof ApiError && e.exchanges) onExchanges?.(e.exchanges);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<Button variant="outline" size="sm" onClick={download} disabled={loading}>
				{loading ? <Spinner /> : <Download className="size-4" />} Descargar
			</Button>
			{error && <span className="text-right text-xs text-danger">{error}</span>}
		</div>
	);
}
