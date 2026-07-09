import { Badge } from '@/components/ui/badge';
import {
	businessStatusMeta,
	creationStatusMeta,
	meta,
	originMeta,
	syncStatusMeta,
	type Tone,
} from '@/lib/status';

type Kind = 'creation' | 'business' | 'sync' | 'origin';

const tables: Record<Kind, Record<string, { tone: Tone; label: string }>> = {
	creation: creationStatusMeta,
	business: businessStatusMeta,
	sync: syncStatusMeta,
	origin: originMeta,
};

export function StatusBadge({ kind, value }: { kind: Kind; value: string | null | undefined }) {
	const { tone, label } = meta(tables[kind], value);
	return <Badge tone={tone}>{label}</Badge>;
}
