/** Clave de idempotencia HTTP (UUID v4). Disponible en Node y navegador. */
export function newIdempotencyKey(): string {
	return crypto.randomUUID();
}
