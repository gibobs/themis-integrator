'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, ShieldPlus, Sparkles, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Callout } from '@/components/ui/callout';
import { Spinner } from '@/components/ui/spinner';
import { JsonView } from '@/components/ui/json-view';
import { CopyButton } from '@/components/copy-button';
import { ContinuationLink } from '@/components/continuation-link';
import { RequestInspector } from '@/components/request-inspector';
import { fakerES as faker } from '@faker-js/faker';
import { apiFetch, ApiError, type WithExchanges } from '@/lib/client/api';
import type { ThemisExchange } from '@/lib/themis';
import { createOperationSchema } from '@/lib/themis/schema';

type Mode = 'handoff' | 'async' | 'sync';

interface CreateResponse {
	localId: string;
	kind: 'created' | 'accepted';
	status: number;
	operationId: string;
	externalId?: string;
	statusUrl?: string;
	continuationUrl?: string;
	isHandoff?: boolean;
	operation?: unknown;
}

type CreateResponseWithExchanges = WithExchanges<CreateResponse>;

type ApplicantRole = 'OWNER' | 'GUARANTOR';

interface ApplicantForm {
	role: ApplicantRole;
	isMainOwner: boolean;
	name: string;
	firstSurname: string;
	lastSurname: string;
	email: string;
	phone: string;
}

function blankApplicant(role: ApplicantRole = 'OWNER'): ApplicantForm {
	return { role, isMainOwner: false, name: '', firstSurname: '', lastSurname: '', email: '', phone: '' };
}

/** Reasegura que haya exactamente un titular principal entre los OWNER. */
function ensureOneMainOwner(applicants: ApplicantForm[]): ApplicantForm[] {
	if (applicants.some((a) => a.role === 'OWNER' && a.isMainOwner)) return applicants;
	const firstOwner = applicants.findIndex((a) => a.role === 'OWNER');
	if (firstOwner < 0) return applicants;
	return applicants.map((a, i) => ({ ...a, isMainOwner: i === firstOwner }));
}

// ── Oferta y bonificaciones ──────────────────────────────────────────────────

interface StageForm {
	tin: string;
	quote: string;
	termMonths: string;
}

interface LinkageForm {
	key: string;
	label: string;
	isLinked: boolean;
	bonusValue: string;
	costValue: string;
}

/** Catálogo de vinculaciones del contrato de Themis (ThemisOfferLinkagesDto). */
const LINKAGE_DEFS: { key: string; label: string }[] = [
	{ key: 'homeInsurance', label: 'Seguro de hogar' },
	{ key: 'lifeInsurance', label: 'Seguro de vida' },
	{ key: 'payrollDomiciliation', label: 'Domiciliación de nómina' },
	{ key: 'protectedPayments', label: 'Pagos protegidos' },
	{ key: 'creditCard', label: 'Tarjeta de crédito' },
	{ key: 'alarmSystem', label: 'Sistema de alarma' },
	{ key: 'pensionPlan', label: 'Plan de pensiones' },
	{ key: 'investmentFunds', label: 'Fondos de inversión' },
];

function blankLinkages(): LinkageForm[] {
	return LINKAGE_DEFS.map((d) => ({ ...d, isLinked: false, bonusValue: '', costValue: '' }));
}

const blank = {
	mode: 'handoff' as Mode,
	externalId: '',
	type: 'MORTGAGE' as 'MORTGAGE' | 'SUBROGATION',
	simulateFail: false,
	requesterType: 'AGENT',
	requesterName: '',
	requesterEmail: '',
	requesterPhone: '',
	applicants: [{ ...blankApplicant('OWNER'), isMainOwner: true }] as ApplicantForm[],
	// property + mortgage
	zip: '',
	city: '',
	province: '',
	price: '',
	amount: '',
	termMonths: '',
	ratePreference: '',
	// subrogation
	subDateEnd: '',
	subDateSign: '',
	subAmount: '',
	subReason: 'improveMortgage',
	subOriginalPrice: '',
	subCurrentTin: '',
	subCurrentRate: 'VARIABLE',
	// oferta y bonificaciones (opcional)
	offerEnabled: false,
	offerRateType: '',
	offerTinInitial: '',
	offerQuoteInitial: '',
	offerTinFinal: '',
	offerQuoteFinal: '',
	offerTae: '',
	stages: [] as StageForm[],
	linkages: blankLinkages(),
	comments: '',
};

// ── Generación de ejemplos con datos españoles aleatorios (faker) ────────────

/** Normaliza a un slug sin acentos para construir emails realistas. */
function slug(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z]/g, '');
}

function fakeEmail(first: string, surname: string): string {
	const domain = faker.helpers.arrayElement(['example.com', 'correo.es', 'mail.es', 'demo.es']);
	return `${slug(first)}.${slug(surname)}@${domain}`;
}

/** Móvil español: +34 seguido de 6/7 y 8 dígitos. */
function fakePhone(): string {
	return '+34' + faker.helpers.arrayElement(['6', '7']) + faker.string.numeric(8);
}

function fakeApplicant(role: ApplicantRole, isMainOwner: boolean): ApplicantForm {
	const name = faker.person.firstName();
	const firstSurname = faker.person.lastName();
	const lastSurname = faker.person.lastName();
	return {
		role,
		isMainOwner,
		name,
		firstSurname,
		lastSurname,
		email: fakeEmail(name, firstSurname),
		phone: fakePhone(),
	};
}

/** Construye un ejemplo nuevo (nombres, emails, importes… aleatorios) en cada llamada. */
function buildExample(mode: Mode, type: 'MORTGAGE' | 'SUBROGATION'): typeof blank {
	const reqFirst = faker.person.firstName();
	const reqLast = faker.person.lastName();
	const price = faker.number.int({ min: 120000, max: 500000 });
	const amount = Math.round((price * faker.number.float({ min: 0.7, max: 0.9 })) / 1000) * 1000;
	const termMonths = faker.helpers.arrayElement([180, 240, 300, 360]);
	// Un titular principal + un avalista, ambos con identidad española aleatoria.
	const applicants: ApplicantForm[] = [
		fakeApplicant('OWNER', true),
		fakeApplicant('GUARANTOR', false),
	];

	// Oferta: TIN inicial/final, cuota (por anualidad) y TAE coherentes.
	const tinInitial = faker.number.float({ min: 1.5, max: 3.5, fractionDigits: 2 });
	const tinFinal = faker.number.float({ min: 1.5, max: 3.5, fractionDigits: 2 });
	const monthlyQuote = (tin: number) => {
		const r = tin / 100 / 12;
		const q = r === 0 ? amount / termMonths : (amount * r) / (1 - Math.pow(1 + r, -termMonths));
		return Math.round(q);
	};
	const quoteInitial = monthlyQuote(tinInitial);
	const quoteFinal = monthlyQuote(tinFinal);
	const tae = Number((Math.max(tinInitial, tinFinal) + faker.number.float({ min: 0.1, max: 0.5 })).toFixed(2));
	const half = Math.round(termMonths / 2);
	// Todas las bonificaciones marcadas, con bonificación (≤0) y coste (≥0).
	const linkages: LinkageForm[] = LINKAGE_DEFS.map((d) => ({
		...d,
		isLinked: true,
		bonusValue: (-faker.number.float({ min: 0.05, max: 0.25, fractionDigits: 2 })).toString(),
		costValue: String(faker.number.int({ min: 0, max: 250 })),
	}));

	return {
		...blank,
		mode,
		type,
		externalId: `CRM-${faker.number.int({ min: 1000, max: 9999 })}`,
		requesterType: 'AGENT',
		requesterName: `${reqFirst} ${reqLast}`,
		requesterEmail: fakeEmail(reqFirst, reqLast),
		requesterPhone: fakePhone(),
		applicants,
		zip: faker.location.zipCode('#####'),
		city: faker.location.city(),
		province: faker.location.state(),
		price: String(price),
		amount: String(amount),
		termMonths: String(termMonths),
		ratePreference: faker.helpers.arrayElement(['FIXED', 'VARIABLE', 'MIXED']),
		// Datos de subrogación por si el tipo seleccionado es SUBROGATION.
		subDateSign: faker.date.past({ years: 5 }).toISOString().slice(0, 10),
		subDateEnd: faker.date.future({ years: 15 }).toISOString().slice(0, 10),
		subAmount: String(faker.number.int({ min: 80000, max: 250000 })),
		subReason: faker.helpers.arrayElement([
			'improveMortgage',
			'increaseCapitalRenovations',
			'increaseCapitalLiquidity',
		]),
		subOriginalPrice: String(faker.number.int({ min: 150000, max: 400000 })),
		subCurrentTin: faker.number.float({ min: 1.5, max: 4, fractionDigits: 2 }).toString(),
		subCurrentRate: faker.helpers.arrayElement(['FIXED', 'VARIABLE', 'MIXED']),
		// Oferta y bonificaciones: todos los campos rellenos.
		offerEnabled: true,
		offerRateType: faker.helpers.arrayElement(['FIXED', 'VARIABLE', 'MIXED']),
		offerTinInitial: String(tinInitial),
		offerQuoteInitial: String(quoteInitial),
		offerTinFinal: String(tinFinal),
		offerQuoteFinal: String(quoteFinal),
		offerTae: String(tae),
		stages: [
			{ tin: String(tinInitial), quote: String(quoteInitial), termMonths: String(half) },
			{ tin: String(tinFinal), quote: String(quoteFinal), termMonths: String(termMonths - half) },
		],
		linkages,
	};
}

export function CreateForm() {
	const router = useRouter();
	const [f, setF] = React.useState(blank);
	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [result, setResult] = React.useState<CreateResponseWithExchanges | null>(null);
	const [errorExchanges, setErrorExchanges] = React.useState<ThemisExchange[]>([]);

	function upd<K extends keyof typeof f>(key: K, value: (typeof f)[K]) {
		setF((prev) => ({ ...prev, [key]: value }));
	}

	function updApplicant(index: number, patch: Partial<ApplicantForm>) {
		setF((prev) => ({
			...prev,
			applicants: prev.applicants.map((a, i) => (i === index ? { ...a, ...patch } : a)),
		}));
	}

	function addApplicant(role: ApplicantRole) {
		setF((prev) => ({ ...prev, applicants: [...prev.applicants, blankApplicant(role)] }));
	}

	function removeApplicant(index: number) {
		setF((prev) => ({
			...prev,
			applicants: ensureOneMainOwner(prev.applicants.filter((_, i) => i !== index)),
		}));
	}

	function setMainOwner(index: number) {
		setF((prev) => ({
			...prev,
			applicants: prev.applicants.map((a, i) => ({ ...a, isMainOwner: i === index })),
		}));
	}

	function changeApplicantRole(index: number, role: ApplicantRole) {
		setF((prev) => ({
			...prev,
			applicants: ensureOneMainOwner(
				prev.applicants.map((a, i) =>
					i === index ? { ...a, role, isMainOwner: role === 'GUARANTOR' ? false : a.isMainOwner } : a,
				),
			),
		}));
	}

	function addStage() {
		setF((prev) => ({ ...prev, stages: [...prev.stages, { tin: '', quote: '', termMonths: '' }] }));
	}
	function removeStage(index: number) {
		setF((prev) => ({ ...prev, stages: prev.stages.filter((_, i) => i !== index) }));
	}
	function updStage(index: number, patch: Partial<StageForm>) {
		setF((prev) => ({
			...prev,
			stages: prev.stages.map((s, i) => (i === index ? { ...s, ...patch } : s)),
		}));
	}
	function updLinkage(index: number, patch: Partial<LinkageForm>) {
		setF((prev) => ({
			...prev,
			linkages: prev.linkages.map((l, i) => (i === index ? { ...l, ...patch } : l)),
		}));
	}

	/** Construye el bloque `offer` (o undefined si la oferta no está activada). */
	function buildOffer() {
		if (!f.offerEnabled) return undefined;
		const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

		const linkages: Record<string, { isLinked: boolean; bonusValue?: number; costValue?: number }> = {};
		for (const l of f.linkages) {
			if (l.isLinked || l.bonusValue !== '' || l.costValue !== '') {
				linkages[l.key] = {
					isLinked: l.isLinked,
					bonusValue: num(l.bonusValue),
					costValue: num(l.costValue),
				};
			}
		}
		const stages = f.stages
			.filter((s) => s.tin !== '' || s.quote !== '' || s.termMonths !== '')
			.map((s) => ({ tin: num(s.tin), quote: num(s.quote), termMonths: num(s.termMonths) }));

		return {
			rateType: (f.offerRateType || undefined) as 'FIXED' | 'VARIABLE' | 'MIXED' | undefined,
			tinInitial: num(f.offerTinInitial),
			quoteInitial: num(f.offerQuoteInitial),
			tinFinal: num(f.offerTinFinal),
			quoteFinal: num(f.offerQuoteFinal),
			tae: num(f.offerTae),
			stages: stages.length ? stages : undefined,
			linkages: Object.keys(linkages).length ? linkages : undefined,
		};
	}

	function buildRequest() {
		const applicants = f.applicants.map((a) => ({
			role: a.role,
			isMainOwner: a.isMainOwner,
			name: a.name,
			firstSurname: a.firstSurname,
			lastSurname: a.lastSurname || undefined,
			email: a.email || undefined,
			phone: a.phone || undefined,
		}));
		const base = {
			externalId: f.externalId || undefined,
			type: f.type,
			isHandoff: f.mode === 'handoff',
			requester: {
				type: f.requesterType as 'MANAGER' | 'INTERMEDIARY' | 'CLIENT' | 'AGENT',
				name: f.requesterName || undefined,
				email: f.requesterEmail,
				phone: f.requesterPhone || undefined,
			},
			applicants,
			offer: buildOffer(),
			comments: f.comments || undefined,
			metadata: f.simulateFail ? { simulateFail: true } : undefined,
		};
		if (f.type === 'MORTGAGE') {
			return {
				...base,
				property: {
					address: { zip: f.zip, city: f.city || undefined, province: f.province || undefined },
				},
				mortgage: {
					price: Number(f.price),
					amount: Number(f.amount),
					termMonths: f.termMonths ? Number(f.termMonths) : undefined,
					ratePreference: (f.ratePreference || undefined) as 'FIXED' | 'VARIABLE' | 'MIXED' | undefined,
				},
			};
		}
		return {
			...base,
			subrogation: {
				dateEndMortgage: f.subDateEnd,
				dateSign: f.subDateSign,
				amount: Number(f.subAmount),
				reason: f.subReason as 'improveMortgage' | 'increaseCapitalRenovations' | 'increaseCapitalLiquidity',
				originalPurchasePrice: Number(f.subOriginalPrice),
				currentTin: Number(f.subCurrentTin),
				currentRate: f.subCurrentRate as 'FIXED' | 'VARIABLE' | 'MIXED',
			},
		};
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setResult(null);
		setErrorExchanges([]);
		const request = buildRequest();
		const parsed = createOperationSchema.safeParse(request);
		if (!parsed.success) {
			setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
			return;
		}
		setSubmitting(true);
		try {
			const mode = f.mode === 'sync' ? 'sync' : 'async';
			const res = await apiFetch<CreateResponseWithExchanges>('/api/operations', {
				method: 'POST',
				body: JSON.stringify({ mode, request: parsed.data }),
			});
			setResult(res);
		} catch (err) {
			setError(err instanceof ApiError ? `${err.code ?? ''} ${err.message}`.trim() : (err as Error).message);
			// El alta falló: mostramos igualmente el intercambio con Themis si vino.
			if (err instanceof ApiError && err.exchanges) setErrorExchanges(err.exchanges);
		} finally {
			setSubmitting(false);
		}
	}

	if (result) {
		return (
			<div className="space-y-4">
				<Callout tone="success" title={result.kind === 'created' ? 'Operación creada (201)' : 'Operación aceptada (202)'}>
					{result.kind === 'created'
						? 'El alta se completó de forma síncrona. Ya puedes ver el detalle.'
						: 'El alta se está procesando de forma asíncrona. Sigue su estado en el detalle (sondeo con backoff).'}
				</Callout>

				<Card>
					<CardHeader>
						<CardTitle>Respuesta de Themis</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
							<div>
								<span className="text-muted-foreground">operationId:</span>{' '}
								<span className="font-mono">{result.operationId}</span>
								<CopyButton value={result.operationId} />
							</div>
							{result.externalId && (
								<div>
									<span className="text-muted-foreground">externalId:</span>{' '}
									<span className="font-mono">{result.externalId}</span>
								</div>
							)}
						</div>

						{result.continuationUrl && (
							<Callout tone="info" title="Handoff: continuación del cliente">
								Redirige el navegador del cliente a la <code>continuationUrl</code> para completar el
								alta (en integración es <code>/handoff/landing?launch_token=…</code>).
								<div className="mt-2">
									<ContinuationLink url={result.continuationUrl} />
								</div>
							</Callout>
						)}

						<div className="flex gap-2">
							<Link href={`/operations/${result.operationId}`}>
								<Button>
									Ver detalle y estado <ArrowRight className="size-4" />
								</Button>
							</Link>
							<Button variant="outline" onClick={() => setResult(null)}>
								Crear otra
							</Button>
						</div>
					</CardContent>
				</Card>

				<RequestInspector exchanges={result._themis} title="Alta en Themis (request / response)" />
			</div>
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			{error && (
				<Callout tone="danger" title="Revisa los datos">
					{error}
				</Callout>
			)}

			{errorExchanges.length > 0 && (
				<RequestInspector exchanges={errorExchanges} title="Alta rechazada en Themis (request / response)" />
			)}

			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<CardTitle>Modo de alta</CardTitle>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => setF(buildExample(f.mode, f.type))}
						>
							<Sparkles className="size-4" /> Rellenar ejemplo
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid gap-2 md:grid-cols-3">
						{(
							[
								['handoff', 'Handoff', 'Rediriges al cliente a la webapp. Siempre 202 + continuationUrl.'],
								['async', 'S2S asíncrono', 'Servidor-a-servidor. 202 + sondeo de estado con backoff.'],
								['sync', 'S2S síncrono', 'Prefer: wait=N. 201 si da tiempo; degrada a 202.'],
							] as const
						).map(([value, title, desc]) => (
							<label
								key={value}
								className={`cursor-pointer rounded-md border p-3 text-sm transition-colors ${
									f.mode === value ? 'border-primary bg-accent' : 'border-border hover:bg-muted'
								}`}
							>
								<input
									type="radio"
									name="mode"
									className="sr-only"
									checked={f.mode === value}
									onChange={() => upd('mode', value)}
								/>
								<div className="font-medium">{title}</div>
								<div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
							</label>
						))}
					</div>
					<label className="flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							checked={f.simulateFail}
							onChange={(e) => upd('simulateFail', e.target.checked)}
						/>
						Simular alta fallida (metadata.simulateFail — útil para probar el estado FAILED en mock)
					</label>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Identificación y tipo</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="externalId">externalId (tu referencia, opcional)</Label>
						<div className="flex gap-2">
							<Input
								id="externalId"
								value={f.externalId}
								onChange={(e) => upd('externalId', e.target.value)}
								placeholder="CRM-1001"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								title="Sugerir"
								onClick={() => upd('externalId', `CRM-${Math.floor(1000 + Math.random() * 8999)}`)}
							>
								<Wand2 className="size-4" />
							</Button>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor="type">Tipo de operación</Label>
						<Select id="type" value={f.type} onChange={(e) => upd('type', e.target.value as typeof f.type)}>
							<option value="MORTGAGE">Hipoteca (compra)</option>
							<option value="SUBROGATION">Subrogación</option>
						</Select>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Solicitante</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="rtype">Tipo</Label>
						<Select id="rtype" value={f.requesterType} onChange={(e) => upd('requesterType', e.target.value)}>
							<option value="AGENT">Agente</option>
							<option value="MANAGER">Gestor</option>
							<option value="INTERMEDIARY">Intermediario</option>
							<option value="CLIENT">Cliente</option>
						</Select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="remail">Email *</Label>
						<Input id="remail" value={f.requesterEmail} onChange={(e) => upd('requesterEmail', e.target.value)} />
					</div>
					<div className="space-y-1">
						<Label htmlFor="rname">Nombre</Label>
						<Input id="rname" value={f.requesterName} onChange={(e) => upd('requesterName', e.target.value)} />
					</div>
					<div className="space-y-1">
						<Label htmlFor="rphone">Teléfono</Label>
						<Input id="rphone" value={f.requesterPhone} onChange={(e) => upd('requesterPhone', e.target.value)} />
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex-row items-start justify-between gap-3">
					<div>
						<CardTitle>Intervinientes</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							Titulares y avalistas. Marca exactamente un <strong>titular principal</strong>: es el
							contacto de la operación y necesita email y teléfono.
						</p>
					</div>
					<div className="flex shrink-0 gap-2">
						<Button type="button" variant="secondary" size="sm" onClick={() => addApplicant('OWNER')}>
							<UserPlus className="size-4" /> Titular
						</Button>
						<Button type="button" variant="secondary" size="sm" onClick={() => addApplicant('GUARANTOR')}>
							<ShieldPlus className="size-4" /> Avalista
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{f.applicants.map((a, i) => (
						<div key={i} className="rounded-md border border-border p-4">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
								<div className="flex flex-wrap items-center gap-3">
									<Select
										aria-label="Rol del interviniente"
										value={a.role}
										onChange={(e) => changeApplicantRole(i, e.target.value as ApplicantRole)}
										className="h-8 w-36"
									>
										<option value="OWNER">Titular</option>
										<option value="GUARANTOR">Avalista</option>
									</Select>
									{a.role === 'OWNER' && (
										<label className="flex items-center gap-2 text-sm">
											<input
												type="radio"
												name="mainOwner"
												checked={a.isMainOwner}
												onChange={() => setMainOwner(i)}
											/>
											Titular principal
										</label>
									)}
									{a.isMainOwner && <Badge tone="primary">Principal</Badge>}
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									title="Eliminar interviniente"
									disabled={f.applicants.length <= 1}
									onClick={() => removeApplicant(i)}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<div className="space-y-1">
									<Label>Nombre *</Label>
									<Input value={a.name} onChange={(e) => updApplicant(i, { name: e.target.value })} />
								</div>
								<div className="space-y-1">
									<Label>Primer apellido *</Label>
									<Input
										value={a.firstSurname}
										onChange={(e) => updApplicant(i, { firstSurname: e.target.value })}
									/>
								</div>
								<div className="space-y-1">
									<Label>Segundo apellido</Label>
									<Input
										value={a.lastSurname}
										onChange={(e) => updApplicant(i, { lastSurname: e.target.value })}
									/>
								</div>
								<div className="space-y-1">
									<Label>{a.isMainOwner ? 'Email *' : 'Email'}</Label>
									<Input value={a.email} onChange={(e) => updApplicant(i, { email: e.target.value })} />
								</div>
								<div className="space-y-1">
									<Label>{a.isMainOwner ? 'Teléfono *' : 'Teléfono'}</Label>
									<Input value={a.phone} onChange={(e) => updApplicant(i, { phone: e.target.value })} />
								</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			{f.type === 'MORTGAGE' ? (
				<Card>
					<CardHeader>
						<CardTitle>Inmueble e hipoteca</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3 md:grid-cols-3">
						<div className="space-y-1">
							<Label htmlFor="zip">Código postal *</Label>
							<Input id="zip" value={f.zip} onChange={(e) => upd('zip', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="city">Localidad</Label>
							<Input id="city" value={f.city} onChange={(e) => upd('city', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="prov">Provincia</Label>
							<Input id="prov" value={f.province} onChange={(e) => upd('province', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="price">Precio vivienda *</Label>
							<Input id="price" type="number" value={f.price} onChange={(e) => upd('price', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="amount">Importe hipoteca *</Label>
							<Input id="amount" type="number" value={f.amount} onChange={(e) => upd('amount', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="term">Plazo (meses)</Label>
							<Input id="term" type="number" value={f.termMonths} onChange={(e) => upd('termMonths', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="rate">Preferencia de tipo</Label>
							<Select id="rate" value={f.ratePreference} onChange={(e) => upd('ratePreference', e.target.value)}>
								<option value="">—</option>
								<option value="FIXED">Fijo</option>
								<option value="VARIABLE">Variable</option>
								<option value="MIXED">Mixto</option>
							</Select>
						</div>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Subrogación</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3 md:grid-cols-3">
						<div className="space-y-1">
							<Label htmlFor="sde">Fin hipoteca actual *</Label>
							<Input id="sde" type="date" value={f.subDateEnd} onChange={(e) => upd('subDateEnd', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="sds">Firma hipoteca actual *</Label>
							<Input id="sds" type="date" value={f.subDateSign} onChange={(e) => upd('subDateSign', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="sam">Capital pendiente *</Label>
							<Input id="sam" type="number" value={f.subAmount} onChange={(e) => upd('subAmount', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="sre">Motivo *</Label>
							<Select id="sre" value={f.subReason} onChange={(e) => upd('subReason', e.target.value)}>
								<option value="improveMortgage">Mejorar hipoteca</option>
								<option value="increaseCapitalRenovations">Ampliar capital (reformas)</option>
								<option value="increaseCapitalLiquidity">Ampliar capital (liquidez)</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="sop">Precio compra original *</Label>
							<Input id="sop" type="number" value={f.subOriginalPrice} onChange={(e) => upd('subOriginalPrice', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="sti">TIN actual *</Label>
							<Input id="sti" type="number" step="0.01" value={f.subCurrentTin} onChange={(e) => upd('subCurrentTin', e.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="scr">Tipo actual *</Label>
							<Select id="scr" value={f.subCurrentRate} onChange={(e) => upd('subCurrentRate', e.target.value)}>
								<option value="FIXED">Fijo</option>
								<option value="VARIABLE">Variable</option>
								<option value="MIXED">Mixto</option>
							</Select>
						</div>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader className="flex-row items-start justify-between gap-3">
					<div>
						<CardTitle>Oferta y bonificaciones</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							Opcional. Oferta de partida pactada con el cliente (tipo, TIN, cuota, TAE y tramos) y
							bonificaciones por vinculación (cada una reduce el tipo con un valor ≤ 0 y puede tener un
							coste ≥ 0).
						</p>
					</div>
					<label className="flex shrink-0 items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={f.offerEnabled}
							onChange={(e) => upd('offerEnabled', e.target.checked)}
						/>
						Incluir
					</label>
				</CardHeader>
				{f.offerEnabled && (
					<CardContent className="space-y-6">
						<div className="grid gap-3 md:grid-cols-3">
							<div className="space-y-1">
								<Label htmlFor="offerRate">Tipo de interés</Label>
								<Select
									id="offerRate"
									value={f.offerRateType}
									onChange={(e) => upd('offerRateType', e.target.value)}
								>
									<option value="">—</option>
									<option value="FIXED">Fijo</option>
									<option value="VARIABLE">Variable</option>
									<option value="MIXED">Mixto</option>
								</Select>
							</div>
							<div className="space-y-1">
								<Label htmlFor="offerTae">TAE (%)</Label>
								<Input
									id="offerTae"
									type="number"
									step="0.01"
									value={f.offerTae}
									onChange={(e) => upd('offerTae', e.target.value)}
								/>
							</div>
							<div className="hidden md:block" />
							<div className="space-y-1">
								<Label htmlFor="offerTinI">TIN inicial (%)</Label>
								<Input
									id="offerTinI"
									type="number"
									step="0.01"
									value={f.offerTinInitial}
									onChange={(e) => upd('offerTinInitial', e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="offerQuoteI">Cuota inicial (€)</Label>
								<Input
									id="offerQuoteI"
									type="number"
									value={f.offerQuoteInitial}
									onChange={(e) => upd('offerQuoteInitial', e.target.value)}
								/>
							</div>
							<div className="hidden md:block" />
							<div className="space-y-1">
								<Label htmlFor="offerTinF">TIN final (%)</Label>
								<Input
									id="offerTinF"
									type="number"
									step="0.01"
									value={f.offerTinFinal}
									onChange={(e) => upd('offerTinFinal', e.target.value)}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="offerQuoteF">Cuota final (€)</Label>
								<Input
									id="offerQuoteF"
									type="number"
									value={f.offerQuoteFinal}
									onChange={(e) => upd('offerQuoteFinal', e.target.value)}
								/>
							</div>
						</div>

						<div>
							<div className="mb-2 flex items-center justify-between">
								<Label>Tramos de la oferta</Label>
								<Button type="button" variant="secondary" size="sm" onClick={addStage}>
									<Plus className="size-4" /> Añadir tramo
								</Button>
							</div>
							{f.stages.length === 0 ? (
								<p className="text-sm text-muted-foreground">Sin tramos. Añade uno si la oferta es por tramos.</p>
							) : (
								<div className="space-y-2">
									{f.stages.map((s, i) => (
										<div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
											<div className="space-y-1">
												<Label>TIN (%)</Label>
												<Input
													type="number"
													step="0.01"
													value={s.tin}
													onChange={(e) => updStage(i, { tin: e.target.value })}
												/>
											</div>
											<div className="space-y-1">
												<Label>Cuota (€)</Label>
												<Input
													type="number"
													value={s.quote}
													onChange={(e) => updStage(i, { quote: e.target.value })}
												/>
											</div>
											<div className="space-y-1">
												<Label>Duración (meses)</Label>
												<Input
													type="number"
													value={s.termMonths}
													onChange={(e) => updStage(i, { termMonths: e.target.value })}
												/>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												title="Eliminar tramo"
												onClick={() => removeStage(i)}
											>
												<Trash2 className="size-4" />
											</Button>
										</div>
									))}
								</div>
							)}
						</div>

						<div>
							<Label>Bonificaciones (vinculaciones)</Label>
							<div className="mt-2 rounded-md border border-border">
								<Table>
									<THead>
										<TR>
											<TH>Vinculación</TH>
											<TH>Aplicada</TH>
											<TH>Bonif. TIN (≤ 0)</TH>
											<TH>Coste € (≥ 0)</TH>
										</TR>
									</THead>
									<TBody>
										{f.linkages.map((l, i) => (
											<TR key={l.key}>
												<TD className="font-medium">{l.label}</TD>
												<TD>
													<input
														type="checkbox"
														checked={l.isLinked}
														onChange={(e) => updLinkage(i, { isLinked: e.target.checked })}
													/>
												</TD>
												<TD>
													<Input
														type="number"
														step="0.01"
														max={0}
														className="h-8 w-28"
														value={l.bonusValue}
														onChange={(e) => updLinkage(i, { bonusValue: e.target.value })}
													/>
												</TD>
												<TD>
													<Input
														type="number"
														min={0}
														className="h-8 w-28"
														value={l.costValue}
														onChange={(e) => updLinkage(i, { costValue: e.target.value })}
													/>
												</TD>
											</TR>
										))}
									</TBody>
								</Table>
							</div>
						</div>
					</CardContent>
				)}
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Comentarios</CardTitle>
				</CardHeader>
				<CardContent>
					<Textarea value={f.comments} onChange={(e) => upd('comments', e.target.value)} placeholder="Notas libres…" />
				</CardContent>
			</Card>

			<details className="rounded-lg border border-border bg-card p-4">
				<summary className="cursor-pointer text-sm font-medium">Previsualizar cuerpo del POST</summary>
				<div className="mt-3">
					<JsonView data={buildRequest()} />
				</div>
			</details>

			<div className="flex items-center gap-2">
				<Button type="submit" size="lg" disabled={submitting}>
					{submitting ? <Spinner /> : <FilePlusIcon />}
					{submitting ? 'Enviando…' : 'Crear operación'}
				</Button>
				<Link href="/operations">
					<Button type="button" variant="outline" size="lg">
						Cancelar
					</Button>
				</Link>
			</div>
		</form>
	);
}

function FilePlusIcon() {
	return <Sparkles className="size-4" />;
}
