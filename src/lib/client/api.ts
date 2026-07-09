'use client';
/**
 * Cliente de fetch para el navegador → rutas BFF del integrador.
 *
 * Nunca llama a Themis directamente: el navegador no ve credenciales ni tokens.
 * Propaga los errores `problem+json` como `ApiError` con su `code`.
 */
import type { ThemisExchange } from '@/lib/themis/exchange';

/** Respuestas BFF que además adjuntan los intercambios con Themis en `_themis`. */
export type WithExchanges<T> = T & { _themis?: ThemisExchange[] };

export interface ApiProblem {
	status: number;
	code?: string;
	detail?: string;
	title?: string;
	/** Intercambios con Themis, presentes también en los errores. */
	_themis?: ThemisExchange[];
}

export class ApiError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly problem: ApiProblem;
	/** Intercambios con Themis capturados durante la petición fallida (si los hay). */
	readonly exchanges?: ThemisExchange[];
	constructor(problem: ApiProblem) {
		super(problem.detail ?? problem.title ?? `Error ${problem.status}`);
		this.name = 'ApiError';
		this.status = problem.status;
		this.code = problem.code;
		this.problem = problem;
		this.exchanges = problem._themis;
	}
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {}),
		},
	});
	const text = await res.text();
	const data = text ? JSON.parse(text) : undefined;
	if (!res.ok) {
		throw new ApiError(
			(data as ApiProblem | undefined) ?? { status: res.status, detail: res.statusText },
		);
	}
	return data as T;
}
