/**
 * BFF de handoff — estado del alta con la sesión de handoff.
 *
 *  GET /api/handoff/status?operationId=&sessionToken=  → estado del alta
 *      (Themis intake.getHandoffStatus) usando el sessionToken canjeado.
 *
 * Es el bucle de sondeo de la "webapp de Gibobs": consulta el estado hasta un
 * estado terminal (PROCESSED | FAILED) con la sesión de handoff, sin credenciales.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';

export async function GET(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const sp = new URL(request.url).searchParams;
		const operationId = sp.get('operationId') ?? '';
		const sessionToken = sp.get('sessionToken') ?? '';
		if (!operationId || !sessionToken) {
			return NextResponse.json(
				{
					status: 400,
					code: 'INTEGRATOR_VALIDATION',
					detail: 'Faltan operationId y/o sessionToken.',
				},
				{ status: 400, headers: { 'content-type': 'application/problem+json' } },
			);
		}
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const status = await audited(
			{
				method: 'GET',
				path: '/themis/intake/v1/handoff/operations/' + operationId + '/status',
				note: 'handoff status',
			},
			() => themis.intake.getHandoffStatus(operationId, sessionToken),
		);
		return NextResponse.json(withExchanges(status, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
