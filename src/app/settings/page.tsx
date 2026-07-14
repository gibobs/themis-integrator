/**
 * Ajustes del integrador.
 *
 * Muestra la configuración efectiva de Themis (resuelta del entorno en el
 * servidor), documenta las variables de entorno y las URLs base por entorno, y
 * ofrece el reset del almacén local. La configuración es solo lectura: se toca
 * en `.env.local`, no desde la UI (las credenciales nunca llegan al navegador).
 */
import { KeyRound, Server, Settings2, Database } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getThemisConfig, hasCredentials } from '@/lib/themis';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

const ENV_URLS: [string, string][] = [
	['development', 'https://dev.api.gibobs.net'],
	['staging', 'https://staging.api.gibobs.net'],
	['production', 'https://api.gibobs.com'],
];

const ENV_VARS: [string, string][] = [
	[
		'THEMIS_ENV',
		'Entorno de Themis: development (por defecto), staging o production. Determina la URL base.',
	],
	[
		'THEMIS_MOCK',
		'Modo del cliente. Cualquier valor distinto de 0 usa el backend simulado local (por defecto). Ponlo a 0 para llamar a la API real.',
	],
	[
		'THEMIS_API_KEY',
		'Clave (key) de las credenciales M2M del partner. Solo se usa en modo real.',
	],
	[
		'THEMIS_API_SECRET',
		'Secreto (secret) de las credenciales M2M. Nunca se expone al navegador (server-only).',
	],
	[
		'THEMIS_TOKEN',
		'Token de acceso a Themis. Junto a key y secret habilita el modo real (BYOK).',
	],
	[
		'DATABASE_PATH',
		'Ruta del almacén local SQLite del integrador (por defecto ./data/integrator.db).',
	],
	[
		'ESTIGIA_BASE_URL',
		'URL de la app de cliente (Estigia) para entrar con el JWT del usuario tras un handoff. Solo en modo real. Incluye el sufijo del estilo de acceso, ya que el JWT se concatena al final: https://dev.estigia.<managementCode>.gibobs.one/token/ o https://dev.estigia.<managementCode>.gibobs.one/?token=.',
	],
];

export default function SettingsPage() {
	const cfg = getThemisConfig();
	const creds = hasCredentials(cfg);

	return (
		<div>
			<PageHeader
				title="Ajustes"
				description="Configuración efectiva de Themis y datos locales. La configuración es de solo lectura: se ajusta en tu .env.local, no desde aquí."
			/>

			<div className="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Server className="size-4" /> Entorno actual
						</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1">
								<dt className="text-xs uppercase tracking-wide text-muted-foreground">Entorno</dt>
								<dd className="font-mono text-sm">{cfg.env}</dd>
							</div>
							<div className="space-y-1">
								<dt className="text-xs uppercase tracking-wide text-muted-foreground">URL base</dt>
								<dd className="font-mono text-sm">{cfg.baseUrl}</dd>
							</div>
							<div className="space-y-1">
								<dt className="text-xs uppercase tracking-wide text-muted-foreground">Modo</dt>
								<dd>
									{cfg.mock ? (
										<Badge tone="warning">Mock (backend simulado)</Badge>
									) : (
										<Badge tone="success">Real (API de Themis)</Badge>
									)}
								</dd>
							</div>
							<div className="space-y-1">
								<dt className="text-xs uppercase tracking-wide text-muted-foreground">Credenciales</dt>
								<dd>
									{creds ? (
										<Badge tone="success">Presentes</Badge>
									) : (
										<Badge tone="neutral">Ausentes</Badge>
									)}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				<Callout tone="info" title="Cómo pasar a modo real">
					Por defecto todo corre contra un backend simulado local. Para llamar a la API real de
					Themis, en tu <code>.env.local</code> pon <code>THEMIS_MOCK=0</code> y rellena tus
					credenciales M2M (<code>THEMIS_API_KEY</code>, <code>THEMIS_API_SECRET</code> y{' '}
					<code>THEMIS_TOKEN</code>). Reinicia el servidor para que se apliquen.
				</Callout>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<KeyRound className="size-4" /> Variables de entorno
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="rounded-md border border-border">
							<Table>
								<THead>
									<TR>
										<TH>Variable</TH>
										<TH>Qué hace</TH>
									</TR>
								</THead>
								<TBody>
									{ENV_VARS.map(([name, desc]) => (
										<TR key={name}>
											<TD className="whitespace-nowrap font-mono text-xs">{name}</TD>
											<TD className="text-sm text-muted-foreground">{desc}</TD>
										</TR>
									))}
								</TBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Settings2 className="size-4" /> URLs base por entorno
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="rounded-md border border-border">
							<Table>
								<THead>
									<TR>
										<TH>Entorno (THEMIS_ENV)</TH>
										<TH>URL base</TH>
									</TR>
								</THead>
								<TBody>
									{ENV_URLS.map(([name, url]) => (
										<TR key={name}>
											<TD className="whitespace-nowrap font-mono text-xs">
												{name}
												{name === cfg.env && (
													<Badge tone="primary" className="ml-2">
														actual
													</Badge>
												)}
											</TD>
											<TD className="font-mono text-xs">{url}</TD>
										</TR>
									))}
								</TBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="size-4" /> Datos locales
						</CardTitle>
					</CardHeader>
					<CardContent>
						<SettingsClient />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
