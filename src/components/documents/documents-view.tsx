'use client';
/**
 * Vista de documentos de una operación (presentacional, compartida por el panel
 * embebido y la subpágina dedicada).
 *
 * Pinta el **estado documental** (requeridos, presentes y pendientes, con su
 * `mandatory`) y la **tabla de documentos**, con un botón de descarga por fila.
 * Gestiona su propio inspector para los intercambios de descarga (los de list y
 * status los alimenta quien la usa: `apiFetch` en el panel, props en la subpágina).
 */
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { RequestInspector } from '@/components/request-inspector';
import { DocumentDownloadButton } from './download-button';
import type {
	ThemisDocumentResource,
	ThemisDocumentStatusResult,
	ThemisExchange,
} from '@/lib/themis';

/** Formatea un tamaño en bytes a una unidad legible. */
function formatSize(bytes?: number): string {
	if (bytes == null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function DocumentStatusSection({ status }: { status: ThemisDocumentStatusResult }) {
	const presentByKey = new Map(status.present.map((p) => [`${p.owner}:${p.type}`, p]));
	const presentCount = status.required.length - status.pending.length;

	if (status.required.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Esta operación no declara requisitos documentales.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			<p className="text-sm text-muted-foreground">
				{presentCount} de {status.required.length} requeridos presentes ·{' '}
				<span className={status.pending.length ? 'text-warning-foreground' : ''}>
					{status.pending.length} pendiente{status.pending.length === 1 ? '' : 's'}
				</span>
			</p>
			<ul className="divide-y divide-border rounded-md border border-border">
				{status.required.map((req) => {
					const present = presentByKey.get(`${req.owner}:${req.type}`);
					return (
						<li
							key={`${req.owner}:${req.type}`}
							className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{req.type}</span>
								<span className="text-xs text-muted-foreground">· {req.owner}</span>
								<Badge tone={req.mandatory ? 'primary' : 'neutral'}>
									{req.mandatory ? 'Obligatorio' : 'Opcional'}
								</Badge>
							</div>
							{present ? (
								<StatusBadge kind="document" value={present.status} />
							) : (
								<Badge tone="warning">Pendiente</Badge>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export function DocumentsView({
	operationId,
	documents,
	status,
}: {
	operationId: string;
	documents: ThemisDocumentResource[];
	status: ThemisDocumentStatusResult | null;
}) {
	const [downloadExchanges, setDownloadExchanges] = React.useState<ThemisExchange[]>([]);

	return (
		<div className="space-y-4">
			{status && (
				<section className="space-y-2">
					<h4 className="text-sm font-semibold">Estado documental</h4>
					<DocumentStatusSection status={status} />
				</section>
			)}

			<section className="space-y-2">
				<h4 className="text-sm font-semibold">Documentos</h4>
				{documents.length === 0 ? (
					<p className="text-sm text-muted-foreground">Sin documentos en esta operación.</p>
				) : (
					<Table>
						<THead>
							<TR>
								<TH>Tipo</TH>
								<TH>Nombre</TH>
								<TH>Estado</TH>
								<TH>Propietario</TH>
								<TH className="text-right">Tamaño</TH>
								<TH className="text-right">Descarga</TH>
							</TR>
						</THead>
						<TBody>
							{documents.map((doc) => (
								<TR key={doc.documentId}>
									<TD className="font-medium">
										{doc.type}
										{doc.page != null && (
											<span className="text-xs text-muted-foreground"> · pág. {doc.page}</span>
										)}
									</TD>
									<TD className="text-muted-foreground">{doc.name}</TD>
									<TD>
										<StatusBadge kind="document" value={doc.status} />
									</TD>
									<TD className="text-muted-foreground">{doc.owner ?? '—'}</TD>
									<TD className="text-right tabular-nums text-muted-foreground">
										{formatSize(doc.size)}
									</TD>
									<TD>
										<DocumentDownloadButton
											operationId={operationId}
											documentId={doc.documentId}
											fileName={doc.name}
											onExchanges={setDownloadExchanges}
										/>
									</TD>
								</TR>
							))}
						</TBody>
					</Table>
				)}
			</section>

			<RequestInspector
				exchanges={downloadExchanges}
				title="Descarga del documento (request / response)"
			/>
		</div>
	);
}
