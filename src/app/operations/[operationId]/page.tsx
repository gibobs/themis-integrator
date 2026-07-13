import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Callout } from '@/components/ui/callout';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { CopyButton } from '@/components/copy-button';
import { ContinuationLink } from '@/components/continuation-link';
import { RequestInspector } from '@/components/request-inspector';
import { StatusPoller } from './status-poller';
import { HistoryPanel } from './history-panel';
import { DocumentsPanel } from './documents-panel';
import { getThemisClient, ThemisError } from '@/lib/themis';
import type { ThemisExchange, ThemisOperationDetailResource } from '@/lib/themis';
import { audited } from '@/lib/server/respond';
import { getByOperationId } from '@/lib/db/operations';
import { eur, dateTime } from '@/lib/util/format';
import { typeMeta } from '@/lib/status';

export const dynamic = 'force-dynamic';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex justify-between gap-4 py-1.5 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{children}</span>
		</div>
	);
}

export default async function OperationDetailPage({
	params,
}: {
	params: Promise<{ operationId: string }>;
}) {
	const { operationId } = await params;
	const local = getByOperationId(operationId);

	let detail: ThemisOperationDetailResource | null = null;
	let fetchError: unknown = null;
	const themis = await getThemisClient();
	try {
		detail = await audited(
			{ method: 'GET', path: `/themis/query/v1/operations/${operationId}`, note: 'detalle' },
			() => themis.query.getOperation(operationId),
		);
	} catch (e) {
		fetchError = e;
	}
	// Se captura incluso en error (p. ej. 404 mientras el alta aún no está PROCESSED).
	const exchanges: ThemisExchange[] = themis.getExchanges();

	const processed = !!detail;
	const isNotFound = fetchError instanceof ThemisError && fetchError.status === 404;
	const otherError =
		fetchError && !isNotFound
			? fetchError instanceof ThemisError
				? `${fetchError.code}: ${fetchError.detail ?? fetchError.message}`
				: (fetchError as Error).message
			: null;

	const externalId = detail?.externalId ?? local?.externalId ?? null;
	const continuationUrl = local?.continuationUrl ?? null;
	const creationStatus = local?.creationStatus ?? (processed ? 'PROCESSED' : 'PROCESSING');
	const title = detail?.name ?? local?.externalId ?? operationId;

	return (
		<div className="space-y-5">
			<div>
				<Link
					href="/operations"
					className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-4" /> Operaciones
				</Link>
				<PageHeader
					title={title}
					description="Detalle de la operación en Themis (incluye PII, se consulta una a una)."
					actions={
						processed ? (
							<Link
								href={`/operations/${operationId}/documents`}
								className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								<FileText className="size-4" /> Ver documentos
							</Link>
						) : undefined
					}
				/>
			</div>

			{/* Identificadores + estado de negocio */}
			<Card>
				<CardContent className="grid gap-x-8 gap-y-1 pt-5 md:grid-cols-2">
					<Row label="operationId">
						<span className="inline-flex items-center gap-1 font-mono text-xs">
							{operationId}
							<CopyButton value={operationId} />
						</span>
					</Row>
					<Row label="externalId">
						{externalId ? <span className="font-mono text-xs">{externalId}</span> : '—'}
					</Row>
					<Row label="Tipo">{typeMeta[detail?.type ?? local?.type ?? '']?.label ?? '—'}</Row>
					<Row label="Origen">
						<StatusBadge kind="origin" value={detail?.origin ?? local?.origin} />
					</Row>
					<Row label="Estado de negocio">
						<StatusBadge kind="business" value={detail?.status ?? local?.businessStatus} />
					</Row>
					<Row label="Estado del alta">
						<StatusBadge kind="creation" value={creationStatus} />
					</Row>
					{(detail?.stage ?? local?.stage) && (
						<Row label="Etapa">
							{detail?.stage ?? local?.stage}
							{detail?.substage ? ` · ${detail.substage}` : ''}
						</Row>
					)}
					{(detail?.amount ?? local?.amount) != null && (
						<Row label="Importe">{eur(detail?.amount ?? local?.amount)}</Row>
					)}
				</CardContent>
			</Card>

			<RequestInspector exchanges={exchanges} title="Lectura del detalle en Themis (request / response)" />

			{continuationUrl && !processed && (
				<Callout tone="info" title="Handoff: continuación del cliente">
					Esta alta se originó en modo handoff. Redirige al cliente a la <code>continuationUrl</code>{' '}
					para completarla.
					<div className="mt-2">
						<ContinuationLink url={continuationUrl} />
					</div>
				</Callout>
			)}

			{/* Estado del alta (sondeo si aún no terminó) */}
			{!processed && !otherError && (
				<Card>
					<CardHeader>
						<CardTitle>Estado del alta</CardTitle>
					</CardHeader>
					<CardContent>
						<StatusPoller operationId={operationId} initialStatus={creationStatus} />
						<p className="mt-3 text-xs text-muted-foreground">
							El detalle con PII aparecerá automáticamente en cuanto el alta llegue a{' '}
							<strong>PROCESSED</strong>.
						</p>
					</CardContent>
				</Card>
			)}

			{otherError && (
				<Callout tone="danger" title="Error al leer el detalle">
					{otherError}
				</Callout>
			)}

			{/* Detalle con PII */}
			{detail && (
				<div className="grid gap-5 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Intervinientes</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{detail.applicants.map((a, i) => (
								<div key={i} className="rounded-md border border-border p-3">
									<div className="flex items-center gap-2">
										<span className="font-medium">
											{a.name} {a.firstSurname} {a.lastSurname ?? ''}
										</span>
										<Badge tone={a.isMainOwner ? 'primary' : 'neutral'}>
											{a.role === 'OWNER' ? (a.isMainOwner ? 'Titular principal' : 'Titular') : 'Avalista'}
										</Badge>
									</div>
									{(a.email || a.phone) && (
										<div className="mt-1 text-xs text-muted-foreground">
											{a.email}
											{a.email && a.phone ? ' · ' : ''}
											{a.phone}
										</div>
									)}
								</div>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{detail.type === 'SUBROGATION' ? 'Subrogación' : 'Inmueble e hipoteca'}</CardTitle>
						</CardHeader>
						<CardContent>
							{detail.type === 'MORTGAGE' && (
								<>
									{detail.property && (
										<>
											<Row label="Dirección">
												{[detail.property.address.street, detail.property.address.city, detail.property.address.zip]
													.filter(Boolean)
													.join(', ') || '—'}
											</Row>
											<Row label="Provincia">{detail.property.address.province ?? detail.province ?? '—'}</Row>
										</>
									)}
									{detail.mortgage && (
										<>
											<Row label="Precio vivienda">{eur(detail.mortgage.price)}</Row>
											<Row label="Importe hipoteca">{eur(detail.mortgage.amount)}</Row>
											{detail.mortgage.termMonths && <Row label="Plazo">{detail.mortgage.termMonths} meses</Row>}
											{detail.mortgage.ratePreference && (
												<Row label="Tipo preferido">{detail.mortgage.ratePreference}</Row>
											)}
										</>
									)}
								</>
							)}
							{detail.type === 'SUBROGATION' && detail.subrogation && (
								<>
									<Row label="Capital pendiente">{eur(detail.subrogation.amount)}</Row>
									<Row label="Motivo">{detail.subrogation.reason}</Row>
									<Row label="Precio compra original">{eur(detail.subrogation.originalPurchasePrice)}</Row>
									<Row label="TIN actual">{detail.subrogation.currentTin}%</Row>
									<Row label="Tipo actual">{detail.subrogation.currentRate}</Row>
								</>
							)}
						</CardContent>
					</Card>

					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Metadatos</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-x-8 md:grid-cols-2">
							{detail.riskManager?.email && (
								<Row label="Analista de riesgos">
									{detail.riskManager.name ?? detail.riskManager.email}
								</Row>
							)}
							<Row label="Creada">{dateTime(detail.createdAt)}</Row>
							{detail.updatedAt && <Row label="Actualizada">{dateTime(detail.updatedAt)}</Row>}
						</CardContent>
					</Card>

					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Histórico</CardTitle>
						</CardHeader>
						<CardContent>
							<HistoryPanel operationId={operationId} externalId={externalId} />
						</CardContent>
					</Card>

					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Documentos</CardTitle>
							<p className="text-sm text-muted-foreground">
								Solo lectura: se consultan por <code>operationId</code> y se descargan mediante una
								URL presignada efímera (directa a S3, fuera de Themis).
							</p>
						</CardHeader>
						<CardContent>
							<DocumentsPanel operationId={operationId} />
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
