/**
 * Mapeos de estado → tono visual + etiqueta. Compartido por toda la UI para que
 * los colores de estados de alta, de negocio y de conciliación sean coherentes.
 */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const creationStatusMeta: Record<string, { tone: Tone; label: string }> = {
	PENDING: { tone: 'neutral', label: 'Pendiente de envío' },
	RECEIVED: { tone: 'info', label: 'Recibida' },
	PROCESSING: { tone: 'warning', label: 'Procesando' },
	PROCESSED: { tone: 'success', label: 'Procesada' },
	FAILED: { tone: 'danger', label: 'Fallida' },
};

export const businessStatusMeta: Record<string, { tone: Tone; label: string }> = {
	active: { tone: 'success', label: 'Activa' },
	postpone: { tone: 'warning', label: 'Pospuesta' },
	finish: { tone: 'neutral', label: 'Finalizada' },
};

export const syncStatusMeta: Record<string, { tone: Tone; label: string }> = {
	LINKED: { tone: 'success', label: 'Enlazada' },
	ALREADY_LINKED: { tone: 'info', label: 'Ya enlazada' },
	NOT_FOUND: { tone: 'danger', label: 'No encontrada' },
	CONFLICT: { tone: 'danger', label: 'Conflicto' },
};

export const documentStatusMeta: Record<string, { tone: Tone; label: string }> = {
	PENDING: { tone: 'neutral', label: 'Pendiente' },
	NO_LABELED: { tone: 'warning', label: 'Sin etiquetar' },
	LABELED: { tone: 'info', label: 'Etiquetado' },
	VERIFIED: { tone: 'success', label: 'Verificado' },
};

export const originMeta: Record<string, { tone: Tone; label: string }> = {
	INTAKE: { tone: 'primary', label: 'Intake (tuya)' },
	AUTOPRESCRIPTION: { tone: 'info', label: 'Autoprescripción' },
};

export const typeMeta: Record<string, { label: string }> = {
	MORTGAGE: { label: 'Hipoteca' },
	SUBROGATION: { label: 'Subrogación' },
};

export function meta(
	table: Record<string, { tone: Tone; label: string }>,
	key: string | null | undefined,
): { tone: Tone; label: string } {
	if (!key) return { tone: 'neutral', label: '—' };
	return table[key] ?? { tone: 'neutral', label: key };
}
