import Link from 'next/link';
import { ArrowRight, FilePlus2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { FilterBar } from './filter-bar';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { CopyButton } from '@/components/copy-button';
import { RequestInspector } from '@/components/request-inspector';
import { getThemisClient, ThemisError } from '@/lib/themis';
import type { ThemisExchange, ThemisLinkedFilter, ThemisListOperationsQuery } from '@/lib/themis';
import { audited } from '@/lib/server/respond';
import { eur, dateShort, shortId } from '@/lib/util/format';
import { typeMeta } from '@/lib/status';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function OperationsPage({ searchParams }: { searchParams: Promise<SP> }) {
	const sp = await searchParams;
	const query: ThemisListOperationsQuery = {
		linked: (one(sp.linked) as ThemisLinkedFilter) || 'ALL',
		limit: 50,
		sort: one(sp.sort) === 'ASC' ? 'ASC' : 'DESC',
		cursor: one(sp.cursor),
		type: one(sp.type) as ThemisListOperationsQuery['type'],
		status: one(sp.status) as ThemisListOperationsQuery['status'],
		externalId: one(sp.externalId),
		province: one(sp.province),
		amountMin: one(sp.amountMin) ? Number(one(sp.amountMin)) : undefined,
		amountMax: one(sp.amountMax) ? Number(one(sp.amountMax)) : undefined,
	};

	let error: string | null = null;
	let result: Awaited<ReturnType<Awaited<ReturnType<typeof getThemisClient>>['query']['listOperations']>> | null =
		null;
	const themis = await getThemisClient();
	try {
		result = await audited({ method: 'POST', path: '/themis/query/v1/operations', note: 'listado' }, () =>
			themis.query.listOperations(query),
		);
	} catch (e) {
		error = e instanceof ThemisError ? `${e.code}: ${e.detail ?? e.message}` : (e as Error).message;
	}
	const exchanges: ThemisExchange[] = themis.getExchanges();

	const nextHref = (() => {
		if (!result?.hasMore || !result.nextCursor) return null;
		const usp = new URLSearchParams();
		for (const [k, v] of Object.entries(sp)) {
			const val = one(v);
			if (val && k !== 'cursor') usp.set(k, val);
		}
		usp.set('cursor', result.nextCursor);
		return `/operations?${usp.toString()}`;
	})();

	return (
		<div>
			<PageHeader
				title="Operaciones"
				description="Listado de tus operaciones en Themis. Es un índice sin datos personales; abre el detalle para ver la PII (una operación cada vez)."
				actions={
					<Link href="/operations/new">
						<Button>
							<FilePlus2 className="size-4" /> Nueva operación
						</Button>
					</Link>
				}
			/>

			<div className="space-y-4">
				<FilterBar />

				{error && (
					<Callout tone="danger" title="No se pudo cargar el listado">
						{error}
					</Callout>
				)}

				<RequestInspector exchanges={exchanges} />

				{result && (
					<div className="rounded-lg border border-border bg-card">
						<Table>
							<THead>
								<TR>
									<TH>operationId</TH>
									<TH>externalId</TH>
									<TH>Tipo</TH>
									<TH>Estado</TH>
									<TH>Etapa</TH>
									<TH>Importe</TH>
									<TH>Provincia</TH>
									<TH>Creada</TH>
									<TH></TH>
								</TR>
							</THead>
							<TBody>
								{result.items.length === 0 && (
									<TR>
										<TD className="py-8 text-center text-muted-foreground" colSpan={9}>
											No hay operaciones con esos filtros.
										</TD>
									</TR>
								)}
								{result.items.map((op) => (
									<TR key={op.operationId}>
										<TD className="font-mono text-xs">
											<span className="inline-flex items-center gap-1">
												{shortId(op.operationId)}
												<CopyButton value={op.operationId} />
											</span>
										</TD>
										<TD className="font-mono text-xs">{op.externalId ?? '—'}</TD>
										<TD>{typeMeta[op.type]?.label ?? op.type}</TD>
										<TD>
											<StatusBadge kind="business" value={op.status} />
										</TD>
										<TD className="text-xs text-muted-foreground">
											{op.stage}
											{op.substage ? ` · ${op.substage}` : ''}
										</TD>
										<TD>{eur(op.amount)}</TD>
										<TD>{op.province ?? '—'}</TD>
										<TD className="whitespace-nowrap text-xs text-muted-foreground">
											{dateShort(op.createdAt)}
										</TD>
										<TD>
											<Link
												href={`/operations/${op.operationId}`}
												className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
											>
												Ver <ArrowRight className="size-3" />
											</Link>
										</TD>
									</TR>
								))}
							</TBody>
						</Table>
					</div>
				)}

				{nextHref && (
					<div className="flex justify-center">
						<Link href={nextHref}>
							<Button variant="outline">Cargar más</Button>
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
