/**
 * POST /api/settings/reset → vacía el almacén local del integrador.
 *
 * Borra operaciones, progreso del change-feed y log de auditoría. NO toca el
 * backend simulado de Themis (vive en otra base de datos, `themis-mock.db`);
 * para reiniciarlo del todo se usa `yarn db:reset`.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/db';
import { problemResponse } from '@/lib/server/respond';

export async function POST() {
	try {
		getDb().exec(
			'DELETE FROM operations; DELETE FROM feed_state; DELETE FROM audit_log; DELETE FROM webhook_events;',
		);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return problemResponse(error);
	}
}
