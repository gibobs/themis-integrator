'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Spinner } from '@/components/ui/spinner';
import { apiFetch, ApiError } from '@/lib/client/api';

/**
 * Vacía el almacén local del integrador (operaciones, progreso del change-feed
 * y log de auditoría) vía POST /api/settings/reset. No toca el backend simulado
 * de Themis, que persiste en otra base de datos.
 */
export function SettingsClient() {
	const router = useRouter();
	const [busy, setBusy] = React.useState(false);
	const [done, setDone] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	async function onReset() {
		const ok = confirm(
			'¿Vaciar el almacén local? Se borrarán todas las operaciones, el progreso del change-feed y el log de auditoría. Esta acción no se puede deshacer.',
		);
		if (!ok) return;
		setError(null);
		setDone(false);
		setBusy(true);
		try {
			await apiFetch<{ ok: boolean }>('/api/settings/reset', { method: 'POST' });
			setDone(true);
			router.refresh();
		} catch (err) {
			setError(err instanceof ApiError ? `${err.code ?? ''} ${err.message}`.trim() : (err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3">
			{done && (
				<Callout tone="success" title="Almacén local vaciado">
					Se han borrado las operaciones, el estado del change-feed y el log de auditoría del
					integrador.
				</Callout>
			)}
			{error && (
				<Callout tone="danger" title="No se pudo vaciar">
					{error}
				</Callout>
			)}

			<Button variant="danger" onClick={onReset} disabled={busy}>
				{busy ? <Spinner /> : <Trash2 className="size-4" />}
				{busy ? 'Vaciando…' : 'Vaciar almacén local'}
			</Button>

			<p className="text-xs text-muted-foreground">
				Solo vacía el almacén del integrador. El backend simulado de Themis (modo mock) persiste
				aparte en <code>themis-mock.db</code>; para reiniciarlo todo por completo, detén el
				servidor y ejecuta <code>yarn db:reset</code>.
			</p>
		</div>
	);
}
