# panel_admin_rutaUdea

Panel administrativo web para la aplicación RutaUdeA. Permite a los administradores gestionar el banco de preguntas, cargar contenido, configurar parámetros del simulacro y revisar explicaciones generadas por IA.

## Propósito

Este panel complementa la aplicación móvil RutaUdeA, proporcionando a los administradores las herramientas necesarias para:
- Gestionar el banco de preguntas (CRUD completo)
- Cargar y validar preguntas desde CSV/JSON
- Filtrar y buscar preguntas por componente, subtema, dificultad y estado
- Gestionar componentes, subtemas y dificultad del examen
- Configurar parámetros del simulacro (distribución, tiempo, inactividad)
- Revisar y aprobar explicaciones asistidas por IA
- Consultar indicadores de uso y calidad del banco

## Estado Actual

El directorio `panel_admin_rutaUdea` fue creado con un README inicial pero aún no contiene código de implementación. El desarrollo principal de la aplicación móvil (`rutaUdea/`) ya está avanzado con:

- ✅ Autenticación Firebase (email/contraseña) con roles (aspirante/admin)
- ✅ Firestore con reglas de seguridad por rol
- ✅ Banco de 200 preguntas validadas empaquetado en la app
- ✅ `QuestionRepository.updateBankFromFirestore()` para sincronización
- ✅ Estructura de datos con `estado` (`aprobado`/`pendiente`/`deshabilitado`)

## Plan de Desarrollo del Panel Admin

### Fase 1: Configuración e Infraestructura (P0)

1. **Configurar proyecto web**
   - Inicializar proyecto Node.js o TypeScript
   - Configurar Firebase Admin SDK
   - Configurar Firebase Hosting

2. **Autenticación Admin**
   - Integrar con Firebase Auth custom claims o email/contraseña
   - Verificar rol `admin` en el token de usuario
   - Rutas protegidas solo para admins

3. **Estructura de bases de datos Firestore**
   - Verificar colección `questions` tiene los campos necesarios
   - Asegurar colecciones: `components`, `subtopics`, `settings`, `educationalContent`

### Fase 2: Módulos Core (P0)

4. **Vista de Preguntas (CRUD)**
   - Listado paginado de preguntas con filtros:
     * Área (RL/CL)
     * Subtema
     * Dificultad (baja/media/alta)
     * Estado (aprobado/pendiente/deshabilitado)
   - Botones: Ver, Editar, Eliminar, Cambiar estado
   - Modal/dialogo para edición de pregunta

5. **Carga de CSV/JSON**
   - Formato esperado basado en CSV existente:
     `id, componente, subtema, dificultad, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion, tiene_contexto_compartido, descripcion_contexto`
   - Validador de encabezados y tipos de datos
   - Detección de duplicados por `id`
   - Importación en estado `pendiente` para revisión admin

6. **Gestión de Componentes y Subtemas**
   - Catálogo de 15 componentes RL + 14 subtemas CL
   - CRUD de componentes y subtemas
   - Asignación de orden y descripción

### Fase 3: Funciones Administrativas (P0/P1)

7. **Configuración de Simulacro**
   - Parámetros de distribución por dificultad
   - Tiempo máximo (120 min)
   - Regla de inactividad
   - Políticas de repetición de preguntas

8. **Contenido Educativo**
   - Gestión de los 29 componentes (15 RL + 14 CL)
   - Descripción, estrategia de resolución, errores comunes
   - Empaquetado como asset offline-first para la app

9. **Indicadores y Reportes**
   - Total de preguntas por área/dificultad/estado
   - Distribución del banco
   - Estadísticas de importación/validación
   - Última sincronización con app móvil

### Fase 4: Integración y Testing (P1)

10. **Integración con app móvil**
    - Probar `updateBankFromFirestore()` desde el panel
    - Verificar sincronización de estados (pendiente/aprobado)
    - Testing de importación con datos reales

11. **Tests y Validación**
    - Tests de importación CSV con casos válidos e inválidos
    - Validación de duplicados y campos obligatorios
    - Reglas de Firestore bajo diferentes roles

## Requisitos Técnicos

### Backend
- Node.js + Express o TypeScript
- Firebase Admin SDK para operaciones de escritura
- Firebase Auth para autenticación
- Firestore como base de datos principal

### Frontend
- React + TypeScript o Vue 3 + TypeScript
- Firebase Authentication UI
- Tabla con filtros y pagination (React Table, TanStack Table, o similar)
- Modales para edición

### Integración con App Móvil
- Mismo proyecto Firebase
- Mismo formato de preguntas (JSONL/CSV compatible)
- Campo `estado` para flujo de aprobación
- Mismo schema de opciones (A, B, C, D)

## Formato de Datos Esperado

### Pregunta (colección `questions` en Firestore)
```json
{
  "id": "string único",
  "area": "razonamiento_logico" | "competencia_lectora",
  "componente": "RL01" | "RL02" | ... | "CL01" | ...,
  "subtema": "nombre del subtema",
  "competencia": "nombre de la competencia",
  "tipo_texto": "solo para CL",
  "dificultad": "baja" | "media" | "alta",
  "contexto": "texto de contexto (opcional)",
  "pregunta": "enunciado",
  "opciones": ["A", "B", "C", "D"],
  "respuesta_correcta": "A" | "B" | "C" | "D",
  "explicacion": "explicación detallada",
  "fuente": "nombre de la fuente",
  "tipo_fuente": "oficial|profe_alex|original|otra",
  "es_original": boolean,
  "verificada": boolean,
  "estado": "aprobado" | "pendiente" | "deshabilitado",
  "metadatos": { ... }
}
```

### CSV de Importación
```
id,componente,subtema,dificultad,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,explicacion,tiene_contexto_compartido,descripcion_contexto
```

## Próximos Pasos Inmediatos

1. Definir tecnología stack (Node/React vs Kotlin Multiplatform web)
2. Crear repositorio y estructura de carpetas
3. Implementar autenticación básica con Firebase
4. Construir CRUD mínimo de preguntas
5. Probar importación CSV con datos de muestra

---

*Documento de trabajo — Panel Admin RutaUdeA. Actualícese conforme avance el desarrollo.*