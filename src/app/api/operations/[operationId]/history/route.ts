/**
 * GET /api/operations/:operationId/history → histórico.
 *
 * El histórico de Themis se consulta por `externalId`. Se toma del query
 * (`?externalId=`) o del almacén local si la operación ya está enlazada.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { getByOperationId } from '@/lib/db/operations';

export async function GET(
	request: Request,
	ctx: { params: Promise<{ operationId: string }> },
) {
	let captured: ThemisExchange[] = [];
	try {
		const { operationId } = await ctx.params;
		const externalId =
			new URL(request.url).searchParams.get('externalId') ||
			getByOperationId(operationId)?.externalId;
		if (!externalId) {
			return NextResponse.json(
				{
					status: 409,
					code: 'INTEGRATOR_NO_EXTERNAL_ID',
					detail:
						'El histórico se consulta por externalId y esta operación aún no tiene uno asignado.',
				},
				{ status: 409, headers: { 'content-type': 'application/problem+json' } },
			);
		}
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const history = await audited(
			{ method: 'GET', path: `/themis/query/v1/operations/${externalId}/history`, note: 'histórico' },
			() => themis.query.getOperationHistory(externalId),
		);
		return NextResponse.json(withExchanges(history, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
