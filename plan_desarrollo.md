# PLAN DE DESARROLLO — Panel Administrativo RutaUdeA

**Objetivo:** Construir un panel web administrativo que permita gestionar el banco de preguntas, contenido educativo y parámetros del simulacro para la aplicación móvil RutaUdeA.

**Estado:** Planificación inicial. La aplicación móvil (`rutaUdea/`) ya tiene la arquitectura completada con Firebase Auth, Firestore, Room y 200 preguntas validadas. El panel admin debe complementar este sistema.

---

## 1. Propósito y Alcance

El panel administrativo provee a los rol `admin` las siguientes funcionalidades mínimas para el MVP:

| Función | Descripción |
| :--- | :--- |
| **Autenticación** | Acceso con credenciales Firebase (email/contraseña); verificación de rol `admin` en el token de usuario |
| **CRUD de preguntas** | Crear, leer, actualizar y eliminar preguntas del banco maestro |
| **Carga masiva** | Importar preguntas desde formato CSV compatible con el dataset existente |
| **Filtros y búsqueda** | Filtrar por área (RL/CL), componente (RL01–RL18, CL01–CL14), subtema, dificultad (baja/media/alta), estado (aprobado/pendiente/deshabilitado) |
| **Gestión de catálogo** | Mantener catálogo de 15 componentes RL + 14 subtemas CL con orden y descripción |
| **Configuración de simulacro** | Parámetros de distribución, tiempo máximo (120 min), regla de inactividad, políticas de repetición |
| **Contenido educativo** | Gestionar los 29 componentes (descripción, estrategia, errores comunes) empaquetados como asset offline-first |
| **Indicadores** | Reportes de distribución del banco, preguntas por estado, última sincronización con app móvil |

---

## 2. Arquitectura y Tecnologías

**Stack unificado: Next.js 14 con pageRouter (directorio `pages/`) y TypeScript.**

Esta arquitectura usa un solo proyecto que sirve tanto como frontend como backend, eliminando la necesidad de un servidor Express separado. Next.js se despliega en Firebase Hosting o de forma standalone.

### Características clave
- **API Routes** en `pages/` — Endpoints `POST /api/`, `GET /api/`, etc. sin configuración adicional
- **Firebase Admin SDK** integrado dentro de las API Routes (mismo proyecto que la app móvil)
- **React components** en las páginas `pages/` para la interfaz de usuario
- **Page Router** (`pages/`) en lugar de App Router — más predecible para este caso de uso y compatibilidad con Firebase
- **Firma de URLs** — Next.js puede servir archivos estáticos y manejar redirecciones de Firebase Hosting

### Backend (Next.js API Routes)
- **Runtime:** Node.js + TypeScript (entorno Next.js)
- **Framework:** Next.js 14 con pageRouter
- **Firebase Admin SDK:** Inicializado en cada API Route con las credenciales del proyecto `rutaUdea/`
- **Firestore:** Base de datos principal (misma colección que la app móvil)
- **Autenticación Firebase Verification** — Middleware o helper en cada route para verificar custom claim `rol === 'admin'`

### Frontend (React en Next.js pages)
- **Framework:** Next.js 14 + pageRouter
- **Idioma:** TypeScript completo
- **UI Library:** TailwindCSS o Material-UI (configurado para Next.js)
- **Data fetching:** `getServerSideProps` para páginas que necesitan datos admin, o uso de `useEffect` con llamadas a `/api/`
- **Routing:** Navegación entre `/login`, `/panel`, `/preguntas`, `/configurar`, etc.

### Integración con App Móvil
| Componente | Mobile App | Admin Panel (Next.js) |
| :--- | :--- | :--- |
| **Preguntas** | Room (local) + Firestore (sync) | API Routes `/api/questions` → CRUD en colección `questions` |
| **Estado** | `aprobado` / `pendiente` / `deshabilitado` | Mismo esquema; las API routes validan el estado antes de operar |
| **Formato CSV** | `udea_questions.csv` | Mismo formato; procesado en API Routes `/api/import/csv` |
| **Autenticación** | Firebase Auth con gate obligatorio | Mismo proyecto Firebase; verifyIdToken en cada API Route |
| **Reglas Firestore** | Ya definidas (`firestore.rules`) | Consolas bajo mismo proyecto; API routes respeta los `isAdmin()` checks |
| **Despliegue** | APK Android | Firebase Hosting (sitio Next.js) o standalone Node.js |

---

## 3. Estructura de Colecciones Firestore

Las colecciones ya están definidas en `firestore.rules`. El panel admin escribirá en:

| Colección | Campos principales | Escritura por panel |
| :--- | :--- | :--- |
| `users` | `uid`, `nombre`, `correo`, `rol`, `fechaCreacion`, `estado` | Solo en inicialización (no CRUD masivo desde panel) |
| `questions` | `id`, `area`, `componente`, `subtema`, `competencia`, `tipo_texto`, `dificultad`, `contexto`, `pregunta`, `opciones` [A-D], `respuesta_correcta`, `explicacion`, `fuente`, `tipo_fuente`, `es_original`, `verificada`, `duplicado`, `estado` | **CRUD completo** — crear, editar, cambiar estado `aprobado/pendiente/deshabilitado` |
| `components` | `id`, `nombre`, `descripcion`, `orden` (15 items: RL01–RL15) | CRUD para mantener catálogo |
| `subtopics` | `id`, `componentId`, `nombre`, `descripcion`, `orden` (14 items CL + algunos RL) | CRUD por componente |
| `educationalContent` | `id`, `componentId`/`subtopicId`, `titulo`, `contenido`, `estado` (29 items) | CRUD para descripciones, estrategias, errores comunes |
| `settings` | `key` (tiempo_simulacro, inactividad_penalizacion, distribucion_preguntas, ...) | Configuración unilateral desde panel admin |
| `recommendations` | `id`, `userId`, `subtopicId`, `motivo`, `prioridad`, `estado`, `fecha` | Generado por sistema, lectura admin |
| `simulations` / `simulationQuestions` | Datos de simulacros realizados | Solo lectura (estadísticas de uso) |

---

## 4. Endpoints y Rutas API (Next.js API Routes)

Todos los endpoints se definen en el directorio `pages/api/` de Next.js. Las rutas a continuación son equivalentes a `POST /api/auth/login`, etc., y se implementan como archivos `pages/api/auth/login.ts`, `pages/api/questions/[id].ts`, etc.

### Arquitectura de endpoints
- **Archivo:** `pages/api/archivo.ts` — cada archivo es un endpoint HTTP independiente
- **Middleware:** Verificación de token Firebase en cada route (opcional: crear un middleware centralizado)
- **Respuestas:** JSON consistente con `{ success, data, error }` pattern
- **TypeScript:** Tipado completo de request/response en cada endpoint

### Autenticación
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `POST` | `pages/api/auth/login.ts` | Login con email/contraseña; verifica credenciales Firebase y custom claim `rol === 'admin'` |
| `POST` | `pages/api/auth/verify.ts` | Verifica que el usuario actual tiene rol admin decodificando el token ID |

### Preguntas
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `GET` | `pages/api/questions.ts` | Listado paginado con filtros query: `?area=RL&subtema=Porcentajes&dificultad=media&estado=aprobado&limit=20&page=1` |
| `GET` | `pages/api/questions/[id].ts` | Obtener una pregunta por ID (param route) |
| `POST` | `pages/api/questions.ts` | Crear nueva pregunta (estado por defecto: `pendiente`) |
| `PUT` | `pages/api/questions/[id].ts` | Actualizar pregunta existente |
| `DELETE` | `pages/api/questions/[id].ts` | Actualizar estado a `deshabilitado` (soft-delete en lugar de borrado físico) |

### Importación CSV
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `POST` | `pages/api/import/csv.ts` | Subir archivo CSV (multipart/form-data o base64); validar encabezados, tipos, duplicados; importar en estado `pendiente` y retornar reporte de errores |

### Catálogo
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `GET` | `pages/api/components.ts` | Listar todos los componentes (15 RL + configuración) |
| `POST` | `pages/api/components.ts` | Crear nuevo componente |
| `PUT` | `pages/api/components/[id].ts` | Actualizar componente existente |
| `GET` | `pages/api/subtopics.ts` | Listar todos los subtemas (relacionados con componentes) |
| `POST` | `pages/api/subtopics.ts` | Crear nuevo subtema (obligatorio asociar a componente) |

### Configuración
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `GET` | `pages/api/settings.ts` | Obtener todos los parámetros de configuración (tiempo simulacro, inactividad, distribución) |
| `PUT` | `pages/api/settings.ts` | Actualizar parámetros (tiempo simulacro, inactividad, políticas de repetición) |

### Contenido Educativo
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `GET` | `pages/api/educational-content.ts` | Listar contenido por área o todo |
| `POST` | `pages/api/educational-content.ts` | Crear/actualizar contenido de componente/subtema |
| `DELETE` | `pages/api/educational-content/[id].ts` | Eliminar contenido (cambiar estado o borrado físico) |

### Reportes
| Método | Ruta Next.js | Descripción |
| :--- | :--- | :--- |
| `GET` | `pages/api/reports/distribution.ts` | Distribución de preguntas por área, subtema, dificultad, estado (agregación desde Firestore) |
| `GET` | `pages/api/reports/stats.ts` | Estadísticas generales: total preguntas, por validar, aprobadas, deshabilitadas, última sincronización |

---

## 5. Flujo de Trabajo de Importación

1. Admin sube archivo CSV con formato:
   ```
   id,componente,subtema,dificultad,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,explicacion,tiene_contexto_compartido,descripcion_contexto
   ```

2. Backend valida:
   - Encabezados obligatorios presentes
   - Cada pregunta tiene exactamente 4 opciones (A–D)
   - `respuesta_correcta` ∈ {A, B, C, D}
   - `id` único (no duplicados en Firestore ni en lote)
   - `area` y `componente` válidos (RL o CL, catálogo existente)
   - `dificultad` ∈ {baja, media, alta}

3. Preguntas inválidas se marcan y se devuelve reporte de errores

4. Preguntas válidas se insertan en Firestore con `estado: "pendiente"`

5. Admin revisa el lote y cambia estado a `aprobado` (o `deshabilitado` si hay problemas)

6. La app móvil, al llamar a `updateBankFromFirestore()`, descarga solo preguntas con `estado === "aprobado"`

---

## 6. Flujo de Aprobación de Preguntas

```
Administrador
     ↓
Carga CSV o crea pregunta nueva
     ↓
Pregunta insertada con estado: "pendiente"
     ↓
Panel muestra pregunta en estado pendiente
     ↓
Administrador revisa: correcta, explicación coherente, formato OK
     ↓
Cambia estado a: "aprobado"
     ↓
`updateBankFromFirestore()` en la app móvil descarga la pregunta
     ↓
La pregunta está disponible en simulacros y práctica
```

---

## 7. Flujo de Configuración de Simulacro

El panel admin configura parámetros que la app móvil leerá al iniciar un simulacro:

| Parámetro | Valor por defecto | Descripción |
| :--- | :--- | :--- |
| `tiempo_simulacro_minutos` | `120` | Duración total del simulacro (120 min = 2 horas) |
| `pregunta_rl_count` | Derivado del banco | Cuota de preguntas RL por simulacro (40 de 80) |
| `pregunta_cl_count` | `40` | Cuota de preguntas CL por simulacro (40 de 80) |
| `inactividad_max_minutos` | `POR_DEFINIR` | Tiempo sin actividad que dispara cierre |
| `politica_repeticion` | `ultimos_3` | Excluir preguntas de los últimos N simulacros del usuario |
| `distribucion_dificultad` | `proporcional` | Usar distribución proporcional al banco (mayor residuo) |

Estos valores se guardan en la colección `settings` y la app móvil los leerá al iniciar cada simulacro.

---

## 8. Flujo de Contenido Educativo

Los 29 componentes (15 RL + 14 CL) tienen contenido asociado que viaja offline en la app como asset `assets/info/contenido_educativo.json`. El panel admin gestiona esta colección:

1. Admin entra al tab 📚 en la app
2. Panel muestra lista de componentes con estado de contenido
3. Admin puede editar descripción, estrategia de resolución, errores comunes para cada componente
4. Los cambios se guardan en Firestore colección `educationalContent`
5. Al siguiente rebuild/actualización de la app, el asset se regenera o se lee directamente de Firestore (modo offline-first con fallback)

---

## 9. Flujo de Autenticación Admin

```
Usuario visita /login
     ↓
Ingresa email/contraseña
     ↓
POST /api/auth/login → verifica credenciales Firebase
     ↓
Decodifica token ID de Firebase Auth
     ↓
Verifica: `token.rol === 'admin'` (custom claim o documento users/{uid}.rol)
     ↓
Si es admin → genera sesión JWT o usa sesión de Firebase
     ↓
Redirige a panel principal
     ↓
Si no es admin → devuelve 403 o redirige a login de aspirante
```

**Opción alternativa (más simple):** Usar Firebase Auth con custom claims.
- Al crear un usuario admin: `admin.setCustomUserClaims({ rol: 'admin' })`
- El panel verifica `firebase.auth().currentUser.getIdTokenResult()` y valida el claim
- Las reglas Firestore ya tienen la función `isAdmin()` definida

---

## 10. Prioridad y Orden de Implementación

| Prioridad | Funcionalidad | Comentario |
| :---: | :--- | :--- |
| **P0** | Autenticación admin y verificación de rol | Base para todas las demás funcionalidades |
| **P0** | CRUD básico de preguntas (create/read/update/delete) | Funcionalidad central del panel |
| **P0** | **Carga e validación de CSV** | Importación masiva de preguntas mediante archivo CSV con validación de encabezados, tipos de datos, detección de duplicados y reporte de errores por fila. Implementado en `pages/api/import/csv.ts` con interfaz de usuario en `CsvImportForm.tsx`. |
| **P0** | Filtros y búsqueda en lista de preguntas | Usabilidad para administrar bancos grandes - Phase 3 implementa filtros avanzados |
| **P0** | Gestión de componentes y subtemas | Catálogo de 15 RL + 14 CL |
| **P0** | Configuración de parámetros del simulacro | Phase 4: Endpoints `GET/PUT /api/settings` con validación de distribución de dificultad y políticas de repetición. UI en `pages/panel/configurar.tsx`. |
| **P0** | **Edición y cambio de estado de preguntas** | Phase 5: Endpoints `GET/PUT/DELETE /api/questions/[id]` (DELETE = borrado lógico). Páginas `/panel/preguntas/[id]` (detalle + cambio de estado) y `/panel/preguntas/[id]/editar` (formulario con campos condicionales por área). Aprobar exige enunciado, 4 opciones y respuesta A–D. |
| **P1** | **Gestión de contenido educativo (29 componentes)** | Pendiente: contenido offline-first en app móvil (asset `assets/info/contenido_educativo.json`). |
| **P1** | **Reportes e indicadores del banco** | Phase 4: Panel `ReportsDashboard` en `/panel/reportes` con distribución por área/dificultad, sincronización app y estadísticas generales. |
| **P0** | **Caza del banco sucio** | Phase 6: filtro `incompletas=true` en `GET /api/questions` (sin enunciado, opciones vacías o sin respuesta A–D) con contador `totalIncompletas` y checkbox "Solo incompletas" en el listado. |
| **P1** | **Asset limpio para instalaciones nuevas** | Phase 6: `scripts/export-bank-to-jsonl.js` vuelca Firestore al formato exacto de `questions.jsonl` (default: solo `aprobado` completas; omite incompletas con reporte). Dirección única Firestore → asset. |
| **P2** | Integración con IA para generación de explicaciones | Pendiente: asistente IA que propone explicaciones, admin revisa/approval. |
| **P2** | **Historial de cambios y auditoría** | Pendiente: colección `auditLogs` en Firestore con registro de quién/hacé/qué/cuándo. |

---

## 11. Consideraciones de Seguridad

1. **Reglas Firestore:** Ya están definidas en `firestore.rules`. Las API Routes de Next.js deben verificar el token Firebase ID en cada petición (middleware `verifyIdToken`) antes de operar, complementando las reglas del servidor.
2. **Autenticación:** Todo acceso al panel debe venir de un usuario verificado con rol `admin`. En Next.js, esto se hace con `await adminAuth().verifyIdToken(request.headers.authorization?.replace('Bearer ', '') || '')` en cada API Route.
3. **Validación en backend:** Nunca confiar ciegamente en los datos enviados desde el frontend (even con Next.js). Validar siempre:
   - IDs únicos
   - Formatos esperados (fechas, enteros, enumeraciones)
   - Que el área/componente/existen en el catálogo
   - Que respuesta_correcta sea una de las 4 opciones
4. **Rate limiting:** Next.js API Routes comparten el mismo Node.js process. Proteger endpoints de importación CSV contra abusos usando un contador en memoria o Redis (si se configura). Para producción, considerar rate limiter middleware como `express-rate-limit` si se usa Express en modo híbrido, o implementar rate limiting personalizado en las API Routes.
5. **Logs de auditoría:** Registrar acciones sensibles (borrar pregunta, cambiar estado de 100+ preguntas, etc.) en Cloud Logging o archivo local. Cada API Route puede escribir en `admin.firestore().collection('auditLogs').add({...})`.

---
*Nota:* Las reglas Firestore (`firestore.rules`) ya tienen la función `isAdmin()` definida, pero **es crítico** también verificar el token en el backend de Next.js, ya que las reglas del servidor no impiden que una llamada HTTP maliciosa evite el cliente web. La doble verificación (client + server) es el patrón recomendado.

## 12. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Banco inconsistente** | Preguntas con datos corruptos entran al sistema | Validación rigorosa en importación; admin revisa antes de aprobar |
| **Usuario no admin accede al panel** | Filtro en reglas Firestore + verificación en backend | Verificar custom claim `rol === 'admin'` en cada petición |
| **CSV con formato cambiado** | Importación falla o datos corruptos | Validar encabezados exactos; proporcionar reporte de errores detallado |
| **Pérdida de datos** | Eliminación accidental de preguntas | Soft-delete (cambiar estado a `deshabilitado`) en lugar de `DELETE` real; backups de Firestore |
| **Desync con app móvil** | App usa banco viejo después de actualización | `updateBankFromFirestore()` debe ejecutarse después de cambios admin; mostrar versión del banco |

---

## 13. Próximos Pasos Inmediatos

1. **Inicializar proyecto Next.js** con pageRouter en el directorio `panel_admin_rutaUdea/`:
   ```bash
   npx create-next-app@latest panel_admin_rutaUdea --typescript --eslint --tailwind --app
   # Luego cambiar a pageRouter: renombrar `app/` a `pages/` o configurar `rewrites`
   # O usar: `npx next@latest` y seleccionar pageRouter durante el setup
   ```
2. **Configurar Firebase Admin SDK** en las API Routes — usar las credenciales del proyecto `rutaUdea/`:
   - Archivo `serviceAccountKey.json` desde Firebase Console → Project Settings → Service accounts → Generate new private key
   - O variables de entorno: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   - Inicializar en cada API Route con:
     ```ts
     import admin from 'firebase-admin'
     if (!admin.apps.length) {
       admin.initializeApp({
         credential: admin.credential.cert({
           projectId: process.env.FIREBASE_PROJECT_ID,
           clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
           privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
         }),
       })
     }
     ```
3. **Crear estructura de páginas** `pages/` organizando los routes:
   - `pages/_app.tsx`, `pages/_document.tsx` — configuración base
   - `pages/index.tsx` — landing o página de bienvenida
   - `pages/auth/login.tsx` — login con email/contraseña + verificación de rol `admin`
   - `pages/panel/` — directorio protegido con middleware de autenticación
   - `pages/api/` — todos los endpoints definidos en la sección 4 (auth, questions, csv, components, settings, reports, educational-content)
4. **Implementar middleware de autenticación** en `pages/api/auth/verify.ts`:
   - Decodificar `request.headers.authorization` token Firebase `IdToken`
   - Verificar `decoded.customClaims.rol === 'admin'`
   - Retornar `403` con error si no es admin; adjuntar `userId` a `request` para usar en otras routes
5. **Construir endpoint CRUD básico** `pages/api/questions.ts`:
   - GET con query params: `area`, `subtema`, `dificultad`, `estado`, `limit`, `page`
   - POST crear pregunta con `estado: "pendiente"` por defecto
   - PUT actualizar por `[id]`
   - DELETE/actualizar estado a `deshabilitado` por `[id]`
6. **Crear validador CSV** `pages/api/import/csv.ts`:
   - Recibir archivo multipart o base64 en el body
   - Validar encabezados exactos contra el formato esperado
   - Verificar tipos de datos (fechas, enteros, enumeraciones `dificultad ∈ {baja,media,alta}`, `respuesta_correcta ∈ {A,B,C,D}`)
   - Detectar duplicados por `id` (consultar Firestore antes de insertar)
   - Insertar preguntas válidas con `estado: "pendiente"` y retornar reporte de errores para las inválidas
7. **Probar flujo completo:**
   - Iniciar sesión en `/auth/login` con cuenta que tenga `rol: "admin"` en el custom claim
   - Subir un CSV de prueba con 5 preguntas (3 válidas, 2 con errores)
   - Verificar que aparecen en Firestore con `estado: "pendiente"`
   - Cambiar manualmente 2 a `aprobado` en la consola de Firebase
   - Ejecutar `updateBankFromFirestore()` en la app móvil (`rutaUdea/`)
   - Confirmar que las 2 preguntas aprobadas aparecen en el selector de simulacros

---

**Estado Actual de las Fases:**

✅ **Phase 1 - Completada:**
- Login admin con verificación de rol `custom claim: rol === 'admin'`
- CRUD básico: GET/listado paginado con filtros, POST/crear preguntas (estado `pendiente`)
- Tests unitarios Vitest con cobertura para login, verify y questions endpoints
- UI: página de login y dashboard panel principal

✅ **Phase 2 - Completada:**
- Endpoint `POST /api/import/csv` con validación completa:
  * Encabezados obligatorios (13 columnas esperadas)
  * Validación de componentes (RL01-RL15, CL01-CL14)
  * Validación de dificultad (baja/media/alta)
  * Validación de respuesta correcta (A/B/C/D)
  * Detección de IDs duplicados dentro del lote
  * Reporte de errores por fila con motivos específicos
  * Insertar preguntas válidas en Firestore con estado `pendiente`
- Componente UI `CsvImportForm.tsx` con:
  * Vista previa de filas
  * Contador de válidas/inválidas
  * Botón de importar al backend
  * Manejo de errores y estados loading
- Página `/panel/importar-csv` con protección de ruta admin

### Siguiente Fase Recomendada: **Phase 3 - Filtros y Búsqueda Mejorada**

Después de tener el banco poblable mediante CSV, las siguientes mejoras prioritarias son:

1. **Mejorar el endpoint GET `/api/questions`** con:
   - Ordenamiento (orderBy en Firestore)
   - Búsqueda textual sobre pregunta/opciones
   - Filtros combinados más complejos
   - Paginación server-side consistente

2. **Crear páginas de gestión específicas:**
   - `/panel/preguntas` - Listado avanzado con todos los filtros
   - `/panel/configurar` - Configuración de parámetros del simulacro
   - `/panel/reportes` - Indicadores visuales del banco

3. **Preparar la sincronización completa:**
   - Testing del flujo `updateBankFromFirestore()` en la app móvil
   - Verificar que preguntas con estado `pendiente` no aparecen en simulacros
   - Fluido de aprobación manual desde consola Firebase

---

**Opción de despliegue:**
- **Firebase Hosting:** `firebase deploy` — usa el mismo proyecto que `rutaUdea/`, SSL automático, CDN global
- **Vercel:** Conexión automática desde el repositorio GitHub — deploys en segundos
- **Node.js standalone:** `next start` en cualquier entorno con Node 18+

---

*Plan de trabajo — Panel Administrativo RutaUdeA. Versión 1.6 (Next.js + pageRouter + Phase 6) — Oct 2026*