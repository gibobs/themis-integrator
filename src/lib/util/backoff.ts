/**
 * Utilidades de espera creciente (backoff) para el sondeo de estado desde el
 * cliente. El transporte del SDK ya reintenta 429/5xx; esto es para el bucle de
 * "consulta el estado hasta que sea terminal" del navegador.
 */

/** Secuencia de esperas (ms) con backoff exponencial acotado. */
export function backoffSchedule(
	attempt: number,
	{ baseMs = 1000, maxMs = 15_000 }: { baseMs?: number; maxMs?: number } = {},
): number {
	return Math.min(maxMs, baseMs * 2 ** attempt);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
