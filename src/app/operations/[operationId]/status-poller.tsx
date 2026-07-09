'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Callout } from '@/components/ui/callout';
import { RequestInspector } from '@/components/request-inspector';
import { cn } from '@/lib/util/cn';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange } from '@/lib/themis';
import { backoffSchedule, sleep } from '@/lib/util/backoff';

interface CreationStatus {
	operationId: string;
	status: 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'PENDING';
	error?: string;
	errorType?: string;
}

const STEPS = ['RECEIVED', 'PROCESSING', 'PROCESSED'] as const;
const LABELS: Record<string, string> = {
	PENDING: 'Pendiente',
	RECEIVED: 'Recibida',
	PROCESSING: 'Procesando',
	PROCESSED: 'Procesada',
	FAILED: 'Fallida',
};

/**
 * Sondea el estado del alta con backoff hasta un estado terminal. Al llegar a
 * PROCESSED refresca la página para cargar el detalle; en FAILED muestra el error.
 */
export function StatusPoller({
	operationId,
	initialStatus,
}: {
	operationId: string;
	initialStatus: string;
}) {
	const router = useRouter();
	const [status, setStatus] = React.useState<CreationStatus['status']>(
		(initialStatus as CreationStatus['status']) || 'RECEIVED',
	);
	const [error, setError] = React.useState<string | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);
	const [live, setLive] = React.useState(
		() => initialStatus !== 'PROCESSED' && initialStatus !== 'FAILED',
	);

	React.useEffect(() => {
		if (status === 'PROCESSED' || status === 'FAILED') return;
		let cancelled = false;
		let attempt = 0;
		(async () => {
			while (!cancelled) {
				try {
					const s = await apiFetch<WithExchanges<CreationStatus>>(
						`/api/operations/${operationId}/status`,
					);
					if (cancelled) return;
					setStatus(s.status);
					if (s._themis) setExchanges(s._themis);
					if (s.status === 'PROCESSED') {
						setLive(false);
						router.refresh();
						return;
					}
					if (s.status === 'FAILED') {
						setLive(false);
						setError(`${s.errorType ?? 'FAILED'}: ${s.error ?? 'El alta no se pudo completar.'}`);
						return;
					}
				} catch (err) {
					// error transitorio: seguimos sondeando con backoff, pero mostramos el intercambio
					if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
				}
				await sleep(backoffSchedule(attempt++, { baseMs: 1200, maxMs: 8000 }));
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [operationId]);

	const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);
	const failed = status === 'FAILED';

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				{STEPS.map((step, i) => {
					const done = !failed && currentIndex > i;
					const active = !failed && currentIndex === i;
					return (
						<React.Fragment key={step}>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
										done && 'border-success bg-success/15 text-success',
										active && 'border-primary bg-accent text-accent-foreground',
										!done && !active && 'border-border text-muted-foreground',
									)}
								>
									{done ? <Check className="size-4" /> : active && live ? <Spinner /> : i + 1}
								</span>
								<span className={cn('text-sm', active ? 'font-medium' : 'text-muted-foreground')}>
									{LABELS[step]}
								</span>
							</div>
							{i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
						</React.Fragment>
					);
				})}
			</div>

			{live && (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<RefreshCw className="size-3 animate-spin" /> Sondeando el estado con backoff (lecturas
					periódicas hasta un estado terminal)…
				</p>
			)}

			{failed && (
				<Callout tone="danger" title="El alta ha fallado">
					<span className="flex items-center gap-2">
						<CircleAlert className="size-4" /> {error}
					</span>
				</Callout>
			)}

			<RequestInspector exchanges={exchanges} title="Estado del alta en Themis (request / response)" />
		</div>
	);
}
