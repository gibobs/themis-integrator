/**
 * Descarga simulada de un documento (solo modo mock).
 *
 * NO es una ruta de Themis ni pasa por el SDK/BFF: simula el **S3** al que
 * apunta la URL presignada que devuelve `GET …/documents/{id}/url`. Sirve un PDF
 * de ejemplo con `Content-Disposition: attachment`, para que "Descargar"
 * funcione de principio a fin sin red. Valida el `exp` (TTL ~5 min) y responde
 * `410 Gone` si ha caducado, enseñando el carácter efímero de la descarga.
 */
import 'server-only';
import { getThemisConfig } from '@/lib/themis/config';

export const dynamic = 'force-dynamic';

/** Escapa los caracteres con significado en un literal de texto PDF. */
function escapePdfText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Genera en memoria un PDF mínimo pero válido (con su tabla `xref` de offsets
 * correcta), sin depender de ningún asset en disco. Simula el binario que en
 * real llegaría directo desde S3.
 */
function buildSamplePdf(lines: string[]): Uint8Array<ArrayBuffer> {
	const content =
		'BT /F1 15 Tf 72 780 Td 20 TL ' +
		lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join(' ') +
		' ET';
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
		`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
	];

	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [];
	objects.forEach((body, i) => {
		offsets.push(Buffer.byteLength(pdf, 'latin1'));
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});

	const xrefOffset = Buffer.byteLength(pdf, 'latin1');
	const size = objects.length + 1;
	pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
	for (const offset of offsets) {
		pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
	// Copia a un Uint8Array respaldado por un ArrayBuffer (no ArrayBufferLike),
	// que es lo que acepta `BodyInit` de `Response`.
	const buf = Buffer.from(pdf, 'latin1');
	const bytes = new Uint8Array(buf.byteLength);
	bytes.set(buf);
	return bytes;
}

export async function GET(request: Request, ctx: { params: Promise<{ documentId: string }> }) {
	// La descarga simula S3 y solo tiene sentido en modo mock.
	if (!getThemisConfig().mock) {
		return new Response('Ruta disponible solo en modo mock.', { status: 404 });
	}

	const { documentId } = await ctx.params;
	const params = new URL(request.url).searchParams;
	const exp = Number(params.get('exp'));
	const rawName = params.get('name') || 'documento.pdf';
	const safeName = rawName.replace(/[\r\n"]/g, '');

	// TTL: si la URL ha caducado, S3 devolvería un error; aquí 410 Gone.
	if (Number.isFinite(exp) && exp > 0 && Date.now() > exp * 1000) {
		return new Response('La URL de descarga ha caducado (TTL ~5 min).', { status: 410 });
	}

	const pdf = buildSamplePdf([
		'themis-integrator - documento de ejemplo (mock)',
		'',
		`documentId: ${documentId}`,
		`fichero: ${safeName}`,
		'',
		'En un entorno real este binario llegaria directo desde S3 mediante',
		'una URL presignada efimera, sin pasar por la API de Themis.',
	]);

	return new Response(pdf, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${safeName}"`,
			'Content-Length': String(pdf.byteLength),
			'Cache-Control': 'no-store',
		},
	});
}
