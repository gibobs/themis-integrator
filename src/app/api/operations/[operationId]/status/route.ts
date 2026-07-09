/** GET /api/operations/:operationId/status → estado del alta (sondeo). */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { updateCreationStatus } from '@/lib/db/operations';

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ operationId: string }> },
) {
	let captured: ThemisExchange[] = [];
	try {
		const { operationId } = await ctx.params;
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const status = await audited(
			{
				method: 'GET',
				path: `/themis/intake/v1/operations/${operationId}/status`,
				note: 'estado alta',
			},
			() => themis.intake.getCreationStatus(operationId),
		);
		updateCreationStatus(operationId, {
			status: status.status,
			error: status.error ?? null,
			errorType: status.errorType ?? null,
		});
		return NextResponse.json(withExchanges(status, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
