'use client';
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/util/cn';

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
	const [copied, setCopied] = React.useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				} catch {
					/* clipboard no disponible */
				}
			}}
			className={cn(
				'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
				className,
			)}
			title="Copiar"
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
			{label}
		</button>
	);
}
