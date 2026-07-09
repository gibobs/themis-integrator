'use client';
import * as React from 'react';
import { Check, CircleAlert, PartyPopper, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JsonView } from '@/components/ui/json-view';
import { RequestInspector } from '@/components/request-inspector';
import { cn } from '@/lib/util/cn';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange } from '@/lib/themis';
import { backoffSchedule, sleep } from '@/lib/util/backoff';

interface CreationStatus {
	operationId?: string;
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

/** Extrae de forma tolerante el sessionToken del canje (el contrato de handoff
 * está en definición, así que aceptamos varios nombres de campo). */
function pickSessionToken(r: Record<string, unknown>): string | undefined {
	return (r.sessionToken ?? r.session_token ?? r.access_token ?? r.token) as string | undefined;
}
function pickOperationId(r: Record<string, unknown>): string | undefined {
	return (r.operationId ?? r.operation_id) as string | undefined;
}

/**
 * Landing de continuación del handoff (simula la parte del cliente en la webapp).
 * Canjea el launchToken de un solo uso por un sessionToken y sondea con él el
 * estado del alta hasta un estado terminal.
 */
export function HandoffLandingClient({
	launchToken,
	operationIdHint,
}: {
	launchToken: string;
	operationIdHint?: string;
}) {
	const [status, setStatus] = React.useState<CreationStatus['status']>('RECEIVED');
	const [operationId, setOperationId] = React.useState<string | null>(operationIdHint ?? null);
	const [live, setLive] = React.useState(Boolean(launchToken));
	const [error, setError] = React.useState<string | null>(null);
	const [redeemError, setRedeemError] = React.useState<string | null>(null);
	const [rawRedeem, setRawRedeem] = React.useState<unknown>(null);
	const [noPoll, setNoPoll] = React.useState(false);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	React.useEffect(() => {
		if (!launchToken) return;
		let cancelled = false;
		(async () => {
			let sessionToken: string;
			let opId: string | undefined;

			// 1) Canje single-use del launchToken → sessionToken de handoff.
			try {
				const redeemed = await apiFetch<WithExchanges<Record<string, unknown>>>(
					'/api/handoff/redeem',
					{
						method: 'POST',
						body: JSON.stringify({ launchToken }),
					},
				);
				if (cancelled) return;
				setRawRedeem(redeemed);
				if (redeemed._themis) setExchanges((prev) => [...prev, ...redeemed._themis!]);
				const token = pickSessionToken(redeemed);
				opId = pickOperationId(redeemed) ?? operationIdHint;
				if (!token) {
					setLive(false);
					setError('El canje no devolvió un sessionToken reconocible.');
					return;
				}
				sessionToken = token;
				if (opId) setOperationId(opId);
				if (!opId) {
					// Canje OK pero sin operationId: no podemos sondear el estado.
					setLive(false);
					setNoPoll(true);
					return;
				}
			} catch (err) {
				if (cancelled) return;
				setLive(false);
				if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
				if (err instanceof ApiError && err.status === 401) {
					setRedeemError(
						'Este enlace ya se ha usado o ha caducado. Los enlaces de continuación son de un solo uso: vuelve a originar la operación para generar uno nuevo.',
					);
					return;
				}
				setError(
					err instanceof ApiError ? `${err.code ?? ''} ${err.message}`.trim() : (err as Error).message,
				);
				return;
			}

			// 2) Sondeo del estado con la sesión de handoff, con backoff.
			let attempt = 0;
			while (!cancelled) {
				try {
					const s = await apiFetch<WithExchanges<CreationStatus>>(
						`/api/handoff/status?operationId=${encodeURIComponent(opId)}&sessionToken=${encodeURIComponent(sessionToken)}`,
					);
					if (cancelled) return;
					setStatus(s.status);
					if (s._themis) setExchanges((prev) => [...prev, ...s._themis!]);
					if (s.status === 'PROCESSED') {
						setLive(false);
						return;
					}
					if (s.status === 'FAILED') {
						setLive(false);
						setError(`${s.errorType ?? 'FAILED'}: ${s.error ?? 'El alta no se pudo completar.'}`);
						return;
					}
				} catch (err) {
					// error transitorio: seguimos sondeando con backoff, mostrando el intercambio
					if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
				}
				await sleep(backoffSchedule(attempt++, { baseMs: 1200, maxMs: 8000 }));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [launchToken, operationIdHint]);

	if (redeemError) {
		return (
			<div className="space-y-4">
				<Callout tone="danger" title="No se pudo abrir tu solicitud">
					<span className="flex items-center gap-2">
						<CircleAlert className="size-4" /> {redeemError}
					</span>
				</Callout>
				<RequestInspector
					exchanges={exchanges}
					title="Handoff en Themis (canje + estado, request / response)"
				/>
			</div>
		);
	}

	const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);
	const failed = status === 'FAILED';
	const done = status === 'PROCESSED';

	return (
		<Card>
			<CardHeader>
				<CardTitle>Estado de tu solicitud</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3">
					{STEPS.map((step, i) => {
						const stepDone = !failed && currentIndex > i;
						const active = !failed && currentIndex === i;
						return (
							<React.Fragment key={step}>
								<div className="flex items-center gap-2">
									<span
										className={cn(
											'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
											stepDone && 'border-success bg-success/15 text-success',
											active && 'border-primary bg-accent text-accent-foreground',
											!stepDone && !active && 'border-border text-muted-foreground',
										)}
									>
										{stepDone ? <Check className="size-4" /> : active && live ? <Spinner /> : i + 1}
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

				{operationId && (
					<p className="text-xs text-muted-foreground">
						Referencia: <span className="font-mono">{operationId}</span>
					</p>
				)}

				{live && (
					<p className="flex items-center gap-2 text-xs text-muted-foreground">
						<RefreshCw className="size-3 animate-spin" /> Estamos procesando tu solicitud (lecturas
						periódicas hasta un estado terminal)…
					</p>
				)}

				{noPoll && (
					<Callout tone="warn" title="Canje correcto, sin operationId para sondear">
						El canje del launchToken devolvió un <strong>sessionToken</strong> pero no un{' '}
						<code>operationId</code>, así que no se puede sondear el estado del alta desde aquí. El
						contrato exacto del handoff está en definición; abajo tienes la respuesta cruda del canje
						para diagnosticar.
						<div className="mt-2">
							<JsonView data={rawRedeem} />
						</div>
					</Callout>
				)}

				{done && (
					<Callout tone="success" title="Alta completada">
						<span className="flex items-center gap-2">
							<PartyPopper className="size-4" /> Tu solicitud se ha completado correctamente. Ya
							puedes cerrar esta ventana.
						</span>
					</Callout>
				)}

				{failed && (
					<Callout tone="danger" title="Tu solicitud no se pudo completar">
						<span className="flex items-center gap-2">
							<CircleAlert className="size-4" /> {error ?? 'El alta ha fallado.'}
						</span>
					</Callout>
				)}

				{error && !failed && (
					<Callout tone="danger" title="Algo ha ido mal">
						<span className="flex items-center gap-2">
							<CircleAlert className="size-4" /> {error}
						</span>
					</Callout>
				)}

				<RequestInspector
					exchanges={exchanges}
					title="Handoff en Themis (canje + estado, request / response)"
				/>
			</CardContent>
		</Card>
	);
}
