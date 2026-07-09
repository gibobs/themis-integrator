import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/util/cn';

const badgeVariants = cva(
	'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
	{
		variants: {
			tone: {
				neutral: 'border-border bg-muted text-muted-foreground',
				primary: 'border-transparent bg-accent text-accent-foreground',
				success: 'border-transparent bg-success/15 text-success',
				warning: 'border-transparent bg-warning/20 text-warning-foreground',
				danger: 'border-transparent bg-danger/15 text-danger',
				info: 'border-transparent bg-info/15 text-info',
			},
		},
		defaultVariants: { tone: 'neutral' },
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}
