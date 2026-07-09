'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Barra de filtros del listado. Escribe los filtros en la query string. */
export function FilterBar() {
	const router = useRouter();
	const params = useSearchParams();
	const [pending, startTransition] = React.useTransition();

	const [form, setForm] = React.useState({
		linked: params.get('linked') ?? 'ALL',
		type: params.get('type') ?? '',
		status: params.get('status') ?? '',
		externalId: params.get('externalId') ?? '',
		province: params.get('province') ?? '',
		amountMin: params.get('amountMin') ?? '',
		amountMax: params.get('amountMax') ?? '',
	});

	function set<K extends keyof typeof form>(key: K, value: string) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	function apply(e: React.FormEvent) {
		e.preventDefault();
		const usp = new URLSearchParams();
		for (const [k, v] of Object.entries(form)) if (v) usp.set(k, v);
		startTransition(() => router.push(`/operations?${usp.toString()}`));
	}

	function reset() {
		setForm({ linked: 'ALL', type: '', status: '', externalId: '', province: '', amountMin: '', amountMax: '' });
		startTransition(() => router.push('/operations'));
	}

	return (
		<form
			onSubmit={apply}
			className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4 lg:grid-cols-7"
		>
			<div className="space-y-1">
				<Label htmlFor="linked">Conciliación</Label>
				<Select id="linked" value={form.linked} onChange={(e) => set('linked', e.target.value)}>
					<option value="ALL">Todas</option>
					<option value="LINKED">Enlazadas</option>
					<option value="UNLINKED">Sin enlazar</option>
				</Select>
			</div>
			<div className="space-y-1">
				<Label htmlFor="type">Tipo</Label>
				<Select id="type" value={form.type} onChange={(e) => set('type', e.target.value)}>
					<option value="">Cualquiera</option>
					<option value="MORTGAGE">Hipoteca</option>
					<option value="SUBROGATION">Subrogación</option>
				</Select>
			</div>
			<div className="space-y-1">
				<Label htmlFor="status">Estado</Label>
				<Select id="status" value={form.status} onChange={(e) => set('status', e.target.value)}>
					<option value="">Cualquiera</option>
					<option value="active">Activa</option>
					<option value="postpone">Pospuesta</option>
					<option value="finish">Finalizada</option>
				</Select>
			</div>
			<div className="space-y-1">
				<Label htmlFor="externalId">externalId</Label>
				<Input
					id="externalId"
					value={form.externalId}
					onChange={(e) => set('externalId', e.target.value)}
					placeholder="CRM-1001"
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor="province">Provincia</Label>
				<Input id="province" value={form.province} onChange={(e) => set('province', e.target.value)} />
			</div>
			<div className="space-y-1">
				<Label htmlFor="amountMin">Importe mín.</Label>
				<Input
					id="amountMin"
					type="number"
					value={form.amountMin}
					onChange={(e) => set('amountMin', e.target.value)}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor="amountMax">Importe máx.</Label>
				<Input
					id="amountMax"
					type="number"
					value={form.amountMax}
					onChange={(e) => set('amountMax', e.target.value)}
				/>
			</div>
			<div className="col-span-2 flex items-end gap-2 md:col-span-4 lg:col-span-7">
				<Button type="submit" disabled={pending}>
					<Search className="size-4" /> Filtrar
				</Button>
				<Button type="button" variant="outline" onClick={reset} disabled={pending}>
					<X className="size-4" /> Limpiar
				</Button>
			</div>
		</form>
	);
}
