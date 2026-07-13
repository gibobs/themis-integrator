/**
 * Punto de entrada del cliente de Themis.
 *
 * Uso típico desde un route handler (BFF):
 *
 *   const themis = await getThemisClient();
 *   const result = await themis.intake.createOperation(body, { idempotencyKey });
 *   const page = await themis.query.listOperations({ linked: 'ALL', limit: 50 });
 */
import 'server-only';
import {
	getThemisConfig,
	getEstigiaConfig,
	hasCredentials,
	type ThemisConfig,
	type EstigiaConfig,
} from './config';
import { ThemisClient, createTransport } from './client';
import { withCapture } from './http';
import { createIntake, type ThemisIntake } from './intake';
import { createQuery, type ThemisQuery } from './query';
import type { ThemisExchange } from './exchange';

export interface Themis {
	config: ThemisConfig;
	client: ThemisClient;
	intake: ThemisIntake;
	query: ThemisQuery;
	/** Intercambios HTTP con Themis registrados durante la vida de este cliente. */
	getExchanges: () => ThemisExchange[];
}

export async function getThemisClient(): Promise<Themis> {
	const config = getThemisConfig();
	const baseTransport = await createTransport(config);
	// Captura cada request/response (con secretos redactados) para exponerlo a la UI.
	const exchanges: ThemisExchange[] = [];
	const transport = withCapture(baseTransport, config.baseUrl, exchanges);
	const client = new ThemisClient(config, transport);
	return {
		config,
		client,
		intake: createIntake(client),
		query: createQuery(client),
		getExchanges: () => exchanges,
	};
}

export { getThemisConfig, getEstigiaConfig, hasCredentials };
export type { ThemisConfig, EstigiaConfig };
export { ThemisError } from './errors';
export type { ThemisProblem, ThemisErrorCode } from './errors';
export { isAccepted } from './intake';
export type { CreateOperationResult } from './intake';
export type { ThemisExchange } from './exchange';
export * from './types';
