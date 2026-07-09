import type { NextConfig } from 'next';

const config: NextConfig = {
	reactStrictMode: true,
	// better-sqlite3 es un módulo nativo: hay que dejar que se resuelva en el
	// runtime de Node (no empaquetarlo con el bundler de rutas/Server Components).
	serverExternalPackages: ['better-sqlite3'],
};

export default config;
