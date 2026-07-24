import Link from 'next/link';
import Image from 'next/image';
import { FlaskConical, Radio } from 'lucide-react';
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
				<Link href="/" className="flex items-center gap-2.5 border-b border-border px-5 py-4">
					{/* Logo monocromo: en tema oscuro se invierte para conservar contraste. */}
					<Image
						src="/logo.png"
						alt="Gibobs Technology"
						width={28}
						height={28}
						priority
						className="shrink-0 dark:invert"
					/>
					<div className="leading-tight">
						<div className="text-sm font-semibold">Themis</div>
						<div className="text-[10px] font-medium tracking-wide text-muted-foreground/80">
							By Gibobs Technology
						</div>
					</div>
				</Link>
				<Nav />
				<div className="mt-auto border-t border-border p-3 text-xs text-muted-foreground">
					El cambio es la oportunidad; la integración, el camino.
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card/60 px-5 backdrop-blur">
					<div className="flex items-center gap-2 text-sm text-muted-foreground md:hidden">
						<Image
							src="/logo.png"
							alt="Gibobs Technology"
							width={20}
							height={20}
							className="shrink-0 dark:invert"
						/>
						<span className="font-semibold text-foreground">themis-integrator</span>
						<span className="text-xs text-muted-foreground">· By Gibobs Technology</span>
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
