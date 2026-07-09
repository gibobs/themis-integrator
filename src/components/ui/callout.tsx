import * as React from 'react';
import { AlertTriangle, CircleAlert, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/util/cn';

type Tone = 'info' | 'warn' | 'danger' | 'success';

const styles: Record<Tone, { box: string; icon: React.ReactNode }> = {
	info: { box: 'border-info/30 bg-info/10 text-foreground', icon: <Info className="text-info" /> },
	warn: {
		box: 'border-warning/40 bg-warning/10 text-foreground',
		icon: <AlertTriangle className="text-warning-foreground" />,
	},
	danger: {
		box: 'border-danger/40 bg-danger/10 text-foreground',
		icon: <CircleAlert className="text-danger" />,
	},
	success: {
		box: 'border-success/40 bg-success/10 text-foreground',
		icon: <CheckCircle2 className="text-success" />,
	},
};

export function Callout({
	tone = 'info',
	title,
	children,
	className,
}: {
	tone?: Tone;
	title?: string;
	children?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('flex gap-3 rounded-md border p-3 text-sm', styles[tone].box, className)}>
			<div className="mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">{styles[tone].icon}</div>
			<div className="space-y-1">
				{title && <p className="font-semibold">{title}</p>}
				{children && <div className="text-muted-foreground [&_a]:text-primary [&_a]:underline">{children}</div>}
			</div>
		</div>
	);
}
