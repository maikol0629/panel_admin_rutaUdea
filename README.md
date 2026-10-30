# Panel Admin RutaUdeA

Panel web (Next.js + TypeScript + Firebase Admin) para gestionar el banco de
preguntas de RutaUdeA. Desde la Fase 7 trabaja con el **contrato v2**
(`questions_v2`, `contexts_v2`, `bank_manifest`) y deja el banco legacy
`questions` en **solo lectura** para rollback.

## Estado

- ✅ Autenticación con Firebase Auth y custom claim `rol === 'admin'`.
- ✅ Listado, detalle, edición y revisión de preguntas v2.
- ✅ Editor de imágenes con `rol`, `orden`, `alt` y `url` (D-05).
- ✅ Soporte de `opciones_en_imagen` (D-06) y `requiere_imagen`.
- ✅ Contextos compartidos (`contexts_v2`) con bloqueo de borrado si están en uso.
- ✅ Importador JSONL canónico (preguntas y contextos) e importador CSV.
- ✅ Publicación de `bank_manifest/active` con verificación y confirmación.
- ✅ Filtros por banco, `bank_version`, área, subtema, dificultad, estado,
  confianza, tarea, imágenes, opciones en imagen e incompletas.
- ✅ Build, TypeScript y 33 tests en verde.

## Requisitos

- Node.js 20+.
- Proyecto Firebase con Firestore y Auth.
- Una cuenta con custom claim `rol: 'admin'`.
- Variables de entorno en `.env.local` (ver `.env.example`):

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

> `.env.local` y las claves `*-firebase-adminsdk-*.json` están en `.gitignore`.
> La service account se usa **solo** en API Routes (`lib/firebase-admin.ts`);
> nunca se envía al navegador.

## Comandos

```bash
npm install
npm run dev        # desarrollo en http://localhost:3000
npm test           # vitest: 4 archivos, 33 tests
npm run test:coverage # pruebas y umbrales de cobertura
npm run lint       # ESLint
npm run format:check # Prettier sin cambios pendientes
npm run typecheck  # comprobación estricta de tipos
npm run check      # formato, lint, tipos y cobertura
npm run build      # build de producción
npm start          # servir el build
```

## Rutas

| Ruta                           | Descripción                                         |
| ------------------------------ | --------------------------------------------------- |
| `/auth/login`                  | Login con email/contraseña; exige claim admin.      |
| `/panel`                       | Dashboard con cifras reales del banco.              |
| `/panel/preguntas`             | Listado y filtros; alterna banco v2 / legacy.       |
| `/panel/preguntas/[id]`        | Detalle, imágenes y acciones de revisión.           |
| `/panel/preguntas/[id]/editar` | Formulario v2 (legacy en solo lectura).             |
| `/panel/contextos`             | Contextos e imágenes de `contexts_v2`.              |
| `/panel/banco`                 | Verificación y publicación del manifiesto.          |
| `/panel/importar-csv`          | Importador JSONL y CSV.                             |
| `/panel/configurar`            | Parámetros del simulacro (sin cambios de contrato). |
| `/panel/reportes`              | Reportes existentes.                                |

## API

| Ruta                                  | Métodos          | Notas                                                                                                       |
| ------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `/api/questions`                      | GET, POST        | `?banco=legacy` para el banco congelado; POST crea en `pendiente`.                                          |
| `/api/questions/[id]`                 | GET, PUT, DELETE | Edición con lista blanca + `merge`; acciones de revisión y borrado lógico. Legacy devuelve 403 al escribir. |
| `/api/contexts`                       | GET, POST        | Lista y upsert de `contexts_v2`.                                                                            |
| `/api/contexts/[id]`                  | GET, PUT, DELETE | DELETE bloquea (409) si hay preguntas que referencian el contexto.                                          |
| `/api/import/jsonl`                   | POST             | `?tipo=preguntas\|contextos`; por defecto `pendiente`/`verificada=false`.                                   |
| `/api/import/csv`                     | POST             | Parser RFC 4180; escribe en `questions_v2` como `pendiente`.                                                |
| `/api/bank/manifest`                  | GET, POST        | GET verifica; POST publica con `confirmar: true`.                                                           |
| `/api/auth/login`, `/api/auth/verify` | POST             | Verificación del ID token y del claim admin.                                                                |

### Flujo de revisión

1. Importar `questions_v2.jsonl` y `contexts_v2.jsonl` desde
   `/panel/importar-csv` (o crear/editar preguntas).
2. Revisar en `/panel/preguntas` filtrando por estado/confianza/tarea.
3. Aprobar (`aprobado`) o aprobar con imagen (`aprobado_con_imagen`). La API
   valida taxonomía, 4 opciones, respuesta, verificación y URL de imagen.
4. Rechazar/cuarentena/deshabilitar exige motivo y se registra en `notas`. El
   motivo solo es obligatorio cuando la pregunta cambia a `deshabilitado`
   desde otro estado; editar una ya deshabilitada no lo exige de nuevo.
5. En `/panel/banco`, verificar los motivos y publicar el manifiesto con la
   casilla de confirmación.
6. La app sincroniza en su próxima ejecución (D-02).

### Reglas de publicación

Solo se publican preguntas:

- con `estado` `aprobado` o `aprobado_con_imagen`;
- de la misma `bank_version` que se publica;
- con área, taxonomía RL01–RL18 / CL01–CL14, dificultad, 4 opciones,
  respuesta A–D y `verificada: true`;
- con imagen y URL cuando `requiere_imagen` o el estado es
  `aprobado_con_imagen`;
- cuyos `contexto_ids` existan en `contexts_v2`.

El manifiesto incluye `counts.aprobadas` (cantidad que la app descarga),
`counts.total`, `hash`, `published_at/by`, `min_app_version`,
`image_base_url`, `previous` e historial por versión.

## Contrato de datos

La fuente única es `lib/bank.ts`:

- `opciones` como objeto `{ A, B, C, D }` (se aceptan listas legacy al leer).
- `imagenes`: `{ url, rol: 'contexto'|'pregunta', orden, alt, path_origen, sha256 }`.
- Estados: `aprobado`, `aprobado_con_imagen`, `pendiente`, `deshabilitado`.
- Áreas: `razonamiento_logico`, `competencia_lectora`.
- Campos de revisión: `verificada`, `confianza_modelo`, `revisado_por`,
  `fecha_revision`, `notas`, `tarea`, `numero`, `metadatos`.

## Tests y calidad

`__tests__/` cubre:

- `bank.test.ts`: normalización, opciones objeto/lista, imágenes con rol,
  taxonomía oficial, faltantes para publicar, validación de lote y resumen.
- `import-jsonl.test.ts`: importación de preguntas/contextos con Firebase Admin
  mockeado, modo `respetar_estado`, filas inválidas y duplicados.
- `manifest.test.ts`: hash estable del lote y parser CSV RFC 4180.

La autenticación y las escrituras reales en Firestore no se ejercitan en estos
tests (requieren staging y credenciales).

`npm run test:coverage` genera HTML, LCOV y salida de consola, y aplica los
umbrales definidos en `vitest.config.ts`: 80% de statements, líneas y
funciones, y 75% de ramas. El reporte se publica como artefacto del workflow
`Quality checks`. La última medición local alcanzó 81.16% de statements,
82.82% de líneas y 92.36% de funciones; las ramas están en 69.63%, por lo que
CI sigue fallando deliberadamente hasta cubrir las rutas defensivas restantes.

El workflow valida formato, ESLint, TypeScript, pruebas y cobertura en cada
pull request y en `main`/`master`. La auditoría de dependencias se ejecuta
sobre las dependencias de producción. No se configura E2E todavía porque el
repositorio no tiene un entorno de staging aislado ni flujos Playwright
existentes; debe incorporarse junto con ese entorno, no contra Firestore real.

## Salvedades

- El banco legacy `questions` se conserva congelado: el panel lo muestra en
  solo lectura y la app ya no lo usa.
- La primera publicación real de `bank_manifest/active` y las pruebas E2E
  contra Firestore staging quedan para Fase 8.
- Next.js quedó en `16.4.3` (parche de seguridad) con `firebase@13.1.0`.
  El build ya no muestra el aviso `SecurityFatalError`.
- React 18 está deprecado en Next 16: el build emite un aviso y seguirá
  funcionando hasta Next 17. La actualización a React 19 queda para Fase 8.
- `npm audit` reporta 4 vulnerabilidades `high` transitivas en
  `@grpc/grpc-js` (dependencia de `@firebase/firestore`). **No ejecutes
  `npm audit fix --force`**: propone `firebase@9.14.0`, que rompe el build
  SSR (`Component auth has not been registered yet`).
- `npm run lint` no funciona: `next lint` fue eliminado en Next 16 y el
  proyecto no tiene ESLint configurado. Usar `npx tsc --noEmit` mientras se
  define la configuración.
- `tailwind.config.js` usa CommonJS dentro de un paquete ESM; genera un warning
  de Turbopack, no bloquea el build.

---

_Última actualización: 2026-10-27 — Fase 7 del plan de migración del banco UdeA._
