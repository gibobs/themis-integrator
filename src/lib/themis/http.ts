/**
 * Transporte HTTP de bajo nivel para Themis.
 *
 * - Un `Transport` recibe una petición cruda y devuelve una respuesta cruda sin
 *   lanzar por status HTTP (solo lanza ante fallo de red). Hay dos: el real
 *   (fetch) y el mock (simulación en local). El cliente elige uno según config.
 * - `sendRequest` construye el `ThemisError` a partir de la respuesta cruda y
 *   aplica reintentos con backoff exponencial respetando `Retry-After`/429/5xx.
 */
import 'server-only';
import { ThemisError, themisProblemFromBody } from './errors';
import type { ThemisExchange } from './exchange';

export interface RawRequest {
	method: 'GET' | 'POST';
	/** Ruta absoluta desde la raíz, p.ej. `/themis/intake/v1/operations`. */
	path: string;
	headers: Record<string, string>;
	body?: unknown;
}

export interface RawResponse {
	status: number;
	headers: Record<string, string>;
	body: unknown;
}

export type Transport = (req: RawRequest) => Promise<RawResponse>;

/** Transporte real contra la URL base del entorno configurado. */
export function createFetchTransport(baseUrl: string): Transport {
	return async (req) => {
		let res: Response;
		try {
			res = await fetch(baseUrl.replace(/\/$/, '') + req.path, {
				method: req.method,
				headers: { Accept: 'application/json', ...req.headers },
				body: req.body === undefined ? undefined : JSON.stringify(req.body),
				cache: 'no-store',
			});
		} catch (cause) {
			throw new ThemisError({
				status: 0,
				code: 'THEMIS_TRANSPORT',
				detail: `No se pudo contactar con Themis: ${(cause as Error).message}`,
			});
		}

		const headers: Record<string, string> = {};
		res.headers.forEach((v, k) => (headers[k] = v));

		let body: unknown;
		const text = await res.text();
		if (text) {
			try {
				body = JSON.parse(text);
			} catch {
				body = text;
			}
		}
		return { status: res.status, headers, body };
	};
}

export interface SendOptions {
	/** Nº máximo de reintentos ante 429/5xx/transporte (default 4). */
	maxRetries?: number;
	/** Base del backoff en ms (default 300). */
	baseDelayMs?: number;
	/** Inyectable en tests/mock para no dormir de verdad. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ejecuta una petición y devuelve la respuesta cruda de éxito (2xx), o lanza un
 * `ThemisError`. Reintenta 429/5xx/transporte con backoff exponencial.
 */
export async function sendRequest(
	transport: Transport,
	req: RawRequest,
	opts: SendOptions = {},
): Promise<RawResponse> {
	const maxRetries = opts.maxRetries ?? 4;
	const baseDelay = opts.baseDelayMs ?? 300;
	const sleep = opts.sleep ?? defaultSleep;

	let attempt = 0;
	while (true) {
		const res = await transport(req);
		if (res.status < 400) return res;

		const retryAfterHeader = res.headers['retry-after'];
		const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
		const error = new ThemisError({
			status: res.status,
			problem: themisProblemFromBody(res.status, res.body),
			retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
		});

		if (!error.isRetryable || attempt >= maxRetries) throw error;

		// backoff: Retry-After si viene; si no, exponencial con jitter.
		const backoff =
			error.retryAfter !== undefined
				? error.retryAfter * 1000
				: baseDelay * 2 ** attempt + Math.floor(Math.random() * 100);
		await sleep(backoff);
		attempt += 1;
	}
}

// ── Captura de intercambios para la UI (con redacción de secretos) ───────────

const REDACTED = '«redactado»';

function redactHeaders(headers: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key] = key.toLowerCase() === 'authorization' ? `${value.split(' ')[0] ?? 'Bearer'} ${REDACTED}` : value;
	}
	return out;
}

function redactBody(path: string, body: unknown): unknown {
	if (body && typeof body === 'object' && path.includes('/auth/v1/token')) {
		const b = body as Record<string, unknown>;
		return {
			...b,
			apiSecret: b.apiSecret !== undefined ? REDACTED : undefined,
			token: b.token !== undefined ? REDACTED : undefined,
		};
	}
	return body;
}

/**
 * Envuelve un transporte para registrar cada intercambio (request/response) en
 * `sink`, redactando credenciales. Así el integrador ve exactamente qué petición
 * se hace y qué se recibe, sin exponer el bearer ni los secretos M2M.
 */
export function withCapture(inner: Transport, baseUrl: string, sink: ThemisExchange[]): Transport {
	const root = baseUrl.replace(/\/$/, '');
	return async (req) => {
		const start = Date.now();
		const common = {
			method: req.method,
			url: root + req.path,
			path: req.path,
			requestHeaders: redactHeaders(req.headers),
			requestBody: redactBody(req.path, req.body),
		};
		try {
			const res = await inner(req);
			sink.push({
				...common,
				status: res.status,
				responseHeaders: res.headers,
				responseBody: res.body,
				durationMs: Date.now() - start,
			});
			return res;
		} catch (err) {
			sink.push({
				...common,
				status: 0,
				responseHeaders: {},
				durationMs: Date.now() - start,
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};
}
