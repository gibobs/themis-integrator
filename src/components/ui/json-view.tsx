import { cn } from '@/lib/util/cn';

/** Visor JSON simple, con scroll horizontal contenido. */
export function JsonView({ data, className }: { data: unknown; className?: string }) {
	return (
		<pre
			className={cn(
				'max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed',
				className,
			)}
		>
			{JSON.stringify(data, null, 2)}
		</pre>
	);
}
