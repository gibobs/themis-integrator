/**
 * Resolución de configuración de Themis desde el entorno.
 *
 * `server-only`: nunca debe llegar al bundle del navegador (contiene el secreto
 * de las credenciales M2M).
 */
import 'server-only';

export type ThemisEnvName = 'development' | 'staging' | 'production';

const BASE_URLS: Record<ThemisEnvName, string> = {
	development: 'https://dev.api.gibobs.net',
	staging: 'https://staging.api.gibobs.net',
	production: 'https://api.gibobs.com',
};

export interface ThemisConfig {
	env: ThemisEnvName;
	baseUrl: string;
	mock: boolean;
	apiKey: string;
	apiSecret: string;
	token: string;
}

function normalizeEnv(value: string | undefined): ThemisEnvName {
	if (value === 'staging' || value === 'production') return value;
	return 'development';
}

export function getThemisConfig(): ThemisConfig {
	const env = normalizeEnv(process.env.THEMIS_ENV);
	const mock = process.env.THEMIS_MOCK !== '0';
	return {
		env,
		baseUrl: BASE_URLS[env],
		mock,
		apiKey: process.env.THEMIS_API_KEY ?? '',
		apiSecret: process.env.THEMIS_API_SECRET ?? '',
		token: process.env.THEMIS_TOKEN ?? '',
	};
}

/** ¿Hay credenciales suficientes para el modo real? */
export function hasCredentials(cfg: ThemisConfig): boolean {
	return Boolean(cfg.apiKey && cfg.apiSecret && cfg.token);
}
