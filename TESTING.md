# Tests

Especificación de comportamiento y suite de tests automáticos del suplente digital. Los escenarios se derivaron del código actual (comportamiento observado, no deseado) y cada test referencia su ID en el título (por ejemplo, `BACK-GRAPH-05 ...`).

## Cómo correrlos

| App | Comando | Qué incluye |
|---|---|---|
| back | `cd back && npm test` | Vitest en entorno Node |
| back | `cd back && npm run test:watch` | modo watch |
| back | `cd back && npx tsc --noEmit -p test` | chequeo de tipos de `src` + `test` |
| front | `cd front && npm test` | Vitest + jsdom + Testing Library |
| front | `cd front && npm run test:watch` | modo watch |
| front | `cd front && npx tsc --noEmit && npm run lint` | tipos y lint (incluyen los tests) |

No hace falta `.env`, backend levantado ni conexión a internet.

## Estrategia

- **Deterministas y sin red.** Ningún test llama al LLM real (el cupo gratuito es limitado) ni descarga o carga el modelo de embeddings de Transformers.js (es lento).
- **Qué se simula y por qué:**

| Dependencia | Cómo se simula | Motivo |
|---|---|---|
| `llm` (`src/llm.ts`) | `vi.mock` con `invoke`/`bindTools` que devuelven `AIMessage` con o sin `tool_calls` | sin LLM real; respuestas controladas por escenario |
| `ChatOpenAI` | `vi.mock("@langchain/openai")` que captura los argumentos del constructor | verificar la precedencia de variables de entorno sin crear un cliente |
| `retrieve` / `getVectorStore` | `vi.mock` con chunks y puntajes fijos | controlar el umbral de relevancia |
| `LocalEmbeddings` | embeddings falsos por frecuencia de letras (26 dimensiones) | ingesta real sin descargar el modelo |
| `getMcpTools` | herramientas falsas `{ name, invoke }` | probar el bucle de herramientas, errores y truncado |
| `answerQuestion`, `buildHandoff` (API) | `vi.mock` | probar el contrato HTTP de forma aislada |
| `fetch` (front) | `vi.stubGlobal` | URLs, métodos y manejo de errores sin backend |
| `@/lib/api` (componentes) | `vi.mock` | probar la UI sin red |

- **Integración real acotada:** `BACK-MCP-08/09` levantan el servidor MCP propio por stdio (con `tsx`) y le piden herramientas. Es local, offline y tarda unos segundos.
- **Ingesta:** `BACK-RAG-03..05` crean un directorio temporal con `docs/` y hacen `process.chdir` antes de importar `ingest.ts` (por eso el back usa `pool: "forks"`).
- **Fechas:** el front fija `TZ=UTC` en `vitest.config.mts`; el back usa fechas locales construidas en el test o `vi.setSystemTime`.
- **Entorno del front:** `vitest.setup.ts` registra los matchers de jest-dom, hace `cleanup` después de cada test y define `scrollIntoView` (jsdom no lo implementa).

### Refactors mínimos para poder testear (sin cambio de comportamiento)

- `back/src/app.ts`: `createApp()` con las rutas. `server.ts` queda solo con el arranque (vector store, MCP, `listen`, señales), así la app se puede importar sin efectos secundarios.
- `back/src/mcp/tools.ts`: la lógica de las herramientas (`buildCalendar`, `listCalendarEvents`, `buildDraft`, `isoDate`) como funciones puras. `server.ts` las registra con los mismos nombres, esquemas, textos y logs.

## Escenarios del back

### Grafo: clasificación (`test/graph.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-GRAPH-01 | el clasificador responde "Ruta elegida: **Ejecutar**." | se procesa la consulta | la ruta es `ejecutar` y no se consulta el RAG |
| BACK-GRAPH-02 | el clasificador menciona varias rutas ("escalar (no corresponde responder)") | se procesa la consulta | gana la que aparece primero (`escalar`) |
| BACK-GRAPH-03 | el clasificador responde texto sin ninguna ruta conocida | se procesa la consulta | se usa `responder` por defecto |

### Grafo: responder

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-GRAPH-04 | chunks relevantes (puntaje ≥ 0.83) y una respuesta del LLM | se responde | devuelve la respuesta recortada, `escalada: false`, y el prompt incluye `[fuente]` + contenido |
| BACK-GRAPH-05 | el mejor puntaje es 0.829 | se responde | se escala por "no está cubierta por la documentación" sin llamar al LLM |
| BACK-GRAPH-06 | el mejor puntaje es exactamente 0.83 | se responde | se responde (el umbral es inclusivo) |
| BACK-GRAPH-07 | el RAG no devuelve chunks | se responde | se escala |
| BACK-GRAPH-08 | la respuesta empieza con `SIN_CONTEXTO` | se responde | se escala por "la documentación no alcanza" |
| BACK-GRAPH-09 | la respuesta menciona `SIN_CONTEXTO` al final | se responde | se elimina esa oración y se responde igual |
| BACK-GRAPH-10 | el LLM devuelve texto vacío | se responde | se escala |

### Grafo: ejecutar

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-GRAPH-11 | el modelo pide `consultar_calendario` y después responde | se ejecuta | se invoca la herramienta con sus argumentos, su salida (JSON) vuelve como `ToolMessage` y la ruta es `ejecutar` con `escalada: false` |
| BACK-GRAPH-12 | hay herramientas cargadas con y sin guía | se arma el prompt | solo se mencionan las herramientas cargadas (con su guía o su nombre) |
| BACK-GRAPH-13 | el modelo responde sin usar herramientas | se ejecuta | se escala ("no fue posible completar la acción") |
| BACK-GRAPH-14 | el modelo pide una herramienta inexistente | se ejecuta | se escala nombrando la herramienta |
| BACK-GRAPH-15 | la herramienta lanza un error | se ejecuta | se escala con un mensaje genérico, sin filtrar el error |
| BACK-GRAPH-16 | la herramienta devuelve más de 6000 caracteres | se ejecuta | la salida se trunca a 6000 + `[... resultado truncado]` |
| BACK-GRAPH-17 | la herramienta devuelve exactamente 6000 caracteres | se ejecuta | la salida no se modifica |
| BACK-GRAPH-18 | el modelo pide herramientas en todas las iteraciones | se ejecuta | se corta a las 4 iteraciones y se escala |
| BACK-GRAPH-19 | falla la carga de herramientas MCP | se ejecuta | se escala con mensaje genérico |

### Grafo: escalar y registro

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-GRAPH-20 | el clasificador elige `escalar` | se procesa la consulta | el mensaje de pendiente usa el motivo por defecto ("requiere la intervención de una persona") |
| BACK-GRAPH-21 | cualquier consulta | `answerQuestion` termina | se registra exactamente una vez con pregunta, respuesta, ruta, escalada y fecha ISO |

### Traspaso (`test/handoff.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-HANDOFF-01 | el registro está vacío | se arma el traspaso | contadores en 0, resumen fijo y sin llamada al LLM |
| BACK-HANDOFF-02 | interacciones de las tres rutas | se arma el traspaso | se cuentan por ruta y se usa el resumen del LLM (recortado) |
| BACK-HANDOFF-03 | interacciones escaladas y no escaladas | se arma el traspaso | `pendientes` contiene solo las escaladas (pregunta y fecha) |
| BACK-HANDOFF-04 | el LLM falla | se arma el traspaso | el resumen es el texto de respaldo con los conteos |
| BACK-HANDOFF-05 | el LLM devuelve texto vacío | se arma el traspaso | se usa el texto de respaldo |
| BACK-HANDOFF-06 | una respuesta registrada de 300 caracteres | se arma el registro para el LLM | se recorta a 200 caracteres |

### Registro (`test/log.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-LOG-01 | el registro recién creado | se agregan dos interacciones | se leen en orden de inserción |

### Configuración del LLM (`test/llm.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-LLM-01 | variables `LLM_*` y `OPENROUTER_*` definidas | se crea el modelo | se usan las `LLM_*` (modelo, clave, base URL) con `temperature: 0` |
| BACK-LLM-02 | solo variables `OPENROUTER_*` | se crea el modelo | se usan las `OPENROUTER_*` y la base URL de OpenRouter |

### Herramientas MCP (`test/mcp/tools.test.ts`, `test/mcp/server.integration.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-MCP-01 | una fecha base | se calcula `isoDate` | devuelve `YYYY-MM-DD` local, también al cruzar de mes |
| BACK-MCP-02 | el calendario simulado | se consulta una fecha con eventos | devuelve solo los eventos de ese día, con `hoy` y `fecha` |
| BACK-MCP-03 | el calendario simulado | se consulta una fecha sin eventos | devuelve una lista vacía |
| BACK-MCP-04 | el calendario creado dos días antes | se consulta sin fecha | devuelve solo eventos de hoy en adelante y `fecha: null` |
| BACK-MCP-05 | un único punto como texto | se redacta el borrador | el cuerpo es el punto sin viñeta, dentro de la plantilla `[BORRADOR - NO ENVIADO]` |
| BACK-MCP-06 | varios puntos, uno en blanco | se redacta el borrador | se listan con `- ` y se descartan los vacíos |
| BACK-MCP-07 | un arreglo con un solo punto | se redacta el borrador | se trata como punto único |
| BACK-MCP-08 | el servidor MCP real por stdio | se listan las herramientas | expone `consultar_calendario` y `redactar_borrador` bajo `suplente-tools` |
| BACK-MCP-09 | el servidor MCP real por stdio | se invocan ambas herramientas | devuelven el JSON del calendario y el borrador esperados |

### API (`test/app.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-API-01 | la app | `GET /health` | 200 con `{ status: "ok", uptime: número }` |
| BACK-API-02 | un body sin `pregunta` | `POST /consulta` | 400 con el error y sin llamar al grafo |
| BACK-API-03 | `pregunta` en blanco o no string | `POST /consulta` | 400 |
| BACK-API-04 | el grafo responde | `POST /consulta` | 200 con `{ respuesta, ruta, escalada }` y la pregunta recortada |
| BACK-API-05 | el grafo lanza un error | `POST /consulta` | 500 con mensaje genérico en español, sin detalles del error |
| BACK-API-06 | sin parámetro `q` | `GET /buscar` | 400 |
| BACK-API-07 | `q` con espacios | `GET /buscar` | 200 con la consulta recortada y los resultados del RAG |
| BACK-API-08 | un traspaso armado | `GET /traspaso` | 200 con el resultado de `buildHandoff` |

### RAG (`test/rag/retriever.test.ts`, `test/rag/ingest.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| BACK-RAG-01 | resultados con puntaje del vector store | se recupera | se mapean a `{ content, source, score }` con `k = 4` por defecto |
| BACK-RAG-02 | un `k` explícito y metadata sin `source` | se recupera | se usa ese `k` y `source` se convierte a string |
| BACK-RAG-03 | un `docs/` con `.md`, `.txt`, `.MD` y `.pdf` | se construye el vector store | se ingieren solo `.md`/`.txt` (sin distinguir mayúsculas), con `metadata.source`, y los documentos largos se parten en chunks de ≤ 500 caracteres |
| BACK-RAG-04 | el vector store ya construido | se vuelve a pedir | se reutiliza la misma instancia |
| BACK-RAG-05 | el vector store con embeddings falsos | se busca "vacaciones con anticipacion" | el primer resultado es `vacaciones.md` |

## Escenarios del front

### Cliente de API (`src/lib/api.test.ts`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-API-01 | el backend responde 200 | `askQuestion` | hace `POST /api/consulta` con JSON `{ pregunta }` y devuelve el body |
| FRONT-API-02 | el backend responde 200 | `fetchHandoff` | hace `GET /api/traspaso` y devuelve el body |
| FRONT-API-03 | el backend responde 4xx con `{ error }` | se hace un pedido | se lanza un error con ese texto |
| FRONT-API-04 | un error sin body JSON o con `error` no string | se hace un pedido | se lanza `Error <status> del servidor.` |
| FRONT-API-05 | `fetch` falla (sin conexión) | se hace un pedido | se lanza "No se pudo conectar con el servidor." |
| FRONT-API-06 | `/api/health` responde ok, no ok o falla | `checkHealth` | devuelve `true`, `false`, `false`, sin caché |

### RichText (`src/components/RichText.test.tsx`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-RICH-01 | texto con saltos de línea y una línea en blanco | se renderiza | un párrafo por línea y un separador por la línea en blanco |
| FRONT-RICH-02 | texto con `**negrita**` | se renderiza | se muestra en `<strong>` |
| FRONT-RICH-03 | líneas seguidas con `- `, `* ` y `•` | se renderiza | forman una sola lista |
| FRONT-RICH-04 | texto con HTML (`<b>x</b>`, `<img onerror>`) | se renderiza | se muestra literal, sin crear elementos |

### Chat (`src/components/Chat.test.tsx`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-CHAT-01 | una consulta escrita | se hace clic en Enviar | se envía recortada, se muestran la pregunta y la respuesta, y se limpia el campo |
| FRONT-CHAT-02 | una consulta escrita | se presiona Enter | se envía |
| FRONT-CHAT-03 | una consulta escrita | se presiona Shift+Enter | agrega una línea y no envía |
| FRONT-CHAT-04 | el campo vacío o en blanco | — | el botón Enviar está deshabilitado |
| FRONT-CHAT-05 | un pedido en curso | se intenta enviar otra consulta | botón "Enviando…" y ejemplos deshabilitados, "El suplente está pensando…" visible y no se envía otro pedido |
| FRONT-CHAT-06 | una respuesta escalada | se muestra | badge "Escalada a humano" y marca "⚑ Escalada" |
| FRONT-CHAT-07 | una respuesta ejecutada no escalada | se muestra | badge "Ejecutada" sin marca de escalada |
| FRONT-CHAT-08 | los ejemplos | se hace clic en uno | se envía esa pregunta |
| FRONT-CHAT-09 | el pedido falla | se envía | se muestra una alerta con el mensaje de error |

### HandoffPanel (`src/components/HandoffPanel.test.tsx`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-HANDOFF-01 | el panel recién montado | — | se muestra la ayuda y no se pide nada |
| FRONT-HANDOFF-02 | un pedido en curso | se hace clic en "Generar traspaso" | el botón muestra "Generando…" deshabilitado hasta que termina |
| FRONT-HANDOFF-03 | un traspaso con datos | se genera | contadores, resumen (con negrita) y pendientes con fecha en formato es-AR |
| FRONT-HANDOFF-04 | un pendiente con fecha no válida | se genera | se muestra el valor original |
| FRONT-HANDOFF-05 | sin resumen ni pendientes | se genera | "Sin actividad registrada." y "No hay consultas pendientes." |
| FRONT-HANDOFF-06 | el pedido falla | se genera | se muestra una alerta con el error y no la ayuda |

### Header (`src/components/Header.test.tsx`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-HEADER-01 | el health check responde ok | se monta | primero "Verificando…", después "Backend en línea" |
| FRONT-HEADER-02 | el health check falla | se monta | "Backend fuera de línea" |

Solo se prueba el primer chequeo; el sondeo cada 15 s no se cubre.

### SubstituteCard (`src/components/SubstituteCard.test.tsx`)

| ID | Dado | Cuando | Entonces |
|---|---|---|---|
| FRONT-CARD-01 | la tarjeta | se renderiza | nombre, rol, estado y foto con `referrerpolicy="no-referrer"` |
| FRONT-CARD-02 | la foto no carga | ocurre el error de la imagen | se reemplaza por la inicial "R" |

## Hallazgos

- No se encontraron defectos: todos los escenarios documentan el comportamiento actual y pasan. No hay tests marcados con `it.fails` ni `it.todo`.
- Observación (no es un defecto): `parseRoute` busca subcadenas, así que una palabra como "corresponder" contiene "responder" y cuenta como esa ruta.
