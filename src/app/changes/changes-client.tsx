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
import type { ThemisExchange, ThemisOperationChangeResource } from '@/lib/themis';
import { dateTime, shortId } from '@/lib/util/format';
import { typeMeta } from '@/lib/status';

type Origin = 'ALL' | 'INTAKE' | 'AUTOPRESCRIPTION';
type Linked = 'ALL' | 'LINKED' | 'UNLINKED';

interface ChangesResponse {
	items: ThemisOperationChangeResource[];
	hasMore: boolean;
	nextCursor?: string;
	since: string | null;
	feedKey: string;
}

export function ChangesClient() {
	const [origin, setOrigin] = React.useState<Origin>('ALL');
	const [linked, setLinked] = React.useState<Linked>('LINKED');
	const [limit, setLimit] = React.useState(50);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [result, setResult] = React.useState<WithExchanges<ChangesResponse> | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	async function fetchChanges(extra: { reset?: boolean; cursor?: string } = {}) {
		setLoading(true);
		setError(null);
		try {
			const res = await apiFetch<WithExchanges<ChangesResponse>>('/api/changes', {
				method: 'POST',
				body: JSON.stringify({ origin, linked, limit, ...extra }),
			});
			setResult(res);
			setExchanges(res._themis ?? []);
		} catch (err) {
			setError(err instanceof ApiError ? `${err.code ?? ''} ${err.message}`.trim() : (err as Error).message);
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
					<div className="grid gap-3 md:grid-cols-3">
						<div className="space-y-1">
							<Label htmlFor="origin">Origen</Label>
							<Select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
								<option value="ALL">Todos</option>
								<option value="INTAKE">Intake (tuyas)</option>
								<option value="AUTOPRESCRIPTION">Autoprescripción</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="linked">Enlace</Label>
							<Select id="linked" value={linked} onChange={(e) => setLinked(e.target.value as Linked)}>
								<option value="LINKED">Enlazadas</option>
								<option value="UNLINKED">Sin enlazar</option>
								<option value="ALL">Todas</option>
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
						<Button onClick={() => fetchChanges()} disabled={loading}>
							{loading ? <Spinner /> : <Download className="size-4" />}
							Traer cambios
						</Button>
						<Button variant="outline" onClick={() => fetchChanges({ reset: true })} disabled={loading}>
							<RotateCcw className="size-4" /> Reiniciar since
						</Button>
						{result?.hasMore && result.nextCursor && (
							<Button
								variant="secondary"
								onClick={() => fetchChanges({ cursor: result.nextCursor })}
								disabled={loading}
							>
								Página siguiente <ChevronRight className="size-4" />
							</Button>
						)}
					</div>

					{result && (
						<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
							<span>
								since actual: <span className="font-mono text-foreground">{result.since ?? '—'}</span>
							</span>
							<span>
								clave: <span className="font-mono">{result.feedKey}</span>
							</span>
						</p>
					)}
				</CardContent>
			</Card>

			{error && (
				<Callout tone="danger" title="No se pudo leer el change-feed">
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
								<TH>externalId</TH>
								<TH>Origen</TH>
								<TH>Tipo</TH>
								<TH>Estado</TH>
								<TH>Etapa</TH>
								<TH>version</TH>
								<TH>Actualizada</TH>
							</TR>
						</THead>
						<TBody>
							{result.items.length === 0 && (
								<TR>
									<TD className="py-8 text-center text-muted-foreground" colSpan={8}>
										No hay cambios posteriores al último since.
									</TD>
								</TR>
							)}
							{result.items.map((item) => (
								<TR key={`${item.operationId}:${item.version}`}>
									<TD className="font-mono text-xs">
										<span className="inline-flex items-center gap-1">
											{shortId(item.operationId)}
											<CopyButton value={item.operationId} />
										</span>
									</TD>
									<TD className="font-mono text-xs">{item.externalId ?? '—'}</TD>
									<TD>
										<StatusBadge kind="origin" value={item.origin} />
									</TD>
									<TD>{typeMeta[item.type]?.label ?? item.type}</TD>
									<TD>
										<StatusBadge kind="business" value={item.status} />
									</TD>
									<TD className="text-xs text-muted-foreground">
										{item.stage ?? '—'}
										{item.substage ? ` · ${item.substage}` : ''}
									</TD>
									<TD className="font-mono text-xs">{item.version}</TD>
									<TD className="whitespace-nowrap text-xs text-muted-foreground">
										{dateTime(item.updatedAt)}
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
