# themis-integrator

Integrador de referencia open-source para la **API Themis de Gibobs**: te enseña,
con código real y ejecutable, cómo dar de alta operaciones, seguir su estado,
listarlas, detectar cambios (*drift*) y conciliar tu `externalId` contra Themis.

Arranca en **modo mock** por defecto, así que puedes clonarlo y verlo funcionar
de principio a fin **sin credenciales**.

---

## Qué hace

- **Alta de operaciones** en sus tres modos:
	- **Handoff**: rediriges al cliente a la webapp de Gibobs para que complete el
	  alta. Siempre responde `202` con una `continuationUrl`.
	- **Servidor-a-servidor (S2S) asíncrono**: `202` y sigues el estado del alta
	  mediante consulta periódica con *backoff*.
	- **Servidor-a-servidor (S2S) síncrono**: pides el camino corto con la cabecera
	  `Prefer: wait=N`; recibes `201` si da tiempo, o degrada a `202`.
- **Gestión de tu `externalId`**: lo envías al crear (opcional) y el integrador lo
	usa como clave de idempotencia de negocio junto con la `Idempotency-Key`.
- **Intervinientes**: añades **varios titulares y avalistas** (roles `OWNER` /
	`GUARANTOR`), marcando exactamente **un titular principal** (aporta email y teléfono).
- **Oferta y bonificaciones** (opcional): envías la oferta de partida pactada con
	el cliente (tipo de interés, TIN/cuota inicial y final, TAE y **tramos**) y las
	**bonificaciones por vinculación** (seguro de hogar, vida, nómina, etc.: cada
	una reduce el tipo con un valor ≤ 0 y puede tener un coste ≥ 0).
- **Seguimiento del estado del alta** con consulta periódica y *backoff* hasta un
	estado terminal (`RECEIVED → PROCESSING → PROCESSED | FAILED`).
- **Listado con filtros y detalle**: el listado es un índice **sin datos
	personales**; el detalle trae la PII y se consulta **una operación cada vez**.
- **Change-feed (*drift*)**: descubres cambios de estado/etapa de tus operaciones
	de forma incremental por *cursor*.
- **Conciliación con write-back**: ingieres operaciones sin `externalId` (p. ej.
	autoprescripciones) y las enlazas a tu referencia.
- **Inspector de request/response**: cada pantalla que llama a Themis muestra, en
	un desplegable, la petición y la respuesta reales (cabeceras y body) — ver
	[abajo](#inspector-de-requestresponse).
- **Datos de ejemplo aleatorios**: el botón *«Rellenar ejemplo»* genera identidades
	**españolas** ([`@faker-js/faker`](https://fakerjs.dev)) y rellena **todos** los
	campos —incluidos intervinientes y oferta— con valores distintos en cada clic.

El modelo de interacción es **empujar y consultar**: tú empujas el alta y
consultas el resultado. Hoy **Themis nunca te llama**; en el futuro habrá aviso
por notificación saliente (webhook), y la consulta periódica seguirá siendo válida.

> **Fuera de alcance (por ahora):** la parte de **identidad** y de **documentos**
> de Themis no está cubierta en este integrador de referencia.

---

## Los dos identificadores

Cada operación se maneja con **dos** identificadores. Mantén siempre esta
separación (no uses uno donde toca el otro):

| Identificador | Lo acuña | Para qué sirve | Notas |
| --- | --- | --- | --- |
| **`operationId`** | **Themis** | Consultar el **estado del alta** y el **detalle** | Estable y público. Disponible **siempre**, aunque no envíes `externalId`. |
| **`externalId`** | **Tú** (el integrador) | **Conciliación** e **histórico** | Tu referencia (p. ej. el id de tu CRM). Único por marca y **opcional** al crear. |

Para no duplicar operaciones ante reintentos, combina tu `externalId` con la
cabecera `Idempotency-Key`.

---

## Inspector de request/response

Aprender una integración es, sobre todo, ver **qué se envía y qué se recibe**. Por
eso **cada pantalla que llama a Themis** incluye un desplegable *«Petición(es) a
Themis (request / response)»* con, por cada llamada:

- **Request**: método, URL del entorno, **cabeceras** y **body**.
- **Response**: **status**, **cabeceras** y **body**.

Aparece tanto en el **camino feliz** como en los **errores** (`problem+json`), así
que también ves la petición que provocó un `400`/`404`/`409`. Los secretos se
**redactan** siempre: el `Authorization: Bearer` y los secretos del canje de token
(`apiSecret`/`token`) se muestran como `«redactado»`, nunca en claro.

Técnicamente, el SDK captura cada intercambio HTTP (con redacción) y las rutas BFF
lo adjuntan a su respuesta bajo la clave `_themis`; el navegador nunca ve
credenciales.

---

## Arquitectura en breve

- **Next 16 (App Router) + React 19 + TypeScript + Tailwind v4.**
- **El navegador nunca ve credenciales.** Todas las llamadas a Themis pasan por
	**rutas BFF** en `/api`, que se ejecutan solo en el servidor. El navegador
	habla únicamente con esas rutas.
- **SDK de Themis** en `src/lib/themis`: resuelve el entorno, canjea el token M2M,
	aplica idempotencia/`Prefer` y expone las áreas `intake` y `query`.
- **Almacén local del integrador** en **SQLite** (`better-sqlite3`) en
	`src/lib/db`: el mapeo `externalId ↔ operationId`, el estado conocido, el
	progreso del change-feed y un log de auditoría.
- **Backend mock de Themis**: una simulación local (`themis-mock.db`) que se activa
	con `THEMIS_MOCK=1` y permite ejecutar y demostrar **todo el recorrido sin
	credenciales ni red**.

Los detalles están en **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Requisitos

- **Node.js >= 20**
- **Corepack** (viene con Node; habilita el `yarn@4` que fija el proyecto)

## Quickstart

```bash
corepack enable          # habilita Yarn 4 (packageManager del proyecto)
yarn install             # instala dependencias
cp .env.example .env.local
yarn dev                 # arranca en http://localhost:3000
```

Abre **http://localhost:3000**. Con la configuración por defecto arranca en
**modo mock** (`THEMIS_MOCK=1` en `.env.example`): es totalmente funcional **sin
credenciales**, con datos de ejemplo ya sembrados.

---

## Modo real (contra Themis)

Para integrar contra la API real, edita tu `.env.local`:

```bash
THEMIS_MOCK=0                       # desactiva el backend simulado
THEMIS_ENV=development              # development | staging | production
THEMIS_API_KEY=...                  # credenciales M2M (las entrega Gibobs)
THEMIS_API_SECRET=...
THEMIS_TOKEN=...
```

`THEMIS_ENV` determina la URL base (`development` → `dev.api.gibobs.net`,
`staging` → `staging.api.gibobs.net`, `production` → `api.gibobs.com`). Las
credenciales se canjean automáticamente por un token de acceso; tú solo las pones
en el entorno.

---

## Scripts

| Script | Qué hace |
| --- | --- |
| `yarn dev` | Arranca el servidor de desarrollo en `http://localhost:3000`. |
| `yarn build` | Compila la build de producción. |
| `yarn start` | Sirve la build de producción (requiere `yarn build` antes). |
| `yarn lint` | Pasa ESLint (`eslint-config-next`). |
| `yarn types:check` | Genera los tipos de Next y ejecuta `tsc --noEmit` (comprobación de tipos). |
| `yarn db:reset` | Borra las bases de datos SQLite locales (almacén del integrador y backend mock) para empezar de cero. |

No hay framework de tests: las comprobaciones son `yarn types:check` y `yarn lint`.

---

## Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx                      # cascarón: barra lateral + estado del entorno
│   ├── page.tsx                        # panel de inicio (métricas + entorno + auditoría)
│   ├── operations/                     # UI: listado, alta y detalle
│   │   ├── page.tsx                    #   listado con filtros
│   │   ├── new/create-form.tsx         #   formulario de alta (intervinientes, oferta, ejemplo)
│   │   └── [operationId]/              #   detalle + seguimiento del alta + histórico
│   ├── changes/                        # UI: change-feed (drift)
│   ├── reconciliation/                 # UI: conciliación + write-back
│   ├── settings/                       # UI: entorno, variables y reset de datos
│   ├── handoff/landing/                # landing de continuación del handoff (canje + estado)
│   └── api/                            # rutas BFF (nunca exponen credenciales)
│       ├── operations/                 #   GET listado · POST alta · detalle/estado/histórico
│       ├── changes/route.ts            #   POST change-feed
│       ├── reconciliation/             #   GET pending · POST write-back
│       ├── handoff/                    #   POST redeem · GET status
│       └── settings/reset/route.ts     #   POST vaciar almacén local
├── components/                         # kit de UI (Card, Button, Table, Badge, Callout…)
│   ├── request-inspector.tsx           #   desplegable request/response (con redacción)
│   ├── status-badge.tsx · continuation-link.tsx · copy-button.tsx · nav.tsx · app-shell.tsx
│   └── ui/                             #   primitivas (button, card, input, table, json-view…)
└── lib/
    ├── themis/                         # SDK de Themis (server-only)
    │   ├── config.ts                   #   entorno → baseUrl, credenciales, flag mock
    │   ├── token.ts                    #   token M2M (canje + caché en memoria)
    │   ├── http.ts                     #   transporte, reintentos con backoff, captura de intercambios
    │   ├── client.ts                   #   request autenticado (Prefer, Idempotency-Key)
    │   ├── intake.ts                   #   alta, estado, write-back, handoff
    │   ├── query.ts                    #   listado, change-feed, detalle, histórico
    │   ├── errors.ts                   #   ThemisError (application/problem+json)
    │   ├── exchange.ts                 #   tipo del intercambio HTTP (para el inspector)
    │   ├── schema.ts                   #   validación (zod): alta, intervinientes y oferta
    │   ├── types.ts                    #   tipos del contrato (incluye oferta y bonificaciones)
    │   └── mock/                       #   backend simulado de Themis (themis-mock.db)
    ├── db/                             # almacén local del integrador (integrator.db)
    │   ├── db.ts                       #   conexión SQLite + migración
    │   ├── operations.ts               #   operaciones (externalId ↔ operationId)
    │   ├── feed.ts                     #   progreso del change-feed (since)
    │   └── audit.ts                    #   log de auditoría de llamadas
    ├── server/respond.ts               # audited() + problemResponse() + withExchanges()
    ├── client/api.ts                   # apiFetch + ApiError (navegador → BFF, con _themis)
    ├── status.ts                       # mapeo estado → color/etiqueta
    └── util/                           # backoff, idempotency, ulid, format, cn
```

---

## Recorrido de uso

1. **Crear una operación** (`/operations/new`): elige el modo (handoff, S2S
	asíncrono o síncrono), añade titulares/avalistas y, si quieres, la oferta y
	bonificaciones; pulsa *«Rellenar ejemplo»* para poblarlo todo con datos
	aleatorios y envía. El integrador aplica la idempotencia y llama al alta de Themis.
2. **Seguir el estado del alta** (detalle de la operación): la vista consulta el
	estado de forma periódica con *backoff* hasta que sea terminal
	(`PROCESSED` o `FAILED`). En handoff, además, dispones de la `continuationUrl`.
3. **Listar y ver el detalle** (`/operations`): filtra el índice (sin PII) y abre
	una operación para ver sus datos completos (una operación cada vez).
4. **Descubrir cambios** (`/changes`): consumes el change-feed por *cursor* para
	enterarte del *drift* (cambios de estado/etapa) de tus operaciones.
5. **Conciliar** (`/reconciliation`): localizas operaciones sin `externalId` (p. ej.
	autoprescripciones), les asignas tu referencia y haces el **write-back** para
	enlazarlas en Themis.
6. **Revisar la auditoría** (`/settings`): consultas el log local de las llamadas a
	Themis (método, ruta, status, código y duración).

En **todas** estas pantallas puedes abrir el desplegable *«Petición(es) a Themis»*
para ver el request y la response reales (cabeceras y body) de cada llamada.

---

## Licencia

[MIT](LICENSE) · Copyright (c) 2026 Gibobs.
