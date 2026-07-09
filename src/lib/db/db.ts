/**
 * Almacén local del integrador (SQLite vía better-sqlite3).
 *
 * Es la base de datos "de tu lado": el mapeo `externalId` ↔ `operationId`, el
 * snapshot del alta, el estado que vas conociendo por las lecturas, el progreso
 * del change-feed (`since`) y un log de auditoría de las llamadas a Themis.
 *
 * NB: el "backend" simulado de Themis (modo mock) vive en OTRA base de datos
 * (`themis-mock.db`); esto es solo el almacén del integrador.
 */
import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
	if (instance) return instance;

	const path = resolve(process.env.DATABASE_PATH ?? './data/integrator.db');
	mkdirSync(dirname(path), { recursive: true });

	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	migrate(db);
	instance = db;
	return db;
}

function migrate(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS operations (
			id              TEXT PRIMARY KEY,           -- id local (ULID)
			external_id     TEXT UNIQUE,                -- tu referencia (idempotencia de negocio)
			operation_id    TEXT UNIQUE,                -- id público de Themis (cuando se conoce)
			type            TEXT NOT NULL,              -- MORTGAGE | SUBROGATION
			is_handoff      INTEGER NOT NULL DEFAULT 1,
			creation_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|RECEIVED|PROCESSING|PROCESSED|FAILED
			continuation_url TEXT,
			status_url      TEXT,
			idempotency_key TEXT,
			request_json    TEXT NOT NULL,              -- snapshot del cuerpo del alta
			last_error      TEXT,
			last_error_type TEXT,
			-- estado de negocio (de las lecturas):
			business_status TEXT,
			stage           TEXT,
			substage        TEXT,
			origin          TEXT NOT NULL DEFAULT 'INTAKE',
			amount          REAL,
			province        TEXT,
			created_at      TEXT NOT NULL,
			updated_at      TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS feed_state (
			feed_key   TEXT PRIMARY KEY,   -- p.ej. "changes:ALL:LINKED"
			since      TEXT,               -- última version procesada
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS audit_log (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			ts          TEXT NOT NULL,
			method      TEXT NOT NULL,
			path        TEXT NOT NULL,
			status      INTEGER,
			code        TEXT,
			duration_ms INTEGER,
			note        TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
	`);
}

export function nowIso(): string {
	return new Date().toISOString();
}
