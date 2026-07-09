/**
 * Registro de un intercambio HTTP con Themis (request + response), pensado para
 * mostrárselo al integrador en la UI. Módulo sin `server-only`: el tipo lo usan
 * tanto el SDK (servidor) como los componentes de inspección (cliente).
 *
 * Los valores sensibles (bearer, secretos del canje de token) se **redactan**
 * antes de construir este objeto.
 */
export interface ThemisExchange {
	method: string;
	/** URL absoluta que se llamaría en el entorno configurado. */
	url: string;
	path: string;
	requestHeaders: Record<string, string>;
	requestBody?: unknown;
	status: number;
	responseHeaders: Record<string, string>;
	responseBody?: unknown;
	durationMs: number;
	/** Etiqueta legible del propósito de la llamada (p. ej. "alta", "listado"). */
	note?: string;
	/** Mensaje de error de transporte, si la llamada ni siquiera obtuvo respuesta. */
	error?: string;
}
