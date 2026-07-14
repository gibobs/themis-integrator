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

export interface EstigiaConfig {
	/** URL base (origin) de la app de cliente Estigia. Vacía si no está configurada. */
	baseUrl: string;
}

/**
 * Configuración de Estigia (la app de cliente). Sirve para "cerrar el círculo"
 * del handoff: tras completar el alta, el integrador ofrece abrir Estigia con el
 * JWT del usuario recién emitido para comprobar que funciona.
 *
 * La URL se pone entera a mano en `ESTIGIA_BASE_URL` e incluye ya el sufijo del
 * estilo de acceso por token, porque el integrador solo concatena el JWT tal
 * cual al final. Hay dos estilos según el tenant:
 * - por ruta: `https://dev.estigia.<managementCode>.gibobs.one/token/`
 * - por query: `https://dev.estigia.<managementCode>.gibobs.one/?token=`
 *
 * Cambia el prefijo `dev.` según el entorno (o usa el dominio personalizado del
 * tenant); el `managementCode` lo entrega Gibobs.
 */
export function getEstigiaConfig(): EstigiaConfig {
	return { baseUrl: process.env.ESTIGIA_BASE_URL?.trim() ?? '' };
}
