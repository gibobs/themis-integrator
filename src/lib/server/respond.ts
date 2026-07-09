/**
 * Helpers de respuesta para los route handlers (BFF).
 *
 * Convierte errores de Themis (o cualquiera) en `application/problem+json` y
 * registra en el log de auditoría, de modo que la UI recibe siempre el mismo
 * contrato de error que expone Themis.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { ThemisError, type ThemisExchange } from '@/lib/themis';
import { logCall } from '@/lib/db/audit';

/**
 * Adjunta los intercambios HTTP con Themis al cuerpo de respuesta bajo `_themis`,
 * para que la pantalla pueda mostrar request/response (cabeceras + body).
 */
export function withExchanges<T extends object>(
	data: T,
	exchanges: ThemisExchange[],
): T & { _themis: ThemisExchange[] } {
	return { ...data, _themis: exchanges };
}

export function problemResponse(error: unknown, exchanges?: ThemisExchange[]): NextResponse {
	// Adjunta los intercambios también en el error, para que la pantalla muestre
	// la petición que se hizo y la respuesta de error de Themis.
	const attach = <T extends object>(body: T): T | (T & { _themis: ThemisExchange[] }) =>
		exchanges && exchanges.length ? { ...body, _themis: exchanges } : body;

	if (error instanceof ThemisError) {
		return NextResponse.json(attach(error.toJSON()), {
			status: error.status >= 400 ? error.status : 502,
			headers: { 'content-type': 'application/problem+json' },
		});
	}
	const detail = error instanceof Error ? error.message : 'Error inesperado.';
	return NextResponse.json(attach({ status: 500, code: 'INTEGRATOR_ERROR', detail }), {
		status: 500,
		headers: { 'content-type': 'application/problem+json' },
	});
}

/**
 * Ejecuta una llamada a Themis midiendo el tiempo y registrando en auditoría el
 * resultado (status/código). Devuelve lo que devuelva `fn`.
 */
export async function audited<T>(
	meta: { method: string; path: string; note?: string },
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		logCall({ ...meta, status: 200, durationMs: Date.now() - start });
		return result;
	} catch (error) {
		const status = error instanceof ThemisError ? error.status : 500;
		const code = error instanceof ThemisError ? error.code : 'INTEGRATOR_ERROR';
		logCall({ ...meta, status, code, durationMs: Date.now() - start });
		throw error;
	}
}
