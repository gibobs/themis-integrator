'use client';
import * as React from 'react';
import { Repeat, Send } from 'lucide-react';
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
import type {
	ThemisExchange,
	ThemisOperationResource,
	ThemisWebhookEventAcceptedResource,
} from '@/lib/themis';
import { shortId } from '@/lib/util/format';

/** Forma del evento tal y como lo serializa `GET /api/webhooks` (almacén local). */
interface WebhookEventRow {
	id: number;
	operationId: string;
	sourceEventId: number;
	type: string;
	occurredAt: string | null;
	payload: { underwritingCaseId?: string; processedAt?: string } & Record<string, unknown>;
	eventRef: string | null;
	receivedAt: string | null;
	outcome: string;
	httpStatus: number | null;
	createdAt: string;
	updatedAt: string;
}

interface PushResponse {
	event: WebhookEventRow;
	outcome: string;
	sourceEventId: number;
	accepted: ThemisWebhookEventAcceptedResource;
}

const DEFAULT_TYPE = 'UNDERWRITING_CASE_ASSIGNED';

export function WebhooksClient({ initialOperationId }: { initialOperationId: string }) {
	const [operations, setOperations] = React.useState<ThemisOperationResource[]>([]);
	const [operationId, setOperationId] = React.useState(initialOperationId);
	const [underwritingCaseId, setUnderwritingCaseId] = React.useState('EXP-2026-1');
	const [processedAt, setProcessedAt] = React.useState(() => new Date().toISOString());
	const [sourceEventId, setSourceEventId] = React.useState('');
	const [events, setEvents] = React.useState<WebhookEventRow[]>([]);
	const [submitting, setSubmitting] = React.useState(false);
	const [resendingId, setResendingId] = React.useState<number | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [exchanges, setExchanges] = React.useState<ThemisExchange[]>([]);

	const toMessage = React.useCallback((err: unknown) => {
		if (err instanceof ApiError && err.exchanges) setExchanges(err.exchanges);
		return err instanceof ApiError
			? `${err.code ?? ''} ${err.message}`.trim()
			: (err as Error).message;
	}, []);

	/** Siguiente sourceEventId sugerido para una operación (máximo local + 1). */
	const suggestFor = React.useCallback(
		(opId: string, list: WebhookEventRow[]): number => {
			const max = list
				.filter((e) => e.operationId === opId)
				.reduce((acc, e) => Math.max(acc, e.sourceEventId), 0);
			return max + 1;
		},
		[],
	);

	const loadEvents = React.useCallback(async (): Promise<WebhookEventRow[]> => {
		const res = await apiFetch<{ items: WebhookEventRow[] }>('/api/webhooks');
		setEvents(res.items);
		return res.items;
	}, []);

	// Carga inicial: operaciones (para el selector) e historial de eventos.
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [ops, hist] = await Promise.all([
					apiFetch<WithExchanges<{ items: ThemisOperationResource[] }>>(
						'/api/operations?linked=ALL&limit=100&sort=DESC',
					),
					apiFetch<{ items: WebhookEventRow[] }>('/api/webhooks'),
				]);
				if (cancelled) return;
				setOperations(ops.items);
				setEvents(hist.items);
			} catch (err) {
				if (!cancelled) setError(toMessage(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [toMessage]);

	// Sugerencia **derivada** (sin efecto): el máximo local + 1 para la operación.
	// El campo es editable; mientras el usuario no lo sobrescriba (estado ''), el
	// input muestra la sugerencia y el envío deja que el BFF la autogestione.
	const suggestion = React.useMemo(
		() => (operationId ? suggestFor(operationId, events) : 1),
		[operationId, events, suggestFor],
	);
	const sidValue = sourceEventId === '' ? String(suggestion) : sourceEventId;

	async function pushEvent(payload: {
		operationId: string;
		sourceEventId?: number;
		underwritingCaseId: string;
		processedAt: string;
	}) {
		setError(null);
		try {
			const res = await apiFetch<WithExchanges<PushResponse>>('/api/webhooks', {
				method: 'POST',
				body: JSON.stringify({
					operationId: payload.operationId,
					sourceEventId: payload.sourceEventId,
					payload: {
						underwritingCaseId: payload.underwritingCaseId,
						processedAt: payload.processedAt,
					},
				}),
			});
			setExchanges(res._themis ?? []);
			await loadEvents();
			setSourceEventId(''); // vuelve a la sugerencia, recalculada con el nuevo historial
		} catch (err) {
			setError(toMessage(err));
		}
	}

	async function onPush() {
		if (!operationId) {
			setError('Elige una operación para empujar el evento.');
			return;
		}
		setSubmitting(true);
		// sourceEventId vacío ⇒ que lo autogestione el BFF; si no, el valor editado.
		const sid = sourceEventId.trim() === '' ? undefined : Number(sourceEventId);
		await pushEvent({ operationId, sourceEventId: sid, underwritingCaseId, processedAt });
		setSubmitting(false);
	}

	async function onResend(row: WebhookEventRow) {
		setResendingId(row.id);
		// Reenvío idempotente: mismo (operationId, sourceEventId) y mismo payload.
		await pushEvent({
			operationId: row.operationId,
			sourceEventId: row.sourceEventId,
			underwritingCaseId: row.payload.underwritingCaseId ?? '',
			processedAt: row.payload.processedAt ?? '',
		});
		setResendingId(null);
	}

	// El selector incluye la operación preseleccionada aunque no esté en el listado.
	const options = React.useMemo(() => {
		const list = operations.map((o) => ({
			operationId: o.operationId,
			label: o.name ? `${o.name} · ${shortId(o.operationId)}` : shortId(o.operationId),
		}));
		if (operationId && !list.some((o) => o.operationId === operationId)) {
			list.unshift({ operationId, label: `${shortId(operationId)} (preseleccionada)` });
		}
		return list;
	}, [operations, operationId]);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Empujar evento</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2">
						<div className="space-y-1">
							<Label htmlFor="operationId">Operación</Label>
							<Select
								id="operationId"
								value={operationId}
								onChange={(e) => {
									setOperationId(e.target.value);
									setSourceEventId('');
								}}
							>
								<option value="">Elige una operación…</option>
								{options.map((o) => (
									<option key={o.operationId} value={o.operationId}>
										{o.label}
									</option>
								))}
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="type">Tipo de evento</Label>
							<Input id="type" value={DEFAULT_TYPE} readOnly className="font-mono text-xs" />
						</div>
						<div className="space-y-1">
							<Label htmlFor="underwritingCaseId">underwritingCaseId</Label>
							<Input
								id="underwritingCaseId"
								placeholder="EXP-2026-1"
								value={underwritingCaseId}
								onChange={(e) => setUnderwritingCaseId(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="processedAt">processedAt</Label>
							<Input
								id="processedAt"
								value={processedAt}
								onChange={(e) => setProcessedAt(e.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="sourceEventId">sourceEventId (sugerido, editable)</Label>
							<Input
								id="sourceEventId"
								type="number"
								min={1}
								value={sidValue}
								onChange={(e) => setSourceEventId(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Repite el último para un <strong>replay</strong>; baja el valor para simular{' '}
								<strong>fuera de orden</strong>.
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={onPush} disabled={submitting}>
							{submitting ? <Spinner /> : <Send className="size-4" />}
							Empujar evento
						</Button>
					</div>
				</CardContent>
			</Card>

			{error && (
				<Callout tone="danger" title="No se pudo empujar el evento">
					{error}
				</Callout>
			)}

			<RequestInspector exchanges={exchanges} title="Emisión del evento a Themis (request / response)" />

			<div className="rounded-lg border border-border bg-card">
				<Table>
					<THead>
						<TR>
							<TH>operationId</TH>
							<TH>sourceEventId</TH>
							<TH>Tipo</TH>
							<TH>underwritingCaseId</TH>
							<TH>eventRef</TH>
							<TH>Resultado</TH>
							<TH>Acción</TH>
						</TR>
					</THead>
					<TBody>
						{events.length === 0 && (
							<TR>
								<TD className="py-8 text-center text-muted-foreground" colSpan={7}>
									Aún no has empujado ningún evento.
								</TD>
							</TR>
						)}
						{events.map((e) => (
							<TR key={e.id}>
								<TD className="font-mono text-xs">
									<span className="inline-flex items-center gap-1">
										{shortId(e.operationId)}
										<CopyButton value={e.operationId} />
									</span>
								</TD>
								<TD className="font-mono text-xs">{e.sourceEventId}</TD>
								<TD className="font-mono text-xs">{e.type}</TD>
								<TD className="font-mono text-xs">{e.payload.underwritingCaseId ?? '—'}</TD>
								<TD className="font-mono text-xs">
									{e.eventRef ? (
										<span className="inline-flex items-center gap-1">
											{shortId(e.eventRef)}
											<CopyButton value={e.eventRef} />
										</span>
									) : (
										'—'
									)}
								</TD>
								<TD>
									<StatusBadge kind="webhookOutcome" value={e.outcome} />
								</TD>
								<TD>
									<Button
										variant="outline"
										size="sm"
										onClick={() => onResend(e)}
										disabled={resendingId === e.id}
									>
										{resendingId === e.id ? <Spinner /> : <Repeat className="size-4" />}
										Reenviar
									</Button>
								</TD>
							</TR>
						))}
					</TBody>
				</Table>
			</div>
		</div>
	);
}
