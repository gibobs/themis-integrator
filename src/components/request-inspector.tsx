'use client';
import * as React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { JsonView } from '@/components/ui/json-view';
import type { Tone } from '@/lib/status';
import type { ThemisExchange } from '@/lib/themis/exchange';

function statusTone(status: number): Tone {
	if (status === 0) return 'danger';
	if (status >= 500) return 'danger';
	if (status >= 400) return 'warning';
	if (status >= 200) return 'success';
	return 'neutral';
}

function Headers({ headers }: { headers: Record<string, string> }) {
	const entries = Object.entries(headers);
	if (entries.length === 0) return <p className="text-xs text-muted-foreground">(sin cabeceras)</p>;
	return (
		<div className="overflow-x-auto rounded-md border border-border bg-muted/40">
			<table className="w-full text-xs">
				<tbody>
					{entries.map(([k, v]) => (
						<tr key={k} className="border-b border-border last:border-0">
							<td className="whitespace-nowrap px-2 py-1 font-mono font-medium text-muted-foreground">{k}</td>
							<td className="break-all px-2 py-1 font-mono">{v}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function ExchangeBlock({ ex, index }: { ex: ThemisExchange; index: number }) {
	return (
		<details className="rounded-md border border-border" open={index === 0}>
			<summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
				<Badge tone="neutral" className="font-mono">
					{ex.method}
				</Badge>
				<span className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{ex.url}</span>
				<Badge tone={statusTone(ex.status)}>{ex.error ? 'ERROR' : ex.status}</Badge>
				<span className="text-xs text-muted-foreground">{ex.durationMs} ms</span>
			</summary>
			<div className="space-y-3 border-t border-border p-3">
				<div className="space-y-1.5">
					<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<ArrowUpRight className="size-3.5" /> Request
					</p>
					<Headers headers={ex.requestHeaders} />
					{ex.requestBody !== undefined && <JsonView data={ex.requestBody} />}
				</div>
				<div className="space-y-1.5">
					<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						<ArrowDownLeft className="size-3.5" /> Response
					</p>
					{ex.error ? (
						<p className="text-xs text-danger">{ex.error}</p>
					) : (
						<>
							<Headers headers={ex.responseHeaders} />
							{ex.responseBody !== undefined && <JsonView data={ex.responseBody} />}
						</>
					)}
				</div>
			</div>
		</details>
	);
}

/**
 * Desplegable que muestra los intercambios HTTP con Themis (request + response,
 * cabeceras y body) de la pantalla actual. Los secretos ya vienen redactados.
 */
export function RequestInspector({
	exchanges,
	title = 'Petición(es) a Themis (request / response)',
	className,
}: {
	exchanges: ThemisExchange[] | undefined;
	title?: string;
	className?: string;
}) {
	if (!exchanges || exchanges.length === 0) return null;
	return (
		<details className={`rounded-lg border border-border bg-card p-4 ${className ?? ''}`}>
			<summary className="cursor-pointer text-sm font-medium">
				{title} <span className="text-muted-foreground">· {exchanges.length}</span>
			</summary>
			<p className="mt-2 text-xs text-muted-foreground">
				Lo que este integrador envía y recibe de Themis. El bearer y los secretos M2M aparecen
				redactados.
			</p>
			<div className="mt-3 space-y-2">
				{exchanges.map((ex, i) => (
					<ExchangeBlock key={i} ex={ex} index={i} />
				))}
			</div>
		</details>
	);
}
