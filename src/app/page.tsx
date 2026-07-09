/**
 * Panel de inicio del integrador.
 *
 * Da una foto rápida del estado: qué operaciones tienes en tu almacén local,
 * contra qué entorno de Themis apuntas y las últimas llamadas realizadas.
 * Todo se calcula en servidor (almacén local + configuración), sin PII.
 */
import Link from 'next/link';
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	FilePlus2,
	GitCompare,
	KeyRound,
	Layers,
	Link2,
	List,
	Rss,
	Server,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { listLocal, countLocal } from '@/lib/db/operations';
import { recentAudit } from '@/lib/db/audit';
import { getThemisConfig, hasCredentials } from '@/lib/themis';
import { dateTime } from '@/lib/util/format';
import type { Tone } from '@/lib/status';

export const dynamic = 'force-dynamic';

/** Tono para un status HTTP del log de auditoría. */
function statusTone(status: number | null): Tone {
	if (status == null) return 'neutral';
	if (status >= 500) return 'danger';
	if (status >= 400) return 'warning';
	if (status >= 200 && status < 300) return 'success';
	return 'neutral';
}

export default async function HomePage() {
	const total = countLocal();
	const ops = listLocal(500);
	const processed = ops.filter((o) => o.creationStatus === 'PROCESSED').length;
	const failedPending = ops.filter((o) => o.creationStatus === 'FAILED' || o.creationStatus === 'PENDING').length;
	const linked = ops.filter((o) => o.externalId).length;
	const unlinked = ops.length - linked;
	const cfg = getThemisConfig();
	const creds = hasCredentials(cfg);
	const audit = recentAudit(10);

	return (
		<div>
			<PageHeader
				title="Panel"
				description="Integrador de referencia para la API Themis de Gibobs: da de alta operaciones, sigue su estado y concilia con el change-feed."
			/>

			<div className="space-y-6">
				<Callout tone="info" title="Cómo funciona">
					Tú das de alta o simulas operaciones y Themis acuña un <code className="font-mono">operationId</code>{' '}
					estable como fuente de verdad. Luego sigues su estado, lees el change-feed para detectar cambios y
					concilias las operaciones que Themis crea por autoprescripción con tu almacén local.
				</Callout>

				{/* Stat tiles */}
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Operaciones locales</span>
							<Layers className="size-4 text-muted-foreground" />
						</div>
						<div className="mt-2 text-3xl font-semibold tabular-nums">{total}</div>
						<p className="mt-1 text-xs text-muted-foreground">en tu almacén local</p>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Procesadas</span>
							<CheckCircle2 className="size-4 text-success" />
						</div>
						<div className="mt-2 text-3xl font-semibold tabular-nums">{processed}</div>
						<div className="mt-1">
							<Badge tone="success">PROCESSED</Badge>
						</div>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Fallidas o pendientes</span>
							<AlertTriangle className="size-4 text-warning-foreground" />
						</div>
						<div className="mt-2 text-3xl font-semibold tabular-nums">{failedPending}</div>
						<div className="mt-1 flex flex-wrap gap-1">
							<Badge tone="danger">FAILED</Badge>
							<Badge tone="neutral">PENDING</Badge>
						</div>
					</Card>

					<Card className="p-5">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Enlazadas</span>
							<Link2 className="size-4 text-muted-foreground" />
						</div>
						<div className="mt-2 text-3xl font-semibold tabular-nums">{linked}</div>
						<p className="mt-1 text-xs text-muted-foreground">
							con externalId · {unlinked} sin enlazar
						</p>
					</Card>
				</div>

				{total > ops.length && (
					<p className="text-xs text-muted-foreground">
						Los recuentos por estado se calculan sobre las {ops.length} operaciones más recientes.
					</p>
				)}

				<div className="grid gap-6 lg:grid-cols-2">
					{/* Entorno */}
					<Card>
						<CardHeader className="flex-row items-center justify-between">
							<div className="space-y-1">
								<CardTitle>Entorno</CardTitle>
								<CardDescription>Contra qué instancia de Themis apunta el integrador.</CardDescription>
							</div>
							<Server className="size-5 text-muted-foreground" />
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Entorno</span>
								<Badge tone="primary">{cfg.env}</Badge>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">baseUrl</span>
								<span className="truncate font-mono text-xs">{cfg.baseUrl}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Modo</span>
								{cfg.mock ? (
									<Badge tone="info">Mock (simulado)</Badge>
								) : (
									<Badge tone="success">Real</Badge>
								)}
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-1.5 text-muted-foreground">
									<KeyRound className="size-3.5" /> Credenciales
								</span>
								{creds ? (
									<Badge tone="success">Configuradas</Badge>
								) : cfg.mock ? (
									<Badge tone="neutral">No requeridas en mock</Badge>
								) : (
									<Badge tone="warning">Sin credenciales</Badge>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Acciones rápidas */}
					<Card>
						<CardHeader>
							<CardTitle>Acciones rápidas</CardTitle>
							<CardDescription>Los flujos principales del integrador.</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-2 sm:grid-cols-2">
							<Link href="/operations/new">
								<Button className="w-full justify-start">
									<FilePlus2 className="size-4" /> Nueva operación
								</Button>
							</Link>
							<Link href="/operations">
								<Button variant="outline" className="w-full justify-start">
									<List className="size-4" /> Operaciones
								</Button>
							</Link>
							<Link href="/changes">
								<Button variant="outline" className="w-full justify-start">
									<Rss className="size-4" /> Change-feed
								</Button>
							</Link>
							<Link href="/reconciliation">
								<Button variant="outline" className="w-full justify-start">
									<GitCompare className="size-4" /> Conciliación
								</Button>
							</Link>
						</CardContent>
					</Card>
				</div>

				{/* Actividad reciente */}
				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<div className="space-y-1">
							<CardTitle>Actividad reciente</CardTitle>
							<CardDescription>Últimas llamadas a Themis (log de auditoría del integrador).</CardDescription>
						</div>
						<Activity className="size-5 text-muted-foreground" />
					</CardHeader>
					{audit.length === 0 ? (
						<CardContent>
							<div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-10 text-center">
								<Activity className="size-6 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">Todavía no hay llamadas registradas.</p>
								<Link href="/operations/new">
									<Button variant="outline" size="sm">
										Crea tu primera operación <ArrowRight className="size-3" />
									</Button>
								</Link>
							</div>
						</CardContent>
					) : (
						<div className="border-t border-border">
							<Table>
								<THead>
									<TR>
										<TH>Método</TH>
										<TH>Ruta</TH>
										<TH>Status</TH>
										<TH>Código</TH>
										<TH>Duración</TH>
										<TH>Hora</TH>
									</TR>
								</THead>
								<TBody>
									{audit.map((entry) => (
										<TR key={entry.id}>
											<TD>
												<Badge tone="neutral">{entry.method}</Badge>
											</TD>
											<TD className="max-w-[22rem] truncate font-mono text-xs">{entry.path}</TD>
											<TD>
												{entry.status != null ? (
													<Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TD>
											<TD className="font-mono text-xs text-muted-foreground">{entry.code ?? '—'}</TD>
											<TD className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
												{entry.durationMs != null ? `${entry.durationMs} ms` : '—'}
											</TD>
											<TD className="whitespace-nowrap text-xs text-muted-foreground">
												{dateTime(entry.ts)}
											</TD>
										</TR>
									))}
								</TBody>
							</Table>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
