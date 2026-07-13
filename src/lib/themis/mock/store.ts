/**
 * "Backend" simulado de Themis (solo modo mock).
 *
 * Vive en su propia base de datos SQLite (`themis-mock.db`), separada del
 * almacén del integrador, para modelar fielmente los dos lados. Simula:
 *  - alta con estado derivado del tiempo (RECEIVED→PROCESSING→PROCESSED|FAILED),
 *  - `version` monotónica para el change-feed (el "drift" avanza al leer),
 *  - operaciones de autoprescripción sin `externalId` para la conciliación.
 */
import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

let instance: Database.Database | null = null;

export function getMockDb(): Database.Database {
	if (instance) return instance;
	const integratorPath = resolve(process.env.DATABASE_PATH ?? './data/integrator.db');
	const path = join(dirname(integratorPath), 'themis-mock.db');
	mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	migrate(db);
	seed(db);
	// Sembrado aparte e idempotente: así una `themis-mock.db` creada antes de la
	// parte de documentos también los recibe al arrancar, sin `yarn db:reset`.
	seedDocuments(db);
	instance = db;
	return db;
}

function migrate(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS mock_operations (
			operation_id        TEXT PRIMARY KEY,
			external_id         TEXT,
			origin              TEXT NOT NULL,
			type                TEXT NOT NULL,
			name                TEXT,
			business_status     TEXT NOT NULL DEFAULT 'active',
			stage               TEXT,
			substage            TEXT,
			amount              REAL,
			province            TEXT,
			risk_manager_json   TEXT,
			detail_json         TEXT,
			is_handoff          INTEGER NOT NULL DEFAULT 1,
			creation_status     TEXT NOT NULL DEFAULT 'RECEIVED',
			creation_started_at INTEGER NOT NULL,
			fail                INTEGER NOT NULL DEFAULT 0,
			launch_token        TEXT,
			session_token       TEXT,
			version             INTEGER NOT NULL,
			created_at          TEXT NOT NULL,
			updated_at          TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS mock_idempotency (
			key          TEXT PRIMARY KEY,
			operation_id TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS mock_meta (
			k TEXT PRIMARY KEY,
			v INTEGER NOT NULL
		);
		-- Documentos de una operación (solo lectura). El listado real excluye los
		-- de owner = 'generic'; aquí se siembran algunos para ilustrar la exclusión.
		CREATE TABLE IF NOT EXISTS mock_documents (
			document_id  TEXT PRIMARY KEY,
			operation_id TEXT NOT NULL,
			type         TEXT NOT NULL,
			status       TEXT NOT NULL,
			name         TEXT NOT NULL,
			mime         TEXT,
			size         INTEGER,
			owner        TEXT,
			page         INTEGER,
			created_at   TEXT NOT NULL
		);
		-- Requisitos documentales por operación (clave owner:type). El estado
		-- documental sale de cruzar esto con los documentos presentes.
		CREATE TABLE IF NOT EXISTS mock_document_requirements (
			operation_id TEXT NOT NULL,
			owner        TEXT NOT NULL,
			type         TEXT NOT NULL,
			mandatory    INTEGER NOT NULL DEFAULT 1
		);
	`);
	const seq = db.prepare(`SELECT v FROM mock_meta WHERE k = 'versionSeq'`).get() as
		| { v: number }
		| undefined;
	if (!seq) db.prepare(`INSERT INTO mock_meta (k, v) VALUES ('versionSeq', 0)`).run();
}

export function nextVersion(db: Database.Database): number {
	db.prepare(`UPDATE mock_meta SET v = v + 1 WHERE k = 'versionSeq'`).run();
	return (db.prepare(`SELECT v FROM mock_meta WHERE k = 'versionSeq'`).get() as { v: number }).v;
}

export interface MockRow {
	operation_id: string;
	external_id: string | null;
	origin: string;
	type: string;
	name: string | null;
	business_status: string;
	stage: string | null;
	substage: string | null;
	amount: number | null;
	province: string | null;
	risk_manager_json: string | null;
	detail_json: string | null;
	is_handoff: number;
	creation_status: string;
	creation_started_at: number;
	fail: number;
	launch_token: string | null;
	session_token: string | null;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface MockDocumentRow {
	document_id: string;
	operation_id: string;
	type: string;
	status: string;
	name: string;
	mime: string | null;
	size: number | null;
	owner: string | null;
	page: number | null;
	created_at: string;
}

export interface MockRequirementRow {
	operation_id: string;
	owner: string;
	type: string;
	mandatory: number;
}

// ── Derivación temporal del estado del alta ──────────────────────────────────

const RECEIVED_MS = 1500;
const PROCESSING_MS = 4000;

function deriveCreationStatus(row: MockRow, now: number): string {
	const elapsed = now - row.creation_started_at;
	if (elapsed < RECEIVED_MS) return 'RECEIVED';
	if (elapsed < PROCESSING_MS) return 'PROCESSING';
	return row.fail ? 'FAILED' : 'PROCESSED';
}

/**
 * Materializa el progreso de una operación: si su estado de alta ha avanzado con
 * el tiempo, lo persiste y sube la `version` (esto genera el "drift" del feed).
 */
export function materialize(db: Database.Database, row: MockRow, now: number): MockRow {
	const derived = deriveCreationStatus(row, now);
	if (derived === row.creation_status) return row;

	const version = nextVersion(db);
	const ts = new Date(now).toISOString();
	const becameProcessed = derived === 'PROCESSED';
	db.prepare(
		`UPDATE mock_operations SET
			creation_status = @derived,
			business_status = CASE WHEN @becameProcessed = 1 THEN 'active' ELSE business_status END,
			stage = CASE WHEN @becameProcessed = 1 AND stage IS NULL THEN 'documentation' ELSE stage END,
			version = @version,
			updated_at = @ts
		 WHERE operation_id = @id`,
	).run({
		id: row.operation_id,
		derived,
		becameProcessed: becameProcessed ? 1 : 0,
		version,
		ts,
	});
	return db.prepare(`SELECT * FROM mock_operations WHERE operation_id = ?`).get(row.operation_id) as MockRow;
}

export function materializeAll(db: Database.Database, now: number): void {
	const rows = db.prepare(`SELECT * FROM mock_operations`).all() as MockRow[];
	for (const row of rows) materialize(db, row, now);
}

export function isQueryable(row: MockRow): boolean {
	return row.creation_status === 'PROCESSED';
}

// ── Seed ─────────────────────────────────────────────────────────────────────

function seed(db: Database.Database): void {
	const done = db.prepare(`SELECT v FROM mock_meta WHERE k = 'seeded'`).get() as
		| { v: number }
		| undefined;
	if (done) return;

	const longAgo = Date.now() - 60 * 60 * 1000; // ya PROCESSED
	const insert = db.prepare(
		`INSERT INTO mock_operations
			(operation_id, external_id, origin, type, name, business_status, stage, substage, amount, province,
			 risk_manager_json, detail_json, is_handoff, creation_status, creation_started_at, fail, version, created_at, updated_at)
		 VALUES (@operationId, @externalId, @origin, @type, @name, @businessStatus, @stage, @substage, @amount, @province,
			 @riskManagerJson, @detailJson, 0, 'PROCESSED', @startedAt, 0, @version, @createdAt, @updatedAt)`,
	);

	const seedRows: Array<Omit<Parameters<typeof insert.run>[0], 'version' | 'startedAt'> & object> = [
		{
			operationId: '01J8Z9K3QF7MA0INTAKESEED01',
			externalId: 'CRM-1001',
			origin: 'INTAKE',
			type: 'MORTGAGE',
			name: 'Lovelace · Madrid',
			businessStatus: 'active',
			stage: 'analysis',
			substage: 'risk-review',
			amount: 200000,
			province: 'Madrid',
			riskManagerJson: JSON.stringify({ name: 'Sofía Ruiz', email: 'sofia.ruiz@partner.com' }),
			detailJson: JSON.stringify({
				applicants: [
					{
						role: 'OWNER',
						isMainOwner: true,
						name: 'Ada',
						firstSurname: 'Lovelace',
						email: 'ada@example.com',
						phone: '+34600000001',
					},
				],
				property: { address: { zip: '28001', city: 'Madrid', province: 'Madrid' } },
				mortgage: { price: 250000, amount: 200000, termMonths: 300 },
			}),
			createdAt: new Date(longAgo).toISOString(),
			updatedAt: new Date(longAgo).toISOString(),
		},
		{
			operationId: '01J8Z9K3QF7MA0INTAKESEED02',
			externalId: 'CRM-1002',
			origin: 'INTAKE',
			type: 'SUBROGATION',
			name: 'Turing · Barcelona',
			businessStatus: 'active',
			stage: 'documentation',
			substage: null,
			amount: 150000,
			province: 'Barcelona',
			riskManagerJson: JSON.stringify({ name: 'Sofía Ruiz', email: 'sofia.ruiz@partner.com' }),
			detailJson: JSON.stringify({
				applicants: [
					{
						role: 'OWNER',
						isMainOwner: true,
						name: 'Alan',
						firstSurname: 'Turing',
						email: 'alan@example.com',
						phone: '+34600000002',
					},
				],
				subrogation: {
					dateEndMortgage: '2031-01-01',
					dateSign: '2019-01-01',
					amount: 150000,
					reason: 'improveMortgage',
					originalPurchasePrice: 220000,
					currentTin: 2.9,
					currentRate: 'VARIABLE',
				},
			}),
			createdAt: new Date(longAgo + 1000).toISOString(),
			updatedAt: new Date(longAgo + 1000).toISOString(),
		},
		// Autoprescripciones SIN externalId → pendientes de conciliar (write-back).
		{
			operationId: '01J8Z9K3QF7MA0AUTOPRES0001',
			externalId: null,
			origin: 'AUTOPRESCRIPTION',
			type: 'MORTGAGE',
			name: 'Hopper · Valencia',
			businessStatus: 'active',
			stage: 'intake',
			substage: null,
			amount: 180000,
			province: 'Valencia',
			riskManagerJson: null,
			detailJson: JSON.stringify({
				applicants: [
					{ role: 'OWNER', isMainOwner: true, name: 'Grace', firstSurname: 'Hopper', email: 'grace@example.com' },
				],
				property: { address: { zip: '46001', city: 'Valencia', province: 'Valencia' } },
				mortgage: { price: 210000, amount: 180000 },
			}),
			createdAt: new Date(longAgo + 2000).toISOString(),
			updatedAt: new Date(longAgo + 2000).toISOString(),
		},
		{
			operationId: '01J8Z9K3QF7MA0AUTOPRES0002',
			externalId: null,
			origin: 'AUTOPRESCRIPTION',
			type: 'MORTGAGE',
			name: 'Hamilton · Sevilla',
			businessStatus: 'active',
			stage: 'intake',
			substage: null,
			amount: 240000,
			province: 'Sevilla',
			riskManagerJson: null,
			detailJson: JSON.stringify({
				applicants: [
					{ role: 'OWNER', isMainOwner: true, name: 'Margaret', firstSurname: 'Hamilton', email: 'margaret@example.com' },
				],
				property: { address: { zip: '41001', city: 'Sevilla', province: 'Sevilla' } },
				mortgage: { price: 300000, amount: 240000 },
			}),
			createdAt: new Date(longAgo + 3000).toISOString(),
			updatedAt: new Date(longAgo + 3000).toISOString(),
		},
		{
			operationId: '01J8Z9K3QF7MA0AUTOPRES0003',
			externalId: null,
			origin: 'AUTOPRESCRIPTION',
			type: 'SUBROGATION',
			name: 'Johnson · Bilbao',
			businessStatus: 'active',
			stage: 'intake',
			substage: null,
			amount: 130000,
			province: 'Bizkaia',
			riskManagerJson: null,
			detailJson: JSON.stringify({
				applicants: [
					{ role: 'OWNER', isMainOwner: true, name: 'Katherine', firstSurname: 'Johnson', email: 'katherine@example.com' },
				],
				subrogation: {
					dateEndMortgage: '2032-01-01',
					dateSign: '2020-01-01',
					amount: 130000,
					reason: 'increaseCapitalLiquidity',
					originalPurchasePrice: 190000,
					currentTin: 3.1,
					currentRate: 'FIXED',
				},
			}),
			createdAt: new Date(longAgo + 4000).toISOString(),
			updatedAt: new Date(longAgo + 4000).toISOString(),
		},
	];

	const tx = db.transaction(() => {
		for (const row of seedRows) {
			insert.run({ ...row, startedAt: longAgo, version: nextVersion(db) });
		}
		db.prepare(`INSERT INTO mock_meta (k, v) VALUES ('seeded', 1)`).run();
	});
	tx();
}

/**
 * Siembra documentos y requisitos para las operaciones INTAKE (ya PROCESSED),
 * con una mezcla que deja documentos presentes (`VERIFIED`/`LABELED`) y algún
 * requisito **pendiente**, para que el estado documental sea ilustrativo.
 *
 * `owner`/`type` usan cadenas realistas del catálogo del banco. Se incluye un
 * documento de `owner = 'generic'` que el listado debe **excluir**, y uno en
 * `NO_LABELED` (aparece en el listado pero **no** cuenta como presente).
 *
 * Se sembra con su **propio** flag (`docsSeeded`), independiente del de las
 * operaciones, para que una base creada antes de esta parte reciba los documentos
 * al arrancar (las operaciones sembradas tienen IDs estables, ya existen).
 */
function seedDocuments(db: Database.Database): void {
	const done = db.prepare(`SELECT v FROM mock_meta WHERE k = 'docsSeeded'`).get() as
		| { v: number }
		| undefined;
	if (done) return;

	const longAgo = Date.now() - 60 * 60 * 1000;
	const docInsert = db.prepare(
		`INSERT INTO mock_documents
			(document_id, operation_id, type, status, name, mime, size, owner, page, created_at)
		 VALUES (@documentId, @operationId, @type, @status, @name, @mime, @size, @owner, @page, @createdAt)`,
	);
	const reqInsert = db.prepare(
		`INSERT INTO mock_document_requirements (operation_id, owner, type, mandatory)
		 VALUES (@operationId, @owner, @type, @mandatory)`,
	);

	const OP1 = '01J8Z9K3QF7MA0INTAKESEED01'; // Ada Lovelace · MORTGAGE
	const OP2 = '01J8Z9K3QF7MA0INTAKESEED02'; // Alan Turing · SUBROGATION
	const ts = (offset: number) => new Date(longAgo + offset).toISOString();

	const documents = [
		// OP1 — presentes (cuentan) + un requerido sin etiquetar + uno genérico (excluido).
		{
			documentId: '01J8ZDOC0000000000NOMINA01',
			operationId: OP1,
			type: 'NOMINA',
			status: 'VERIFIED',
			name: 'nomina-junio.pdf',
			mime: 'application/pdf',
			size: 184320,
			owner: 'Ada Lovelace',
			page: null,
			createdAt: ts(5000),
		},
		{
			documentId: '01J8ZDOC000000000000DNI001',
			operationId: OP1,
			type: 'DNI',
			status: 'LABELED',
			name: 'dni-anverso-reverso.pdf',
			mime: 'application/pdf',
			size: 96040,
			owner: 'Ada Lovelace',
			page: null,
			createdAt: ts(6000),
		},
		{
			documentId: '01J8ZDOC00000000000IRPF001',
			operationId: OP1,
			type: 'IRPF',
			status: 'NO_LABELED',
			name: 'irpf-2024.pdf',
			mime: 'application/pdf',
			size: 210500,
			owner: 'Ada Lovelace',
			page: null,
			createdAt: ts(7000),
		},
		{
			documentId: '01J8ZDOC0000000GENERIC0001',
			operationId: OP1,
			type: 'CONDICIONES_GENERALES',
			status: 'VERIFIED',
			name: 'condiciones-generales.pdf',
			mime: 'application/pdf',
			size: 51200,
			owner: 'generic',
			page: null,
			createdAt: ts(8000),
		},
		// OP2 — dos presentes; el certificado de deuda queda pendiente.
		{
			documentId: '01J8ZDOC000000000000DNI002',
			operationId: OP2,
			type: 'DNI',
			status: 'VERIFIED',
			name: 'dni-alan-turing.pdf',
			mime: 'application/pdf',
			size: 90112,
			owner: 'Alan Turing',
			page: null,
			createdAt: ts(9000),
		},
		{
			documentId: '01J8ZDOC00000000ESCRITURA2',
			operationId: OP2,
			type: 'ESCRITURA',
			status: 'LABELED',
			name: 'escritura-vivienda.pdf',
			mime: 'application/pdf',
			size: 524288,
			owner: 'Alan Turing',
			page: null,
			createdAt: ts(10000),
		},
	];

	const requirements = [
		// OP1: NOMINA y DNI quedan cubiertos; IRPF (obligatorio) y VIDA_LABORAL
		// (opcional) quedan pendientes.
		{ operationId: OP1, owner: 'Ada Lovelace', type: 'NOMINA', mandatory: 1 },
		{ operationId: OP1, owner: 'Ada Lovelace', type: 'DNI', mandatory: 1 },
		{ operationId: OP1, owner: 'Ada Lovelace', type: 'IRPF', mandatory: 1 },
		{ operationId: OP1, owner: 'Ada Lovelace', type: 'VIDA_LABORAL', mandatory: 0 },
		// OP2: DNI y ESCRITURA cubiertos; el certificado de deuda queda pendiente.
		{ operationId: OP2, owner: 'Alan Turing', type: 'DNI', mandatory: 1 },
		{ operationId: OP2, owner: 'Alan Turing', type: 'ESCRITURA', mandatory: 1 },
		{ operationId: OP2, owner: 'Alan Turing', type: 'CERTIFICADO_DEUDA_PENDIENTE', mandatory: 1 },
	];

	const tx = db.transaction(() => {
		for (const doc of documents) docInsert.run(doc);
		for (const req of requirements) reqInsert.run(req);
		db.prepare(`INSERT INTO mock_meta (k, v) VALUES ('docsSeeded', 1)`).run();
	});
	tx();
}
