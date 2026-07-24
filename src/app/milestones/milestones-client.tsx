'use client';
import * as React from 'react';
import { ChevronRight, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Callout } from '@/components/ui/callout';
import { Spinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { CopyButton } from '@/components/copy-button';
import { RequestInspector } from '@/components/request-inspector';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange, ThemisOperationMilestoneItem } from '@/lib/themis';
import { dateTime, shortId } from '@/lib/util/format';

type Status = 'ALL' | 'ACHIEVED' | 'REVOKED';
type Source = 'ALL' | 'CORE' | 'DOCS' | 'BACKOFFICE' | 'REQUIREMENTS';

interface MilestonesResponse {
	items: ThemisOperationMilestoneItem[];
	hasMore: boolean;
	nextCursor?: string;
	since: string | null;
	feedKey: string;
}

export function MilestonesClient() {
	const [milestoneType, setMilestoneType] = React.useState('');
	const [status, setStatus] = React.useState<Status>('ALL');
	const [source, setSource] = React.useState<Source>('ALL');
	const [limit, setLimit] = React.useState(50);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [result, setResult] = React.useState<WithExchanges<MilestonesResponse> | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	async function fetchMilestones(extra: { reset?: boolean; cursor?: string } = {}) {
		setLoading(true);
		setError(null);
		// milestoneType es texto libre: se parte por comas y se descartan las partes vacías.
		const types = milestoneType
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		try {
			const res = await apiFetch<WithExchanges<MilestonesResponse>>('/api/milestones', {
				method: 'POST',
				body: JSON.stringify({
					filters: {
						types: types.length ? types : undefined,
						status: status !== 'ALL' ? [status] : undefined,
						sources: source !== 'ALL' ? [source] : undefined,
					},
					limit,
					...extra,
				}),
			});
			setResult(res);
			setExchanges(res._themis ?? []);
		} catch (err) {
			setError(
				err instanceof ApiError
					? `${err.code ?? ''} ${err.message}`.trim()
					: (err as Error).message,
			);
			if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Consulta</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-1">
							<Label htmlFor="milestoneType">Tipo de hito</Label>
							<Input
								id="milestoneType"
								placeholder="READY_TO_BANK, OFFER_SELECTED"
								value={milestoneType}
								onChange={(e) => setMilestoneType(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="status">Estado</Label>
							<Select
								id="status"
								value={status}
								onChange={(e) => setStatus(e.target.value as Status)}
							>
								<option value="ALL">Todos</option>
								<option value="ACHIEVED">Cumplido</option>
								<option value="REVOKED">Revocado</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="source">Origen</Label>
							<Select
								id="source"
								value={source}
								onChange={(e) => setSource(e.target.value as Source)}
							>
								<option value="ALL">Todos</option>
								<option value="CORE">Core</option>
								<option value="DOCS">Documentos</option>
								<option value="BACKOFFICE">Backoffice</option>
								<option value="REQUIREMENTS">Requisitos</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="limit">Límite</Label>
							<Input
								id="limit"
								type="number"
								min={1}
								value={limit}
								onChange={(e) => setLimit(Number(e.target.value) || 50)}
							/>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={() => fetchMilestones()} disabled={loading}>
							{loading ? <Spinner /> : <Download className="size-4" />}
							Traer hitos
						</Button>
						<Button
							variant="outline"
							onClick={() => fetchMilestones({ reset: true })}
							disabled={loading}
						>
							<RotateCcw className="size-4" /> Reiniciar since
						</Button>
						{result?.hasMore && result.nextCursor && (
							<Button
								variant="secondary"
								onClick={() => fetchMilestones({ cursor: result.nextCursor })}
								disabled={loading}
							>
								Página siguiente <ChevronRight className="size-4" />
							</Button>
						)}
					</div>

					{result && (
						<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
							<span>
								since actual:{' '}
								<span className="font-mono text-foreground">{result.since ?? '—'}</span>
							</span>
							<span>
								clave: <span className="font-mono">{result.feedKey}</span>
							</span>
						</p>
					)}
				</CardContent>
			</Card>

			{error && (
				<Callout tone="danger" title="No se pudo leer el feed de hitos">
					{error}
				</Callout>
			)}

			<RequestInspector exchanges={exchanges} />

			{result && (
				<div className="rounded-lg border border-border bg-card">
					<Table>
						<THead>
							<TR>
								<TH>operationId</TH>
								<TH>Hito</TH>
								<TH>Estado</TH>
								<TH>Origen</TH>
								<TH>Ocurrido</TH>
								<TH>version</TH>
								<TH>Detalle</TH>
							</TR>
						</THead>
						<TBody>
							{result.items.length === 0 && (
								<TR>
									<TD className="py-8 text-center text-muted-foreground" colSpan={7}>
										No hay hitos posteriores al último since.
									</TD>
								</TR>
							)}
							{result.items.map((item) => (
								<TR key={`${item.operationId}:${item.milestoneType}:${item.version}`}>
									<TD className="font-mono text-xs">
										<span className="inline-flex items-center gap-1">
											{shortId(item.operationId)}
											<CopyButton value={item.operationId} />
										</span>
									</TD>
									<TD className="font-mono text-xs">{item.milestoneType}</TD>
									<TD>
										<StatusBadge kind="milestone" value={item.status} />
									</TD>
									<TD>
										<StatusBadge kind="milestoneSource" value={item.source} />
									</TD>
									<TD className="whitespace-nowrap text-xs text-muted-foreground">
										{item.occurredAt ? dateTime(item.occurredAt) : '—'}
									</TD>
									<TD className="font-mono text-xs">{item.version}</TD>
									<TD className="text-xs text-muted-foreground">
										{item.payload
											? ((item.payload.reason as string) ?? JSON.stringify(item.payload))
											: '—'}
									</TD>
								</TR>
							))}
						</TBody>
					</Table>
				</div>
			)}
		</div>
	);
}
