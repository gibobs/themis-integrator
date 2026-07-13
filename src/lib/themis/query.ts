/**
 * Área `query`: listado con filtros, change-feed, detalle e histórico.
 *
 * Recuerda: los listados y el change-feed son un índice **sin datos
 * personales**; el detalle (una operación cada vez) sí los trae.
 */
import 'server-only';
import type { ThemisClient } from './client';
import type {
	ThemisDocumentListResult,
	ThemisDocumentStatusResult,
	ThemisDocumentUrlResource,
	ThemisListChangesQuery,
	ThemisListOperationsQuery,
	ThemisOperationChangeResult,
	ThemisOperationDetailResource,
	ThemisOperationHistoryResult,
	ThemisOperationListResult,
} from './types';

const QUERY = '/themis/query/v1';

export function createQuery(client: ThemisClient) {
	return {
		/** Listado paginado por cursor; los filtros viajan en el cuerpo. */
		async listOperations(query: ThemisListOperationsQuery): Promise<ThemisOperationListResult> {
			const res = await client.request<ThemisOperationListResult>({
				method: 'POST',
				path: `${QUERY}/operations`,
				body: query,
			});
			return res.data;
		},

		/** Change-feed: cambios posteriores a `since` (o al `cursor`). */
		async getOperationsChanges(
			query: ThemisListChangesQuery,
		): Promise<ThemisOperationChangeResult> {
			const res = await client.request<ThemisOperationChangeResult>({
				method: 'POST',
				path: `${QUERY}/operations/changes`,
				body: query,
			});
			return res.data;
		},

		/** Detalle completo de una operación (incluye PII). 404 si no es tuya. */
		async getOperation(operationId: string): Promise<ThemisOperationDetailResource> {
			const res = await client.request<ThemisOperationDetailResource>({
				method: 'GET',
				path: `${QUERY}/operations/${encodeURIComponent(operationId)}`,
			});
			return res.data;
		},

		/** Histórico (cronología) de una operación por su `externalId`. */
		async getOperationHistory(externalId: string): Promise<ThemisOperationHistoryResult> {
			const res = await client.request<ThemisOperationHistoryResult>({
				method: 'GET',
				path: `${QUERY}/operations/${encodeURIComponent(externalId)}/history`,
			});
			return res.data;
		},

		// ── Documentos (solo lectura, por `operationId`) ────────────────────────
		// 404 si la operación no es de tu ámbito (aislamiento por marca), igual
		// que el detalle. Sin paginación y sin patrón 202: son lecturas síncronas.

		/** Documentos de una operación (excluye los de `owner === 'generic'`). */
		async listOperationDocuments(operationId: string): Promise<ThemisDocumentListResult> {
			const res = await client.request<ThemisDocumentListResult>({
				method: 'GET',
				path: `${QUERY}/operations/${encodeURIComponent(operationId)}/documents`,
			});
			return res.data;
		},

		/** Estado documental: requeridos, presentes y pendientes (`required − present`). */
		async getOperationDocumentsStatus(operationId: string): Promise<ThemisDocumentStatusResult> {
			const res = await client.request<ThemisDocumentStatusResult>({
				method: 'GET',
				path: `${QUERY}/operations/${encodeURIComponent(operationId)}/documents/status`,
			});
			return res.data;
		},

		/** URL presignada de descarga de un documento (efímera, directa a S3). */
		async getDocumentUrl(
			operationId: string,
			documentId: string,
		): Promise<ThemisDocumentUrlResource> {
			const res = await client.request<ThemisDocumentUrlResource>({
				method: 'GET',
				path: `${QUERY}/operations/${encodeURIComponent(operationId)}/documents/${encodeURIComponent(documentId)}/url`,
			});
			return res.data;
		},
	};
}

export type ThemisQuery = ReturnType<typeof createQuery>;
