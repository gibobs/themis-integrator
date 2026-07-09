/**
 * Gestión del token M2M.
 *
 * Canjea las credenciales por un `access_token` (JWT, ~60 min, sin refresh) y
 * lo cachea en memoria del proceso hasta poco antes de su expiración. Reutilizar
 * el token vigente es lo esperado; no se pide uno por petición.
 */
import 'server-only';
import type { ThemisConfig } from './config';
import { ThemisError } from './errors';
import { sendRequest, type Transport } from './http';
import type { ThemisTokenResponse } from './types';

interface CachedToken {
	accessToken: string;
	/** epoch ms en el que dejamos de considerarlo válido (con margen). */
	expiresAt: number;
}

/** Margen de seguridad antes de la expiración real (30 s). */
const EXPIRY_SKEW_MS = 30_000;

let cache: CachedToken | null = null;

/** Fuerza un nuevo canje en la próxima llamada (p.ej. tras un 401). */
export function invalidateToken(): void {
	cache = null;
}

export async function getAccessToken(cfg: ThemisConfig, transport: Transport): Promise<string> {
	if (cfg.mock) return 'mock-access-token';

	if (cache && cache.expiresAt > Date.now()) return cache.accessToken;

	if (!cfg.apiKey || !cfg.apiSecret || !cfg.token) {
		throw new ThemisError({
			status: 0,
			code: 'THEMIS_UNAUTHENTICATED',
			detail:
				'Faltan credenciales M2M (THEMIS_API_KEY / THEMIS_API_SECRET / THEMIS_TOKEN). ' +
				'Configúralas o activa THEMIS_MOCK=1.',
		});
	}

	const res = await sendRequest(transport, {
		method: 'POST',
		path: '/themis/auth/v1/token',
		headers: { 'Content-Type': 'application/json' },
		body: { apiKey: cfg.apiKey, apiSecret: cfg.apiSecret, token: cfg.token },
	});

	const data = res.body as ThemisTokenResponse;
	if (!data?.access_token) {
		throw new ThemisError({ status: 500, code: 'THEMIS_TRANSPORT', detail: 'Respuesta de token inválida.' });
	}

	cache = {
		accessToken: data.access_token,
		expiresAt: Date.now() + Math.max(0, data.expires_in * 1000 - EXPIRY_SKEW_MS),
	};
	return cache.accessToken;
}
