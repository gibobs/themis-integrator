/**
 * GET /api/operations/:operationId/documents → listado de documentos.
 *
 * Los documentos son de **solo lectura** y se consultan por `operationId` (el
 * ULID público que el integrador ya conoce), sin resolver `externalId`. 404 si
 * la operación no es de tu ámbito.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';

export async function GET(_request: Request, ctx: { params: Promise<{ operationId: string }> }) {
	let captured: ThemisExchange[] = [];
	try {
		const { operationId } = await ctx.params;
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const data = await audited(
			{
				method: 'GET',
				path: `/themis/query/v1/operations/${operationId}/documents`,
				note: 'documentos',
			},
			() => themis.query.listOperationDocuments(operationId),
		);
		return NextResponse.json(withExchanges(data, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
