/**
 * GET /api/operations/:operationId/documents/:documentId/url → URL de descarga.
 *
 * Devuelve una URL presignada **efímera** (TTL ~5 min) para descargar el
 * documento. La descarga en sí va **directa a S3, fuera de Themis** (el
 * navegador abre la URL). 404 si el documento no pertenece a la operación.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ operationId: string; documentId: string }> },
) {
	let captured: ThemisExchange[] = [];
	try {
		const { operationId, documentId } = await ctx.params;
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const data = await audited(
			{
				method: 'GET',
				path: `/themis/query/v1/operations/${operationId}/documents/${documentId}/url`,
				note: 'URL de documento',
			},
			() => themis.query.getDocumentUrl(operationId, documentId),
		);
		return NextResponse.json(withExchanges(data, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
