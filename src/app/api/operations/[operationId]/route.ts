/** GET /api/operations/:operationId → detalle (con PII) + reflejo local. */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';
import { updateBusinessState } from '@/lib/db/operations';

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ operationId: string }> },
) {
	let captured: ThemisExchange[] = [];
	try {
		const { operationId } = await ctx.params;
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const detail = await audited(
			{ method: 'GET', path: `/themis/query/v1/operations/${operationId}`, note: 'detalle' },
			() => themis.query.getOperation(operationId),
		);
		updateBusinessState(operationId, {
			businessStatus: detail.status,
			stage: detail.stage,
			substage: detail.substage ?? null,
			amount: detail.amount ?? null,
			province: detail.province ?? null,
			externalId: detail.externalId ?? null,
		});
		return NextResponse.json(withExchanges(detail, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
