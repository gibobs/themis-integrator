/**
 * Errores de Themis en formato `application/problem+json` (RFC 9457).
 *
 * El campo estable para decidir en código es `code` (nunca parsees `detail`).
 */

export interface ThemisProblem {
	type?: string;
	title?: string;
	status: number;
	code?: string;
	detail?: string;
	[key: string]: unknown;
}

export type ThemisErrorCode =
	| 'THEMIS_VALIDATION'
	| 'THEMIS_UNAUTHENTICATED'
	| 'THEMIS_FORBIDDEN'
	| 'THEMIS_OPERATION_NOT_FOUND'
	| 'THEMIS_OPERATION_DUPLICATED'
	| 'THEMIS_CONFLICT'
	| 'THEMIS_RATE_LIMITED'
	| 'THEMIS_INTAKE_FAILED'
	| 'THEMIS_TRANSPORT'
	| (string & {});

export class ThemisError extends Error {
	readonly status: number;
	readonly code: ThemisErrorCode;
	readonly detail?: string;
	readonly problem?: ThemisProblem;
	/** Segundos sugeridos de espera (cabecera `Retry-After`), si aplica. */
	readonly retryAfter?: number;

	constructor(args: {
		status: number;
		code?: ThemisErrorCode;
		detail?: string;
		problem?: ThemisProblem;
		retryAfter?: number;
	}) {
		const code = args.code ?? args.problem?.code ?? 'THEMIS_TRANSPORT';
		super(args.detail ?? args.problem?.title ?? `Themis error ${args.status} (${code})`);
		this.name = 'ThemisError';
		this.status = args.status;
		this.code = code;
		this.detail = args.detail ?? args.problem?.detail;
		this.problem = args.problem;
		this.retryAfter = args.retryAfter;
	}

	/** Errores por rate-limit (429): conviene reintentar respetando `retryAfter`. */
	get isRateLimited(): boolean {
		return this.status === 429 || this.code === 'THEMIS_RATE_LIMITED';
	}

	/** 5xx / fallos de transporte: reintentables con backoff. */
	get isRetryable(): boolean {
		return this.isRateLimited || this.status >= 500 || this.code === 'THEMIS_TRANSPORT';
	}

	toJSON(): ThemisProblem {
		return {
			status: this.status,
			code: this.code,
			detail: this.detail,
			title: this.problem?.title,
			type: this.problem?.type,
		};
	}
}

/** Normaliza el cuerpo de una respuesta de error a `ThemisProblem`. */
export function themisProblemFromBody(status: number, body: unknown): ThemisProblem {
	if (body && typeof body === 'object') {
		return { status, ...(body as Record<string, unknown>) };
	}
	return { status, detail: typeof body === 'string' ? body : undefined };
}
