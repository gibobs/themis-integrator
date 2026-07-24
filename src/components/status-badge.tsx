import { Badge } from '@/components/ui/badge';
import {
	businessStatusMeta,
	creationStatusMeta,
	documentStatusMeta,
	meta,
	milestoneSourceMeta,
	milestoneStatusMeta,
	originMeta,
	syncStatusMeta,
	webhookOutcomeMeta,
	type Tone,
} from '@/lib/status';

type Kind =
	| 'creation'
	| 'business'
	| 'sync'
	| 'origin'
	| 'document'
	| 'milestone'
	| 'milestoneSource'
	| 'webhookOutcome';

const tables: Record<Kind, Record<string, { tone: Tone; label: string }>> = {
	creation: creationStatusMeta,
	business: businessStatusMeta,
	sync: syncStatusMeta,
	origin: originMeta,
	document: documentStatusMeta,
	milestone: milestoneStatusMeta,
	milestoneSource: milestoneSourceMeta,
	webhookOutcome: webhookOutcomeMeta,
};

export function StatusBadge({ kind, value }: { kind: Kind; value: string | null | undefined }) {
	const { tone, label } = meta(tables[kind], value);
	return <Badge tone={tone}>{label}</Badge>;
}
