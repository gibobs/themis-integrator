import Link from 'next/link';
import { Boxes, FlaskConical, Radio } from 'lucide-react';
import { Nav } from '@/components/nav';
import { Badge } from '@/components/ui/badge';

/** Cascarón de la app: barra lateral + cabecera con el estado del entorno. */
export function AppShell({
	env,
	mock,
	children,
}: {
	env: string;
	mock: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen">
			<aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
				<Link href="/" className="flex items-center gap-2 border-b border-border px-5 py-4">
					<Boxes className="size-5 text-primary" />
					<div className="leading-tight">
						<div className="text-sm font-semibold">themis-integrator</div>
						<div className="text-xs text-muted-foreground">Integrador de referencia</div>
					</div>
				</Link>
				<Nav />
				<div className="mt-auto border-t border-border p-3 text-xs text-muted-foreground">
					Consume la API de Themis como un integrador externo.
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card/60 px-5 backdrop-blur">
					<div className="flex items-center gap-2 text-sm text-muted-foreground md:hidden">
						<Boxes className="size-4 text-primary" />
						<span className="font-semibold text-foreground">themis-integrator</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<Badge tone="neutral" className="gap-1">
							<Radio className="size-3" />
							Entorno: {env}
						</Badge>
						{mock ? (
							<Badge tone="warning" className="gap-1">
								<FlaskConical className="size-3" />
								Modo mock
							</Badge>
						) : (
							<Badge tone="success" className="gap-1">
								<Radio className="size-3" />
								API real
							</Badge>
						)}
					</div>
				</header>
				<main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">{children}</main>
			</div>
		</div>
	);
}
