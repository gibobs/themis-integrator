'use client';
import * as React from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/callout';
import { Spinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { CopyButton } from '@/components/copy-button';
import { RequestInspector } from '@/components/request-inspector';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import { shortId } from '@/lib/util/format';
import type {
	ThemisExchange,
	ThemisOperationSyncResult,
	ThemisPendingSyncOperationsResult,
	ThemisSyncStatus,
} from '@/lib/themis';

/**
 * Conciliación en el navegador: carga las operaciones pendientes (autoprescripción
 * sin externalId), deja asignarles tu referencia y las devuelve en lote (write-back).
 */
export function ReconciliationClient() {
	const [items, setItems] = React.useState<{ operationId: string }[]>([]);
	const [externalIds, setExternalIds] = React.useState<Record<string, string>>({});
	const [results, setResults] = React.useState<Record<string, ThemisSyncStatus>>({});
	const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
	const [hasMore, setHasMore] = React.useState(false);
	const [loading, setLoading] = React.useState(true);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	// Acumula una página de pendientes, deduplicando y prellenando un externalId
	// sugerido (`AUTO-n`) para cada operación nueva.
	const ingest = React.useCallback((page: ThemisPendingSyncOperationsResult) => {
		setItems((prev) => {
			const known = new Set(prev.map((i) => i.operationId));
			return [...prev, ...page.items.filter((i) => !known.has(i.operationId))];
		});
		setExternalIds((ids) => {
			const next = { ...ids };
			let n = Object.keys(ids).length + 1;
			for (const it of page.items) {
				if (!next[it.operationId]) next[it.operationId] = `AUTO-${n++}`;
			}
			return next;
		});
		setNextCursor(page.nextCursor);
		setHasMore(page.hasMore);
	}, []);

	const toMessage = (err: unknown) => {
		if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
		return err instanceof ApiError ? `${err.code ?? ''} ${err.message}`.trim() : (err as Error).message;
	};

	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const page = await apiFetch<WithExchanges<ThemisPendingSyncOperationsResult>>(
					'/api/reconciliation/pending',
				);
				if (cancelled) return;
				ingest(page);
				if (page._themis) setExchanges(page._themis);
			} catch (err) {
				if (!cancelled) setError(toMessage(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [ingest]);

	async function loadMore() {
		if (!nextCursor) return;
		setLoadingMore(true);
		setError(null);
		try {
			const page = await apiFetch<WithExchanges<ThemisPendingSyncOperationsResult>>(
				`/api/reconciliation/pending?cursor=${encodeURIComponent(nextCursor)}`,
			);
			ingest(page);
			if (page._themis) setExchanges(page._themis);
		} catch (err) {
			setError(toMessage(err));
		} finally {
			setLoadingMore(false);
		}
	}

	async function onReconcile() {
		const payload = items
			.map((it) => ({ operationId: it.operationId, externalId: (externalIds[it.operationId] ?? '').trim() }))
			.filter((it) => it.externalId.length > 0);
		if (payload.length === 0) {
			setError('Asigna al menos un externalId para poder conciliar.');
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const res = await apiFetch<WithExchanges<ThemisOperationSyncResult>>(
				'/api/reconciliation/write-back',
				{
					method: 'POST',
					body: JSON.stringify({ items: payload }),
				},
			);
			setResults((prev) => {
				const next = { ...prev };
				for (const r of res.items) next[r.operationId] = r.status;
				return next;
			});
			if (res._themis) setExchanges(res._themis);
		} catch (err) {
			setError(toMessage(err));
		} finally {
			setSubmitting(false);
		}
	}

	const assigned = items.filter((it) => (externalIds[it.operationId] ?? '').trim().length > 0).length;

	return (
		<div className="space-y-4">
			{error && (
				<Callout tone="danger" title="Algo ha fallado">
					{error}
				</Callout>
			)}

			<RequestInspector exchanges={exchanges} />

			{loading ? (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Spinner /> Cargando pendientes de conciliar…
				</p>
			) : items.length === 0 ? (
				<Callout tone="info" title="Nada que conciliar">
					No hay autoprescripciones pendientes de conciliar.
				</Callout>
			) : (
				<>
					<div className="rounded-lg border border-border bg-card">
						<Table>
							<THead>
								<TR>
									<TH>operationId</TH>
									<TH>Tu externalId</TH>
									<TH>Resultado</TH>
								</TR>
							</THead>
							<TBody>
								{items.map((it) => (
									<TR key={it.operationId}>
										<TD className="font-mono text-xs">
											<span className="inline-flex items-center gap-1">
												{shortId(it.operationId)}
												<CopyButton value={it.operationId} />
											</span>
										</TD>
										<TD>
											<Input
												value={externalIds[it.operationId] ?? ''}
												onChange={(e) =>
													setExternalIds((ids) => ({ ...ids, [it.operationId]: e.target.value }))
												}
												placeholder="AUTO-1"
												className="max-w-xs"
											/>
										</TD>
										<TD>
											{results[it.operationId] ? (
												<StatusBadge kind="sync" value={results[it.operationId]} />
											) : (
												<span className="text-xs text-muted-foreground">—</span>
											)}
										</TD>
									</TR>
								))}
							</TBody>
						</Table>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2">
						<Button onClick={onReconcile} disabled={submitting}>
							{submitting ? <Spinner /> : <Link2 className="size-4" />}
							{submitting ? 'Conciliando…' : `Conciliar (${assigned})`}
						</Button>
						{hasMore && (
							<Button variant="outline" onClick={loadMore} disabled={loadingMore}>
								{loadingMore ? <Spinner /> : <RefreshCw className="size-4" />}
								Cargar más
							</Button>
						)}
					</div>
				</>
			)}
		</div>
	);
}
