/**
 * BFF de conciliación — descubrimiento.
 *
 *  GET /api/reconciliation/pending?cursor&limit → operaciones pendientes de
 *  conciliar (autoprescripción sin `externalId`), vía Themis
 *  intake.listPendingSync. Paginado con cursor.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';

export async function GET(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const sp = new URL(request.url).searchParams;
		const cursor = sp.get('cursor') || undefined;
		const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined;
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{ method: 'GET', path: '/themis/intake/v1/operations/pending-sync', note: 'pendientes' },
			() => themis.intake.listPendingSync({ cursor, limit }),
		);
		return NextResponse.json(withExchanges(result, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
