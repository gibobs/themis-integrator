/**
 * Tipos del contrato de Themis.
 *
 * Espejo en TypeScript de los esquemas OpenAPI de `themis/auth`,
 * `themis/intake` y `themis/query`. La convención del contrato es `camelCase`
 * (salvo la respuesta del token, que sigue OAuth2 en `snake_case`).
 *
 * Fuera de alcance por ahora (se deja para más adelante): la parte de
 * identidades.
 */

// ── Enums / uniones del dominio ─────────────────────────────────────────────

export type ThemisOperationType = 'MORTGAGE' | 'SUBROGATION';
export type ThemisOperationOrigin = 'INTAKE' | 'AUTOPRESCRIPTION';
export type ThemisOperationStatus = 'active' | 'postpone' | 'finish';
export type ThemisLinkedFilter = 'ALL' | 'LINKED' | 'UNLINKED';
export type ThemisSortDirection = 'ASC' | 'DESC';

/** Estado del *alta* de una operación (distinto del estado de negocio). */
export type ThemisCreationStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
export type ThemisCreationErrorType =
	| 'INVALID_INPUT'
	| 'MISSING_REQUIRED_FIELD'
	| 'STRATEGY_VALIDATION_FAILED'
	| 'RESOLUTION_FAILED';
export type ThemisCreationStatusClass = 'TERMINAL' | 'RETRYABLE';

export type ThemisSyncStatus = 'LINKED' | 'ALREADY_LINKED' | 'NOT_FOUND' | 'CONFLICT';

export type ThemisRequesterType = 'MANAGER' | 'INTERMEDIARY' | 'CLIENT' | 'AGENT';
export type ThemisApplicantRole = 'OWNER' | 'GUARANTOR';
export type ThemisRateType = 'FIXED' | 'VARIABLE' | 'MIXED';

// ── Auth ────────────────────────────────────────────────────────────────────

export interface ThemisTokenRequest {
	apiKey: string;
	apiSecret: string;
	token: string;
}

export interface ThemisTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: 'Bearer' | string;
	scopes?: string[];
}

// ── Sub-DTOs compartidos ────────────────────────────────────────────────────

export interface ThemisRequesterDto {
	type: ThemisRequesterType;
	name?: string;
	email: string;
	phone?: string;
}

export interface ThemisRiskManagerDto {
	name?: string;
	email: string;
	phone?: string;
}

export interface ThemisAddressDto {
	zip: string;
	city?: string;
	street?: string;
	province?: string;
	country?: string;
}

export interface ThemisEmploymentDto {
	activity?: string;
	freelancerType?: 'DIRECT_ESTIMATION' | 'MODULES' | 'CORPORATE';
	seniority?: number;
	companyName?: string;
	educationLevel?: string;
}

export interface ThemisIncomeDto {
	netMonthly?: number;
	rentalIncome?: number;
	bonus?: number;
	otherIncome?: number;
}

export interface ThemisPaymentObligationsDto {
	loanPayment?: number;
	mortgagePayment?: number;
	personalLoanPayment?: number;
	childSupportPayment?: number;
	otherPayment?: number;
}

export interface ThemisApplicantDto {
	role: ThemisApplicantRole;
	isMainOwner?: boolean;
	name: string;
	firstSurname: string;
	lastSurname?: string;
	idDocumentType?: 'NIF' | 'NIE' | 'PASSPORT' | 'CIF' | 'OTHER';
	idDocumentNumber?: string;
	idDocumentValidUntil?: string;
	email?: string;
	phone?: string;
	acceptsTerms?: boolean;
	acceptsMarketing?: boolean;
	birthdate?: string;
	nationality?: string;
	maritalStatus?: string;
	currentAddress?: ThemisAddressDto;
	currentHousing?: string;
	familyMembers?: number;
	employment?: ThemisEmploymentDto;
	income?: ThemisIncomeDto;
	obligations?: ThemisPaymentObligationsDto;
}

export interface ThemisPropertyDto {
	address: ThemisAddressDto;
	propertyType?: 'NEW_CONSTRUCTION' | 'SECOND_HAND';
	useType?: 'MAIN' | 'SECOND' | 'INVESTOR' | 'OTHER';
	state?: 'HAVE_DECIDE' | 'SEARCHING' | 'DEPOSIT_PAID' | 'RESERVATION_DONE';
	price?: number;
	appraisalAmount?: number;
}

export interface ThemisMortgageDto {
	price: number;
	amount: number;
	savings?: number;
	termMonths?: number;
	ratePreference?: ThemisRateType;
	purchaseForecast?: string;
}

export interface ThemisSubrogationDto {
	dateEndMortgage: string;
	dateSign: string;
	amount: number;
	reason: 'improveMortgage' | 'increaseCapitalRenovations' | 'increaseCapitalLiquidity';
	originalPurchasePrice: number;
	currentTin: number;
	currentRate: ThemisRateType;
	whenSigned?: 'MORE_THAN_ONE_YEAR' | 'LESS_THAN_ONE_YEAR';
	address?: ThemisAddressDto;
}

export interface ThemisOfferStageDto {
	tin?: number;
	quote?: number;
	termMonths?: number;
}

export interface ThemisOfferLinkageDto {
	/** Si la vinculación se aplica en la oferta. */
	isLinked: boolean;
	/** Bonificación sobre el tipo (valor negativo: reduce el TIN/TAE). */
	bonusValue?: number;
	/** Coste asociado para el cliente por aplicar la vinculación (≥ 0). */
	costValue?: number;
}

export type ThemisLinkageKey =
	| 'homeInsurance'
	| 'lifeInsurance'
	| 'payrollDomiciliation'
	| 'protectedPayments'
	| 'creditCard'
	| 'alarmSystem'
	| 'pensionPlan'
	| 'investmentFunds';

export type ThemisOfferLinkagesDto = Partial<Record<ThemisLinkageKey, ThemisOfferLinkageDto>>;

export interface ThemisOfferInputDto {
	rateType?: ThemisRateType;
	tinInitial?: number;
	quoteInitial?: number;
	tinFinal?: number;
	quoteFinal?: number;
	tae?: number;
	stages?: ThemisOfferStageDto[];
	linkages?: ThemisOfferLinkagesDto;
}

export interface ThemisCloseInfoDto {
	closeDate?: string;
	reason?: string;
	subreason?: string;
	description?: string;
}

// ── Intake: alta ─────────────────────────────────────────────────────────────

export interface ThemisCreateOperationRequest {
	externalId?: string;
	type: ThemisOperationType;
	requester: ThemisRequesterDto;
	riskManager?: ThemisRiskManagerDto;
	applicants: ThemisApplicantDto[];
	property?: ThemisPropertyDto;
	mortgage?: ThemisMortgageDto;
	subrogation?: ThemisSubrogationDto;
	offer?: ThemisOfferInputDto;
	comments?: string;
	metadata?: Record<string, unknown>;
	/** Modo handoff. Por defecto `true` en el contrato. */
	isHandoff?: boolean;
}

/** Recurso base de una operación (listado / creación síncrona). */
export interface ThemisOperationResource {
	operationId: string;
	externalId?: string;
	origin: ThemisOperationOrigin;
	name?: string;
	type: ThemisOperationType;
	status: ThemisOperationStatus;
	stage: string;
	substage?: string;
	amount?: number;
	province?: string;
	riskManager?: ThemisRiskManagerDto;
	createdAt: string;
	updatedAt?: string;
}

/** Respuesta 202 del alta (asíncrona / handoff). */
export interface ThemisOperationAcceptedResource {
	operationId: string;
	externalId?: string;
	status: ThemisCreationStatus;
	statusUrl: string;
	/** Presente solo si el alta llegó con `isHandoff=true`. */
	continuationUrl?: string;
}

export interface ThemisOperationCreationStatusResource {
	operationId: string;
	externalId?: string;
	status: ThemisCreationStatus;
	error?: string;
	errorType?: ThemisCreationErrorType;
	statusClass?: ThemisCreationStatusClass;
	attempts?: number;
	maxAttempts?: number;
	/**
	 * Solo en handoff `PROCESSED`: JWT del usuario para iniciar sesión en la app
	 * de cliente (Estigia), concatenándolo al final de la URL base configurada.
	 */
	accessToken?: string;
	/** Solo en handoff: `true` si el usuario ya existía antes de este alta. */
	userPreexisted?: boolean;
}

// ── Intake: conciliación (write-back) ────────────────────────────────────────

export interface ThemisSyncOperationItem {
	operationId: string;
	externalId: string;
}

export interface ThemisSyncOperationsRequest {
	items: ThemisSyncOperationItem[];
}

export interface ThemisSyncOperationResultItem {
	operationId: string;
	externalId?: string;
	status: ThemisSyncStatus;
}

export interface ThemisOperationSyncResult {
	items: ThemisSyncOperationResultItem[];
}

export interface ThemisPendingSyncOperationResource {
	operationId: string;
}

export interface ThemisPendingSyncOperationsResult {
	nextCursor?: string;
	hasMore: boolean;
	items: ThemisPendingSyncOperationResource[];
}

// ── Intake: handoff ──────────────────────────────────────────────────────────

export interface RedeemLaunchTokenRequest {
	launchToken: string;
}

export interface RedeemLaunchTokenResponse {
	sessionToken: string;
	expiresIn?: number;
	/** Conveniencia del mock: la operación asociada al launchToken. */
	operationId?: string;
}

// ── Query: listado + change-feed ─────────────────────────────────────────────

export interface ThemisListOperationsQuery {
	cursor?: string;
	limit?: number;
	sort?: ThemisSortDirection;
	status?: ThemisOperationStatus;
	stage?: string;
	substage?: string;
	type?: ThemisOperationType;
	externalId?: string;
	createdFrom?: string;
	createdTo?: string;
	province?: string;
	amountMin?: number;
	amountMax?: number;
	riskManagerEmail?: string;
	/** Obligatorio en el contrato (default ALL). */
	linked: ThemisLinkedFilter;
}

export interface ThemisOperationListResult {
	nextCursor?: string;
	hasMore: boolean;
	items: ThemisOperationResource[];
}

export interface ThemisListChangesQuery {
	cursor?: string;
	/** Última `version` procesada. Ignorado si se envía `cursor`. */
	since?: string;
	/** Obligatorio (default 50). */
	limit: number;
	/** Obligatorio (default LINKED). */
	linked: ThemisLinkedFilter;
	/** Obligatorio (default ALL). */
	origin: ThemisOperationOrigin | 'ALL';
}

export interface ThemisOperationChangeResource {
	operationId: string;
	externalId?: string | null;
	origin: ThemisOperationOrigin;
	type: ThemisOperationType;
	status: ThemisOperationStatus;
	stage?: string;
	substage?: string;
	/** Marca de progreso, creciente. Guarda el máximo y reenvíalo como `since`. */
	version: string;
	createdAt: string;
	updatedAt: string;
}

export interface ThemisOperationChangeResult {
	nextCursor?: string;
	hasMore: boolean;
	items: ThemisOperationChangeResource[];
}

// ── Query: feed de hitos (HITOS) ─────────────────────────────────────────────
//
// Feed *separado* del change-feed. El change-feed refleja el *drift* de
// estado/etapa de la operación; el feed de hitos publica las transiciones de
// *negocio* (los HITOS) que la operación cumple o deja de cumplir a lo largo del
// tiempo. Un mismo `(operationId, milestoneType)` puede recurrir en el tiempo
// (`ACHIEVED` ↔ `REVOKED`); aplica las transiciones en orden de `version`. Es un
// índice *sin datos personales*.

/** Transición de un hito: cumplido o revocado (la operación dejó de cumplirlo). */
export type ThemisMilestoneStatus = 'ACHIEVED' | 'REVOKED';

/** Origen de una transición de hito. */
export type ThemisMilestoneSource = 'CORE' | 'DOCS' | 'BACKOFFICE' | 'REQUIREMENTS';

/**
 * Una transición de hito. Sin PII. El `milestoneType` es el código del catálogo
 * (p. ej. `OPERATION_CREATED`, `READY_TO_BANK`, `DOCUMENTATION_COMPLETE`).
 */
export interface ThemisOperationMilestoneItem {
	operationId: string;
	milestoneType: string;
	/** Transición. `REVOKED` = la operación dejó de cumplir el hito. */
	status: ThemisMilestoneStatus;
	source: ThemisMilestoneSource;
	occurredAt: string | null;
	/** Marca de progreso, creciente. Guarda el máximo y reenvíalo como `since`. */
	version: string;
	/** Escalares sin PII; p. ej. el motivo del `REVOKED`. */
	payload?: Record<string, unknown> | null;
}

/** Filtros del feed de hitos. Todos opcionales y combinables (AND). */
export interface ThemisMilestoneFeedFilters {
	/** Uno o varios `milestoneType`. */
	types?: string[];
	/** p. ej. solo `REVOKED` para reaccionar a pérdidas. */
	status?: ThemisMilestoneStatus[];
	sources?: ThemisMilestoneSource[];
	/** Acotar a operaciones concretas. */
	operationIds?: string[];
	/** ISO-8601; cota inferior de `occurredAt`. */
	occurredFrom?: string;
	/** ISO-8601; cota superior de `occurredAt`. */
	occurredTo?: string;
}

export interface ThemisMilestoneFeedQuery {
	cursor?: string;
	/** Última `version` procesada. Ignorado si se envía `cursor`. */
	since?: string;
	/** Tamaño de página (default 50, máx 500). */
	limit: number;
	filters?: ThemisMilestoneFeedFilters;
}

export interface ThemisOperationMilestoneFeedResult {
	nextCursor?: string;
	hasMore: boolean;
	items: ThemisOperationMilestoneItem[];
}

// ── Query: detalle + histórico ───────────────────────────────────────────────

export interface ThemisOperationDetailResource extends ThemisOperationResource {
	applicants: ThemisApplicantDto[];
	property?: ThemisPropertyDto;
	mortgage?: ThemisMortgageDto;
	subrogation?: ThemisSubrogationDto;
	closed?: ThemisCloseInfoDto;
}

export interface ThemisOperationHistoryEntryResource {
	id: string;
	stage: string;
	substage?: string;
	status: ThemisOperationStatus;
	name?: string;
	analyst?: ThemisRiskManagerDto;
	createdAt: string;
	updatedAt: string;
}

export interface ThemisOperationHistoryResult {
	items: ThemisOperationHistoryEntryResource[];
}

// ── Query: documentos ─────────────────────────────────────────────────────────
//
// Los documentos son **solo lectura / solo descarga**: no hay subida, borrado ni
// escritura. Se identifican por `operationId` (el ULID público) y quedan aislados
// por `managementCode` del JWT → 404 si la operación no es de tu ámbito. No
// aparecen en el change-feed y las lecturas son síncronas (sin patrón 202).

/** Estado de un documento dentro de una operación. */
export type ThemisDocumentStatus = 'PENDING' | 'NO_LABELED' | 'LABELED' | 'VERIFIED';

/** Un documento de la operación. El listado excluye los de `owner === 'generic'`. */
export interface ThemisDocumentResource {
	documentId: string;
	/** Clave del catálogo documental del banco (p. ej. `NOMINA`, `DNI`, `IRPF`). */
	type: string;
	status: ThemisDocumentStatus;
	name: string;
	mime?: string;
	size?: number;
	/** A quién pertenece el documento (p. ej. un titular o `all`). */
	owner?: string;
	/** Nº de página, para documentos multipágina desglosados. */
	page?: number;
	createdAt: string;
}

/** Listado de documentos de una operación. **Sin paginación** (lista acotada). */
export interface ThemisDocumentListResult {
	items: ThemisDocumentResource[];
}

/** Documento requerido para la operación, por clave `owner:type`. */
export interface ThemisDocumentRequirementResource {
	owner: string;
	type: string;
	mandatory: boolean;
}

/** Documento presente (en estado `LABELED`/`VERIFIED`), por clave `owner:type`. */
export interface ThemisPresentDocumentResource {
	owner: string;
	type: string;
	status: ThemisDocumentStatus;
}

/**
 * Estado documental de una operación: qué se requiere, qué hay presente y qué
 * queda pendiente. `pending = required − present` por clave `owner:type`.
 */
export interface ThemisDocumentStatusResult {
	required: ThemisDocumentRequirementResource[];
	present: ThemisPresentDocumentResource[];
	pending: ThemisDocumentRequirementResource[];
}

/**
 * URL presignada de descarga (S3, TTL ~5 min, `contentDisposition=attachment`).
 * La descarga va **directa a S3, fuera de Themis** (no pasa por la API).
 */
export interface ThemisDocumentUrlResource {
	url: string;
	expiresAt: string;
	contentType?: string;
}
