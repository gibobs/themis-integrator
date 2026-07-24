# Arquitectura

Este documento describe cómo está montado `themis-integrator` por dentro: las
capas, el flujo de una petición, el modelo de datos local, cómo funciona el
backend simulado (mock) y las decisiones de diseño que conviene entender antes de
adaptar el integrador a tu sistema.

Idea central: **el navegador nunca ve credenciales de Themis**. Todo lo que toca
la API pasa por el servidor.

---

## Capas

```
Navegador ──▶ Rutas BFF (/api) ──▶ SDK de Themis ──▶ Themis (real) | Mock (local)
                    │                     │
                    └── Almacén local (SQLite) ◀── auditoría / estado / feed
```

### 1. BFF — route handlers (`src/app/api/**`)

Cada ruta de `/api` es un *Backend For Frontend*: se ejecuta **solo en el
servidor**, obtiene el cliente de Themis, hace la llamada y persiste lo que
corresponda en el almacén local. El navegador habla únicamente con estas rutas
(vía `apiFetch`), nunca con Themis.

Rutas principales:

- `GET /api/operations` — listado (`query.listOperations`) con filtros.
- `POST /api/operations` — alta (`intake.createOperation`) + persistencia del
	mapeo `externalId ↔ operationId` y del estado.
- `GET /api/operations/:operationId` — detalle (con PII).
- `GET /api/operations/:operationId/status` — estado del alta (consulta periódica).
- `GET /api/operations/:operationId/history` — histórico.
- `GET /api/operations/:operationId/documents` — documentos (solo lectura).
- `GET /api/operations/:operationId/documents/status` — estado documental.
- `GET /api/operations/:operationId/documents/:documentId/url` — URL de descarga efímera.
- `GET /api/mock/documents/:documentId/download` — descarga simulada (S3), **solo mock**;
	no pasa por el SDK ni por Themis (ver [documentos](#documentos)).
- `POST /api/changes` — change-feed (`query.getOperationsChanges`) + progreso `since`.
- `POST /api/milestones` — feed de hitos (`query.getOperationsMilestones`) + progreso
	`since` por `milestoneFeedKey(filters)`. **No** hace `absorbDiscovered`: los hitos
	son transiciones de negocio, no filas del índice de operaciones (ver
	[decisiones de diseño](#decisiones-de-diseño)).
- `GET /api/reconciliation/pending` y `POST /api/reconciliation/write-back` —
	descubrir y conciliar (`intake.listPendingSync` / `intake.syncOperations`).
- `POST /api/handoff/redeem` y `GET /api/handoff/status` — canje del launchToken y
	estado con la sesión de handoff.
- `POST /api/settings/reset` — vacía el almacén local del integrador.

Tres helpers (`src/lib/server/respond.ts`) dan homogeneidad:

- **`audited({ method, path, note }, fn)`** envuelve la llamada a Themis, mide el
	tiempo y registra el resultado (status/código) en el log de auditoría.
- **`problemResponse(error, exchanges?)`** traduce cualquier error a
	`application/problem+json`, de modo que la UI siempre recibe el **mismo
	contrato de error** que expone Themis. Si se le pasan los intercambios, los
	adjunta también en el error (ver [inspector](#inspector-de-requestresponse)).
- **`withExchanges(data, exchanges)`** adjunta los intercambios con Themis al
	cuerpo de una respuesta OK bajo la clave `_themis`.

Las páginas que leen Themis o la base de datos son dinámicas
(`export const dynamic = 'force-dynamic'`).

### 2. SDK de Themis (`src/lib/themis`, *server-only*)

Se compone por capas, de abajo a arriba:

- **`config.ts`** — resuelve el entorno (`THEMIS_ENV`) a una URL base, lee el flag
	`THEMIS_MOCK` y las credenciales M2M. Marcado `server-only`: nunca llega al
	bundle del navegador.
- **`token.ts`** — canjea las credenciales por un `access_token` (JWT, ~60 min,
	sin refresh) y lo **cachea en memoria** del proceso hasta poco antes de expirar.
	Ante un `401` en carrera, invalida el token y reintenta una vez.
- **`http.ts`** — el **transporte**. Hay dos: el real (`fetch`) y el mock. Un
	transporte devuelve la respuesta cruda sin lanzar por status; `sendRequest`
	construye el `ThemisError` y **reintenta 429/5xx con *backoff* exponencial**,
	respetando `Retry-After`. Aquí vive también **`withCapture`**, que envuelve un
	transporte para **registrar cada intercambio** (request/response) redactando
	credenciales.
- **`client.ts`** — un `request` genérico ya autenticado, que aplica las cabeceras
	`Prefer` (RFC 7240) e `Idempotency-Key`.
- **`intake.ts`** — área de escritura: `createOperation` (doble vía `201`/`202`),
	`getCreationStatus`, `syncOperations` (write-back), `listPendingSync`,
	`redeemLaunchToken` y `getHandoffStatus`.
- **`query.ts`** — área de lectura: `listOperations`, `getOperationsChanges`
	(change-feed), `getOperationsMilestones` (feed de hitos: transiciones de negocio
	`ACHIEVED`/`REVOKED`), `getOperation` (detalle con PII), `getOperationHistory` y los
	tres de **documentos** (`listOperationDocuments`, `getOperationDocumentsStatus`,
	`getDocumentUrl`), estos últimos por `operationId` (ver [documentos](#documentos)).
- **`types.ts` / `schema.ts`** — el contrato en TypeScript y su validación con
	`zod`. Cubren el alta completa: intervinientes (titulares/avalistas), inmueble o
	subrogación y la **oferta y bonificaciones** opcionales (`ThemisOfferInputDto`:
	tipo, TIN/cuota, TAE, tramos y las 8 vinculaciones con `bonusValue ≤ 0` /
	`costValue ≥ 0`).
- **`errors.ts`** — `ThemisError` en formato `application/problem+json`
	(RFC 9457). El campo estable para decidir en código es **`code`** (nunca
	parsees `detail`). El área de documentos de `themis-query` emite la familia
	**`THEMIS_HTTP_<status>`** (p. ej. `THEMIS_HTTP_404`): el código deriva del
	status HTTP, no es semántico.
- **`exchange.ts`** — el tipo `ThemisExchange` (sin `server-only`) que describe un
	intercambio HTTP capturado; lo comparten el SDK y el inspector de la UI.

`getThemisClient()` compone config + transporte (envuelto con `withCapture`) +
token y devuelve `{ config, client, intake, query, getExchanges }`, donde
`getExchanges()` da los intercambios registrados durante la vida del cliente.

### 3. Capa SQLite (`src/lib/db`, *server-only*)

El **almacén del integrador** (`integrator.db`, por defecto `./data`). Es "tu
lado" de la integración: qué has enviado, qué te ha contado Themis y por dónde vas
consumiendo el feed. Ver el [modelo de datos](#modelo-de-datos-local).

### 4. Backend mock (`src/lib/themis/mock`)

La simulación de Themis, activa solo con `THEMIS_MOCK=1`. Vive en **su propia**
base de datos (`themis-mock.db`), separada del almacén del integrador, para
modelar fielmente los dos lados de la integración. Ver [cómo funciona el
mock](#cómo-funciona-el-mock).

---

## El flujo de una petición

Toda petición sigue el mismo camino: **navegador → ruta BFF → SDK →
Themis | mock**, y de vuelta. El siguiente diagrama muestra el alta en modo
handoff / asíncrono y el posterior seguimiento del estado por consulta periódica.

```mermaid
sequenceDiagram
	autonumber
	participant B as Navegador
	participant BFF as Ruta BFF (/api)
	participant SDK as SDK Themis
	participant T as Themis | Mock
	participant DB as SQLite (integrador)

	B->>BFF: POST /api/operations (modo, cuerpo)
	BFF->>DB: insertOperation (externalId, Idempotency-Key)
	BFF->>SDK: intake.createOperation(body, {idempotencyKey, prefer})
	SDK->>T: POST /themis/intake/v1/operations
	T-->>SDK: 202 Accepted {operationId, statusUrl, continuationUrl?}
	SDK-->>BFF: resultado (accepted)
	BFF->>DB: recordCreateResponse (operationId, estado)
	BFF-->>B: 202 {operationId, continuationUrl?}

	opt Handoff
		B->>T: redirige al cliente a continuationUrl
	end

	loop Consulta periódica con backoff (hasta estado terminal)
		B->>BFF: GET /api/operations/:operationId/status
		BFF->>SDK: intake.getCreationStatus(operationId)
		SDK->>T: GET /themis/intake/v1/operations/:id/status
		T-->>SDK: {status: RECEIVED|PROCESSING|PROCESSED|FAILED}
		SDK-->>BFF: estado
		BFF->>DB: updateCreationStatus
		BFF-->>B: estado
	end
```

En el camino **S2S síncrono** cambia solo el arranque: el BFF envía
`Prefer: wait=N` y Themis puede responder `201` con el recurso de la operación ya
creado (sin bucle de consulta); si no da tiempo, degrada a `202` y se sigue igual.

---

## Inspector de request/response

Un objetivo del integrador es **enseñar cómo es la petición a realizar**. Para
ello, cada pantalla que llama a Themis muestra un desplegable con el request y la
response reales (cabeceras + body) de cada intercambio. El recorrido del dato:

```
withCapture (SDK) ─registra→ exchanges[]  ──getExchanges()──▶ ruta BFF
   │ (redacta bearer/secretos)                                    │
   │                                          withExchanges(data) │ éxito → body._themis
   │                                          problemResponse(…,ex)│ error → problem._themis
   ▼                                                               ▼
ThemisExchange (exchange.ts) ◀──────── apiFetch / props ──────── RequestInspector (cliente)
```

1. **Captura.** `withCapture` (en `http.ts`) envuelve el transporte y, por cada
	llamada, guarda un `ThemisExchange` (método, URL, cabeceras y body de request y
	response, duración y status). `getThemisClient()` acumula todos en un array que
	expone con `getExchanges()`.
2. **Redacción.** Antes de guardar, se enmascaran los secretos: `Authorization:
	Bearer …` se muestra como `Bearer «redactado»`, y en el canje de token los
	campos `apiSecret`/`token` como `«redactado»`. **Nunca** salen en claro.
3. **Transporte a la UI.**
	- **Páginas de servidor** (listado, detalle) leen `themis.getExchanges()` y se lo
		pasan como props al inspector.
	- **Rutas BFF** adjuntan los intercambios al cuerpo bajo `_themis`: con
		`withExchanges(...)` en las respuestas OK y con `problemResponse(error, ex)` en
		los **errores** (así también ves el request que provocó un `400`/`404`/`409`).
		El cliente los lee del cuerpo (`WithExchanges<T>`) o de `ApiError.exchanges`.
4. **Render.** El componente `RequestInspector` (`src/components/request-inspector.tsx`)
	pinta el desplegable, un bloque por intercambio.

Como los secretos se redactan en la capa de captura (servidor), el navegador nunca
recibe credenciales aunque muestre las cabeceras.

---

## Modelo de datos local

El almacén del integrador (`integrator.db`) tiene tres tablas:

### `operations`

El corazón del integrador: **una fila por operación tuya**. Guarda el mapeo
`external_id ↔ operation_id`, un *snapshot* del cuerpo del alta (`request_json`),
el estado del alta (`creation_status`) y el estado de negocio que vas conociendo
por las lecturas (`business_status`, `stage`, `substage`), además de `origin`,
`amount`, `province` y las URLs de la respuesta (`status_url`, `continuation_url`).

- `external_id` y `operation_id` son **únicos** (permiten idempotencia de negocio
	y evitan duplicados).
- `idempotency_key` se guarda para poder **reintentar de forma idempotente** un
	alta que quedó en el aire.

### `feed_state`

El **progreso de los feeds incrementales**. Una fila por combinación de filtros
(`feed_key`) con el último `since` (la última `version` procesada). Así el consumo
es **incremental**: retomas donde lo dejaste. El change-feed usa claves
`changes:<origin>:<linked>` (p. ej. `changes:ALL:LINKED`); el feed de hitos,
`milestones` (sin filtros) o `milestones:sources=…;status=…;types=…`
(`milestoneFeedKey(filters)`, con partes y valores ordenados alfabéticamente).

### `audit_log`

Un **log de auditoría** de las llamadas a Themis (`method`, `path`, `status`,
`code`, `duration_ms`, `note`). Da trazabilidad "de integrador" y alimenta la vista
de auditoría.

---

## Cómo funciona el mock

El backend simulado respeta la **semántica del contrato** (idempotencia, handoff,
`202`/`201`, write-back por-ítem, change-feed y feed de hitos con `version`) sobre
seis tablas: `mock_operations`, `mock_idempotency`, `mock_meta` (un contador
`versionSeq`), `mock_milestones` (las transiciones de hito que sirve el feed de
hitos, sembradas con el catálogo real de `milestoneType` del core) y las dos de
documentos, `mock_documents` y `mock_document_requirements` (ver
[documentos](#documentos)).

Claves de su comportamiento:

- **Estado del alta derivado del tiempo.** Cada operación guarda
	`creation_started_at`. Al consultar su estado, el mock lo deriva del tiempo
	transcurrido: `RECEIVED` (primer tramo) → `PROCESSING` → `PROCESSED` (o
	`FAILED` si se pidió simular un fallo). Así ves el alta "progresar" de verdad
	mientras la consultas de forma periódica.
- **`version` que avanza al leer (el *drift*).** Existe un contador monotónico
	global. Cuando una lectura *materializa* el avance de una operación, **sube su
	`version`**. El change-feed ordena por `version` y devuelve lo posterior a tu
	`since`: por eso el feed refleja cambios sin necesidad de que Themis te avise.
- **Seed de autoprescripciones.** Al crear la BD se siembran operaciones de
	ejemplo: unas con `externalId` (origen `INTAKE`) y varias de origen
	`AUTOPRESCRIPTION` **sin `externalId`**, que aparecen como **pendientes de
	conciliar** para poder probar el write-back de extremo a extremo.
- **Idempotencia y handoff.** Reconoce la misma `Idempotency-Key` (idempotencia
	HTTP) y el mismo `externalId` (idempotencia de negocio) devolviendo la operación
	existente; y emite un `launchToken` de **un solo uso** que se canjea por un
	`sessionToken` de handoff.

El mock usa **cursores opacos** (base64url) igual que el contrato real, para que el
código del integrador no dependa de que arranques en modo mock o real.

---

## El ciclo de conciliación

El change-feed y la conciliación comparten mecánica pero tienen objetivos
distintos:

- **Descubrir cambios (*drift*)** es lo primero y lo más general: el change-feed
	aplica a **todas** tus operaciones (defaults del contrato: `origin: ALL`,
	`linked: LINKED`). Sirve para enterarte de cambios de estado/etapa de
	operaciones que ya tienes.
- **El write-back** es un caso concreto: enlazar operaciones que Themis conoce pero
	tú aún no has referenciado (típicamente `origin: AUTOPRESCRIPTION` +
	`linked: UNLINKED`). Puede **no aplicar** a un integrador que solo origina
	operaciones dándolas de alta.

```mermaid
flowchart TD
	A[Leer change-feed<br/>getOperationsChanges since] --> B{¿Cambios?}
	B -- No --> Z[Esperar / consulta periódica]
	B -- Sí --> C[Absorber en el almacén local<br/>absorbDiscovered / updateBusinessState]
	C --> D[Guardar el progreso<br/>setSince feedKey, maxVersion]
	D --> E{¿Operaciones sin externalId?<br/>listPendingSync}
	E -- No --> Z
	E -- Sí --> F[Asignar tu externalId]
	F --> G[Write-back en lote<br/>syncOperations items]
	G --> H{Resultado por ítem}
	H -- LINKED --> I[setExternalId en local]
	H -- ALREADY_LINKED --> I
	H -- CONFLICT / NOT_FOUND --> J[Registrar y revisar]
	I --> Z
	J --> Z
```

---

## Documentos

Los documentos son **solo lectura / solo descarga**: no hay subida, borrado ni
escritura. Se identifican por **`operationId`** (el ULID público que el integrador
ya conoce), no por `externalId`, así que el patrón es **más simple** que el del
histórico: la ruta BFF pasa el `operationId` directo a Themis, **sin** resolución
de `externalId` ni `409`. Como en el detalle, hay **aislamiento por marca**: una
operación fuera de tu ámbito responde **`404`**.

Tres lecturas **síncronas** (sin patrón `202` + seguimiento), todas en
`themis-query`:

- **Listado** — `GET …/operations/{operationId}/documents` → `{ items: [...] }`.
	Sin paginación (lista acotada). Excluye los documentos de `owner === 'generic'`.
- **Estado documental** — `GET …/operations/{operationId}/documents/status` →
	`{ required, present, pending }`. `present` son los documentos en estado
	`LABELED`/`VERIFIED`; `pending = required − present` por clave `owner:type`.
- **URL de descarga** — `GET …/operations/{operationId}/documents/{documentId}/url`
	→ `{ url, expiresAt, contentType? }`. Es una **URL presignada efímera** (TTL
	~5 min, `contentDisposition=attachment`). La descarga en sí va **directa a S3,
	fuera de Themis**: el navegador abre la `url` y baja el binario; la API no
	interviene.

El estado de un documento es `PENDING | NO_LABELED | LABELED | VERIFIED`. Los
documentos **no aparecen en el change-feed**: no hay *drift* documental que
consumir, se consultan **bajo demanda**. Los errores llegan en
`application/problem+json` con `code = THEMIS_HTTP_<status>` (p. ej.
`THEMIS_HTTP_404`).

```mermaid
sequenceDiagram
	autonumber
	participant B as Navegador
	participant BFF as Ruta BFF (/api)
	participant SDK as SDK Themis
	participant T as Themis | Mock
	participant S3 as S3 | Descarga mock

	B->>BFF: GET /api/operations/:id/documents (+ /status)
	BFF->>SDK: query.listOperationDocuments / getOperationDocumentsStatus
	SDK->>T: GET /themis/query/v1/operations/:id/documents(/status)
	T-->>SDK: {items} · {required, present, pending}
	SDK-->>BFF: datos
	BFF-->>B: 200 {..., _themis}

	B->>BFF: GET /api/operations/:id/documents/:docId/url
	BFF->>SDK: query.getDocumentUrl(id, docId)
	SDK->>T: GET …/documents/:docId/url
	T-->>SDK: {url, expiresAt}
	SDK-->>BFF: URL presignada
	BFF-->>B: 200 {url, expiresAt, _themis}
	B->>S3: GET url (descarga directa, fuera de Themis)
	S3-->>B: PDF (attachment) · 410 si expiró
```

**En el mock.** Se siembran documentos y requisitos para las operaciones `INTAKE`
(ya `PROCESSED`) en `mock_documents` y `mock_document_requirements`, con una mezcla
que deja documentos presentes y algún requisito **pendiente**, para que el estado
documental sea ilustrativo. El endpoint de URL devuelve una `url` que apunta a una
**ruta local** (`GET /api/mock/documents/:documentId/download`) que simula S3:
sirve un **PDF de ejemplo** generado en memoria con `Content-Disposition:
attachment`, valida el `exp` de la URL y responde **`410 Gone`** si ha caducado
(enseña el TTL). Esa ruta **no** pasa por el SDK ni por Themis y solo existe en
modo mock. Fiel al filtro de esta rama, el mock emite `THEMIS_HTTP_404` para
documentos (a diferencia del `THEMIS_OPERATION_NOT_FOUND` que usa para operaciones).

**En la UI.** El detalle de la operación embebe un **panel de Documentos** (carga
bajo demanda con `apiFetch`) y ofrece una **subpágina dedicada**
(`/operations/[operationId]/documents`, *server component*) con la vista completa.
Ambas comparten los componentes de presentación (`DocumentsView`) y de descarga
(`DocumentDownloadButton`), y cada llamada se ve en el `RequestInspector`.

## Decisiones de diseño

- **Idempotencia en dos capas.** La **`Idempotency-Key`** (RFC, por operación de
	escritura) protege ante reintentos de red; el **`externalId`** (único por marca)
	protege ante duplicados de negocio. El BFF, si ya tiene una fila local para ese
	`externalId`, **reutiliza su `Idempotency-Key`**: un reintento idempotente de
	verdad.
- **Backoff en dos niveles.** El **transporte del SDK** reintenta `429`/`5xx` con
	*backoff* exponencial y `Retry-After`. El **navegador** consulta el estado del
	alta con *backoff* acotado (`backoffSchedule`) hasta un estado terminal, para no
	martillear la API.
- **Cursores opacos.** La paginación, el change-feed y el feed de hitos usan
	*cursores* que **no debes interpretar**: guarda el `nextCursor` (o el `since`) y
	devuélvelo tal cual en la siguiente petición.
- **Dos feeds distintos, misma mecánica.** El **change-feed** sigue el *drift* de
	estado/etapa de la operación; el **feed de hitos** sigue las transiciones de
	**negocio** (hitos `ACHIEVED`/`REVOKED` con su `source`). Comparten el patrón
	incremental (`version`, `since`, *cursor*, progreso en `feed_state`) pero son
	endpoints y claves de feed **separados**, y el de hitos **no** absorbe filas en el
	índice de operaciones (no son operaciones, son eventos de negocio).
- **Separación índice / detalle como decisión de seguridad.** Los listados y el
	change-feed son un **índice sin datos personales**; el **detalle** (con PII) se
	consulta **una operación cada vez**.
- **Aislamiento por marca.** Una operación que no es tuya responde **`404`** (no
	`403`): no revelamos ni su existencia.
- **Dos bases de datos separadas.** El almacén del integrador (`integrator.db`) y el
	backend simulado (`themis-mock.db`) son ficheros distintos, para no mezclar "tu
	lado" con la simulación del "lado Themis".
- **Observabilidad con redacción en el servidor.** Los intercambios request/response
	se capturan y **redactan en el SDK** (lado servidor). La UI puede mostrarlos
	enteros —para que el integrador aprenda el contrato— sin que el bearer ni los
	secretos M2M lleguen nunca al navegador.
