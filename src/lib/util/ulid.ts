/**
 * Generador ULID mínimo (Crockford base32, 26 chars, ordenable por tiempo).
 *
 * Themis emite `operationId` con forma de ULID; lo replicamos para que el mock y
 * los identificadores locales tengan el mismo aspecto y orden temporal.
 */
import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (sin I, L, O, U)
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
	let out = '';
	for (let i = TIME_LEN - 1; i >= 0; i--) {
		const mod = now % 32;
		out = ENCODING[mod] + out;
		now = (now - mod) / 32;
	}
	return out;
}

function encodeRandom(): string {
	const bytes = randomBytes(RANDOM_LEN);
	let out = '';
	for (let i = 0; i < RANDOM_LEN; i++) {
		out += ENCODING[bytes[i]! % 32];
	}
	return out;
}

export function ulid(now: number = Date.now()): string {
	return encodeTime(now) + encodeRandom();
}
