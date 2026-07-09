/**
 * Área `intake`: alta de operaciones, estado del alta, conciliación (write-back)
 * y handoff.
 */
import 'server-only';
import type { ThemisClient, ThemisResponse } from './client';
import type {
	RedeemLaunchTokenResponse,
	ThemisCreateOperationRequest,
	ThemisOperationAcceptedResource,
	ThemisOperationCreationStatusResource,
	ThemisOperationResource,
	ThemisOperationSyncResult,
	ThemisPendingSyncOperationsResult,
	ThemisSyncOperationsRequest,
} from './types';

const INTAKE = '/themis/intake/v1';

/** Resultado del alta: 201 (síncrono) o 202 (asíncrono / handoff). */
export type CreateOperationResult =
	| { kind: 'created'; status: 201; operation: ThemisOperationResource }
	| { kind: 'accepted'; status: 202; accepted: ThemisOperationAcceptedResource };

export interface CreateOperationOptions {
	idempotencyKey: string;
	/** `respond-async` (default) o `wait=N` para pedir el camino síncrono. */
	prefer?: string;
}

export function createIntake(client: ThemisClient) {
	return {
		/** Alta de operación (doble vía 202 async / 201 sync). */
		async createOperation(
			body: ThemisCreateOperationRequest,
			opts: CreateOperationOptions,
		): Promise<CreateOperationResult> {
			const res = await client.request<
				ThemisOperationResource | ThemisOperationAcceptedResource
			>({
				method: 'POST',
				path: `${INTAKE}/operations`,
				body,
				idempotencyKey: opts.idempotencyKey,
				prefer: opts.prefer ?? 'respond-async',
			});
			if (res.status === 201) {
				return { kind: 'created', status: 201, operation: res.data as ThemisOperationResource };
			}
			return {
				kind: 'accepted',
				status: 202,
				accepted: res.data as ThemisOperationAcceptedResource,
			};
		},

		/** Estado del alta por `operationId` (RECEIVED→PROCESSING→PROCESSED|FAILED). */
		async getCreationStatus(
			operationId: string,
		): Promise<ThemisOperationCreationStatusResource> {
			const res = await client.request<ThemisOperationCreationStatusResource>({
				method: 'GET',
				path: `${INTAKE}/operations/${encodeURIComponent(operationId)}/status`,
			});
			return res.data;
		},

		/** Write-back: enlaza en lote cada `operationId` con tu `externalId`. */
		async syncOperations(
			req: ThemisSyncOperationsRequest,
			idempotencyKey: string,
		): Promise<ThemisOperationSyncResult> {
			const res = await client.request<ThemisOperationSyncResult>({
				method: 'POST',
				path: `${INTAKE}/operations/sync`,
				body: req,
				idempotencyKey,
			});
			return res.data;
		},

		/** Operaciones pendientes de conciliar (autoprescripción sin `externalId`). */
		async listPendingSync(params: {
			cursor?: string;
			limit?: number;
			sort?: 'ASC' | 'DESC';
		}): Promise<ThemisPendingSyncOperationsResult> {
			const res = await client.request<ThemisPendingSyncOperationsResult>({
				method: 'GET',
				path: `${INTAKE}/operations/pending-sync`,
				query: { cursor: params.cursor, limit: params.limit, sort: params.sort },
			});
			return res.data;
		},

		/** Canjea el launchToken de un solo uso por un sessionToken de handoff. */
		async redeemLaunchToken(launchToken: string): Promise<RedeemLaunchTokenResponse> {
			const res = await client.request<RedeemLaunchTokenResponse>({
				method: 'POST',
				path: `${INTAKE}/handoff/launch-token/redeem`,
				body: { launchToken },
				auth: false,
			});
			return res.data;
		},

		/** Estado del alta usando la sesión de handoff. */
		async getHandoffStatus(
			operationId: string,
			sessionToken: string,
		): Promise<ThemisOperationCreationStatusResource> {
			const res = await client.request<ThemisOperationCreationStatusResource>({
				method: 'GET',
				path: `${INTAKE}/handoff/operations/${encodeURIComponent(operationId)}/status`,
				sessionToken,
			});
			return res.data;
		},
	};
}

export type ThemisIntake = ReturnType<typeof createIntake>;

export function isAccepted(
	res: ThemisResponse<unknown>,
): res is ThemisResponse<ThemisOperationAcceptedResource> {
	return res.status === 202;
}
