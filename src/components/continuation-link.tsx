import { ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/util/cn';

/**
 * Enlace "Abrir continuación" robusto: si la `continuationUrl` es absoluta
 * (p. ej. la webapp de Gibobs en producción) abre en pestaña nueva; si es
 * relativa (lo que devuelve el entorno de integración), navega en la misma app.
 */
export function ContinuationLink({ url, className }: { url: string; className?: string }) {
	const external = /^https?:\/\//i.test(url);
	return (
		<a
			href={url}
			{...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
			className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
		>
			<ExternalLink className="size-4" /> Abrir continuación
		</a>
	);
}
