import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { getThemisConfig } from '@/lib/themis/config';

export const metadata: Metadata = {
	title: 'themis-integrator · By Gibobs Technology',
	description:
		'Integrador de referencia open-source para la API Themis de Gibobs: alta, listado, change-feed y conciliación.',
	icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const cfg = getThemisConfig();
	return (
		<html lang="es">
			<body>
				<AppShell env={cfg.env} mock={cfg.mock}>
					{children}
				</AppShell>
			</body>
		</html>
	);
}
