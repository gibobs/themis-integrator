'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	FilePlus2,
	GitCompareArrows,
	LayoutDashboard,
	ListChecks,
	Milestone,
	Rss,
	Settings,
} from 'lucide-react';
import { cn } from '@/lib/util/cn';

const items = [
	{ href: '/', label: 'Panel', icon: LayoutDashboard, exact: true },
	{ href: '/operations', label: 'Operaciones', icon: ListChecks, exact: true },
	{ href: '/operations/new', label: 'Nueva operación', icon: FilePlus2, exact: true },
	{ href: '/changes', label: 'Change-feed', icon: Rss, exact: false },
	{ href: '/milestones', label: 'Hitos', icon: Milestone, exact: false },
	{ href: '/reconciliation', label: 'Conciliación', icon: GitCompareArrows, exact: false },
	{ href: '/settings', label: 'Ajustes', icon: Settings, exact: false },
];

export function Nav() {
	const pathname = usePathname();
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			{items.map((item) => {
				const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
							active
								? 'bg-accent text-accent-foreground'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground',
						)}
					>
						<Icon className="size-4 shrink-0" />
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
