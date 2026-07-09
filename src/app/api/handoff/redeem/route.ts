/**
 * BFF de handoff — canje del launchToken.
 *
 *  POST /api/handoff/redeem  → canjea el launchToken (single-use) por un
 *                              sessionToken de handoff (Themis intake.redeemLaunchToken).
 *
 * Es la primera llamada que hace la "webapp de Gibobs" cuando el cliente aterriza
 * en la continuationUrl. El launchToken se consume: un segundo canje da 401.
 */
import { NextResponse } from 'next/server';
import { getThemisClient } from '@/lib/themis';
import type { ThemisExchange } from '@/lib/themis';
import { audited, problemResponse, withExchanges } from '@/lib/server/respond';

export async function POST(request: Request) {
	let captured: ThemisExchange[] = [];
	try {
		const body = (await request.json()) as { launchToken?: string };
		const launchToken = body.launchToken ?? '';
		if (!launchToken) {
			return NextResponse.json(
				{ status: 400, code: 'INTEGRATOR_VALIDATION', detail: 'Falta el launchToken.' },
				{ status: 400, headers: { 'content-type': 'application/problem+json' } },
			);
		}
		const themis = await getThemisClient();
		captured = themis.getExchanges();
		const result = await audited(
			{
				method: 'POST',
				path: '/themis/intake/v1/handoff/launch-token/redeem',
				note: 'redeem',
			},
			() => themis.intake.redeemLaunchToken(launchToken),
		);
		return NextResponse.json(withExchanges(result, themis.getExchanges()));
	} catch (error) {
		return problemResponse(error, captured);
	}
}
