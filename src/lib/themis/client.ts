/**
 * Cliente de Themis: compone config + transporte + token y expone un `request`
 * genérico ya autenticado, con manejo de idempotencia y de la cabecera `Prefer`.
 * Sobre él se construyen los métodos de `intake` y `query`.
 */
import 'server-only';
import type { ThemisConfig } from './config';
import { ThemisError } from './errors';
import { createFetchTransport, sendRequest, type Transport } from './http';
import { getAccessToken, invalidateToken } from './token';

export interface RequestOptions {
	method: 'GET' | 'POST';
	path: string;
	body?: unknown;
	query?: Record<string, string | number | undefined>;
	/** Cabecera `Prefer` (RFC 7240), p.ej. `respond-async` o `wait=5`. */
	prefer?: string;
	/** Cabecera `Idempotency-Key` para escrituras. */
	idempotencyKey?: string;
	/** Si es `false`, no adjunta el bearer (endpoints públicos). Default `true`. */
	auth?: boolean;
	/** Token de sesión de handoff (sustituye al bearer M2M). */
	sessionToken?: string;
}

export interface ThemisResponse<T> {
	status: number;
	data: T;
}

export class ThemisClient {
	readonly config: ThemisConfig;
	private readonly transport: Transport;

	constructor(config: ThemisConfig, transport: Transport) {
		this.config = config;
		this.transport = transport;
	}

	private buildPath(path: string, query?: RequestOptions['query']): string {
		if (!query) return path;
		const usp = new URLSearchParams();
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== '') usp.set(key, String(value));
		}
		const qs = usp.toString();
		return qs ? `${path}?${qs}` : path;
	}

	async request<T>(opts: RequestOptions): Promise<ThemisResponse<T>> {
		const headers: Record<string, string> = {};
		if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
		if (opts.prefer) headers['Prefer'] = opts.prefer;
		if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

		if (opts.sessionToken) {
			headers['Authorization'] = `Bearer ${opts.sessionToken}`;
		} else if (opts.auth !== false) {
			const token = await getAccessToken(this.config, this.transport);
			headers['Authorization'] = `Bearer ${token}`;
		}

		const raw = {
			method: opts.method,
			path: this.buildPath(opts.path, opts.query),
			headers,
			body: opts.body,
		};

		try {
			const res = await sendRequest(this.transport, raw);
			return { status: res.status, data: res.body as T };
		} catch (err) {
			// Un 401 puede ser un token caducado en carrera: invalida y reintenta 1 vez.
			if (err instanceof ThemisError && err.status === 401 && opts.auth !== false && !opts.sessionToken) {
				invalidateToken();
				const token = await getAccessToken(this.config, this.transport);
				const res = await sendRequest(this.transport, {
					...raw,
					headers: { ...headers, Authorization: `Bearer ${token}` },
				});
				return { status: res.status, data: res.body as T };
			}
			throw err;
		}
	}
}

/**
 * Crea el transporte adecuado según la config. El transporte mock se importa de
 * forma perezosa para no arrastrarlo en el modo real.
 */
export async function createTransport(config: ThemisConfig): Promise<Transport> {
	if (config.mock) {
		const { createMockTransport } = await import('./mock');
		return createMockTransport();
	}
	return createFetchTransport(config.baseUrl);
}
