#!/usr/bin/env node
/**
 * Reset total de las bases de datos SQLite en disco.
 *
 * Borra el almacén local del integrador (DATABASE_PATH, por defecto
 * ./data/integrator.db) y el backend simulado de Themis (themis-mock.db en el
 * mismo directorio), incluyendo sus ficheros auxiliares -wal y -shm.
 *
 * Uso: `yarn db:reset`. Detén antes el servidor de desarrollo.
 */
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/integrator.db');
const dir = dirname(dbPath);
const mockPath = join(dir, 'themis-mock.db');

/** Devuelve el fichero base y sus auxiliares de SQLite en modo WAL. */
function withSidecars(file) {
	return [file, `${file}-wal`, `${file}-shm`];
}

const targets = [...withSidecars(dbPath), ...withSidecars(mockPath)];

let removed = 0;
for (const file of targets) {
	rmSync(file, { force: true });
	console.log(`borrado (si existía): ${file}`);
	removed += 1;
}

console.log(`Reset completado: ${removed} rutas procesadas.`);
