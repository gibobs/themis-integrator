'use client';
import * as React from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Callout } from '@/components/ui/callout';
import { StatusBadge } from '@/components/status-badge';
import { RequestInspector } from '@/components/request-inspector';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange } from '@/lib/themis';
import { dateTime } from '@/lib/util/format';

interface HistoryEntry {
	id: string;
	stage: string;
	substage?: string;
	status: string;
	analyst?: { name?: string; email?: string };
	createdAt: string;
	updatedAt: string;
}

export function HistoryPanel({
	operationId,
	externalId,
}: {
	operationId: string;
	externalId?: string | null;
}) {
	const [items, setItems] = React.useState<HistoryEntry[] | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const qs = externalId ? `?externalId=${encodeURIComponent(externalId)}` : '';
			const res = await apiFetch<WithExchanges<{ items: HistoryEntry[] }>>(
				`/api/operations/${operationId}/history${qs}`,
			);
			setItems(res.items);
			if (res._themis) setExchanges(res._themis);
		} catch (e) {
			setError(e instanceof ApiError ? e.message : (e as Error).message);
			if (e instanceof ApiError && e.exchanges) setExchanges(e.exchanges);
		} finally {
			setLoading(false);
		}
	}

	if (!externalId) {
		return (
			<Callout tone="info">
				El histórico se consulta por <strong>externalId</strong>. Esta operación aún no tiene uno
				asignado (concíliala primero con el write-back).
			</Callout>
		);
	}

	return (
		<div className="space-y-3">
			{items === null && (
				<Button variant="outline" size="sm" onClick={load} disabled={loading}>
					{loading ? <Spinner /> : <History className="size-4" />} Cargar histórico
				</Button>
			)}

			{error && (
				<Callout tone="danger" title="No se pudo cargar el histórico">
					{error}
				</Callout>
			)}

			{items && items.length === 0 && (
				<p className="text-sm text-muted-foreground">Sin entradas de histórico.</p>
			)}

			{items && items.length > 0 && (
				<ol className="relative space-y-4 border-l border-border pl-5">
					{items.map((e) => (
						<li key={e.id} className="relative">
							<span className="absolute -left-[1.42rem] top-1 size-2.5 rounded-full bg-primary" />
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{e.stage}</span>
								{e.substage && <span className="text-sm text-muted-foreground">· {e.substage}</span>}
								<StatusBadge kind="business" value={e.status} />
							</div>
							<div className="text-xs text-muted-foreground">
								{dateTime(e.updatedAt)}
								{e.analyst?.email ? ` · analista: ${e.analyst.name ?? e.analyst.email}` : ''}
							</div>
						</li>
					))}
				</ol>
			)}

			<RequestInspector exchanges={exchanges} title="Histórico en Themis (request / response)" />
		</div>
	);
}
