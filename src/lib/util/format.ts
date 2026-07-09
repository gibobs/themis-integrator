/** Formateo consistente de importes, fechas e identificadores en la UI. */

const eurFmt = new Intl.NumberFormat('es-ES', {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0,
});

export function eur(value: number | null | undefined): string {
	if (value == null) return '—';
	return eurFmt.format(value);
}

export function dateTime(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

export function dateShort(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('es-ES', { dateStyle: 'medium' });
}

/** Acorta un id largo (ULID) para mostrarlo: `01J8Z9K3…SEED01`. */
export function shortId(id: string | null | undefined): string {
	if (!id) return '—';
	if (id.length <= 14) return id;
	return `${id.slice(0, 8)}…${id.slice(-6)}`;
}
