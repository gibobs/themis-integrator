/**
 * Esquema de validación (zod) del cuerpo de alta de operación.
 *
 * Isomorfo: lo usa el formulario del navegador y también el route handler antes
 * de empujar a Themis. Refleja `ThemisCreateOperationRequest` con las reglas
 * condicionales por tipo (MORTGAGE/SUBROGATION) y el titular principal único.
 */
import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const email = z.string().regex(emailRegex, 'Email no válido');
const optionalEmail = z
	.string()
	.regex(emailRegex, 'Email no válido')
	.optional()
	.or(z.literal(''));

export const addressSchema = z.object({
	zip: z.string().min(1, 'Código postal obligatorio'),
	city: z.string().optional(),
	street: z.string().optional(),
	province: z.string().optional(),
	country: z.string().optional(),
});

export const requesterSchema = z.object({
	type: z.enum(['MANAGER', 'INTERMEDIARY', 'CLIENT', 'AGENT']),
	name: z.string().optional(),
	email,
	phone: z.string().optional(),
});

export const riskManagerSchema = z.object({
	name: z.string().optional(),
	email,
	phone: z.string().optional(),
});

export const applicantSchema = z.object({
	role: z.enum(['OWNER', 'GUARANTOR']),
	isMainOwner: z.boolean().optional(),
	name: z.string().min(1, 'Nombre obligatorio'),
	firstSurname: z.string().min(1, 'Primer apellido obligatorio'),
	lastSurname: z.string().optional(),
	email: optionalEmail,
	phone: z.string().optional(),
});

export const propertySchema = z.object({
	address: addressSchema,
	propertyType: z.enum(['NEW_CONSTRUCTION', 'SECOND_HAND']).optional(),
	useType: z.enum(['MAIN', 'SECOND', 'INVESTOR', 'OTHER']).optional(),
	price: z.number().positive().optional(),
	appraisalAmount: z.number().positive().optional(),
});

export const mortgageSchema = z.object({
	price: z.number().positive('El precio debe ser positivo'),
	amount: z.number().positive('El importe debe ser positivo'),
	savings: z.number().nonnegative().optional(),
	termMonths: z.number().int().positive().optional(),
	ratePreference: z.enum(['FIXED', 'VARIABLE', 'MIXED']).optional(),
});

export const subrogationSchema = z.object({
	dateEndMortgage: z.string().min(1, 'Fecha obligatoria'),
	dateSign: z.string().min(1, 'Fecha obligatoria'),
	amount: z.number().positive(),
	reason: z.enum(['improveMortgage', 'increaseCapitalRenovations', 'increaseCapitalLiquidity']),
	originalPurchasePrice: z.number().positive(),
	currentTin: z.number().nonnegative(),
	currentRate: z.enum(['FIXED', 'VARIABLE', 'MIXED']),
	address: addressSchema.optional(),
});

// ── Oferta y bonificaciones (opcional) ───────────────────────────────────────

export const offerStageSchema = z.object({
	tin: z.number().optional(),
	quote: z.number().optional(),
	termMonths: z.number().int().positive().optional(),
});

export const offerLinkageSchema = z.object({
	isLinked: z.boolean(),
	// Bonificación sobre el tipo: valor negativo (reduce el TIN/TAE) o 0.
	bonusValue: z.number().max(0, 'La bonificación reduce el tipo: debe ser ≤ 0').optional(),
	// Coste para el cliente por aplicar la vinculación.
	costValue: z.number().min(0, 'El coste debe ser ≥ 0').optional(),
});

export const offerLinkagesSchema = z.object({
	homeInsurance: offerLinkageSchema.optional(),
	lifeInsurance: offerLinkageSchema.optional(),
	payrollDomiciliation: offerLinkageSchema.optional(),
	protectedPayments: offerLinkageSchema.optional(),
	creditCard: offerLinkageSchema.optional(),
	alarmSystem: offerLinkageSchema.optional(),
	pensionPlan: offerLinkageSchema.optional(),
	investmentFunds: offerLinkageSchema.optional(),
});

export const offerSchema = z.object({
	rateType: z.enum(['FIXED', 'VARIABLE', 'MIXED']).optional(),
	tinInitial: z.number().optional(),
	quoteInitial: z.number().optional(),
	tinFinal: z.number().optional(),
	quoteFinal: z.number().optional(),
	tae: z.number().optional(),
	stages: z.array(offerStageSchema).optional(),
	linkages: offerLinkagesSchema.optional(),
});

export const createOperationSchema = z
	.object({
		externalId: z.string().optional(),
		type: z.enum(['MORTGAGE', 'SUBROGATION']),
		isHandoff: z.boolean(),
		requester: requesterSchema,
		riskManager: riskManagerSchema.optional(),
		applicants: z.array(applicantSchema).min(1, 'Al menos un titular'),
		property: propertySchema.optional(),
		mortgage: mortgageSchema.optional(),
		subrogation: subrogationSchema.optional(),
		offer: offerSchema.optional(),
		comments: z.string().optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.superRefine((val, ctx) => {
		if (val.type === 'MORTGAGE') {
			if (!val.property)
				ctx.addIssue({ code: 'custom', path: ['property'], message: 'Requerido para hipoteca' });
			if (!val.mortgage)
				ctx.addIssue({ code: 'custom', path: ['mortgage'], message: 'Requerido para hipoteca' });
		}
		if (val.type === 'SUBROGATION' && !val.subrogation) {
			ctx.addIssue({ code: 'custom', path: ['subrogation'], message: 'Requerido para subrogación' });
		}
		const mains = val.applicants.filter((a) => a.isMainOwner);
		if (mains.length !== 1) {
			ctx.addIssue({
				code: 'custom',
				path: ['applicants'],
				message: 'Debe haber exactamente un titular principal (isMainOwner)',
			});
		}
		const main = mains[0];
		if (main && (!main.email || !main.phone)) {
			ctx.addIssue({
				code: 'custom',
				path: ['applicants'],
				message: 'El titular principal necesita email y teléfono',
			});
		}
	});

export type CreateOperationValues = z.infer<typeof createOperationSchema>;

/** Cuerpo que acepta la ruta POST /api/operations. */
export const createOperationRequestSchema = z.object({
	mode: z.enum(['async', 'sync']).default('async'),
	request: createOperationSchema,
});
