# TaskPilot — Asistente de tareas con IA (PWA)

PWA móvil donde la persona escribe en lenguaje natural lo que tiene pendiente y un
agente con *tool calling* crea y gestiona tareas en Supabase.

> **Estado actual:** las pantallas del frontend y el esquema/migraciones de Supabase
> para tareas y chat están en el repo. La Edge Function `task-agent`, la configuración
> del proyecto Supabase y las pruebas de integración todavía están pendientes.

## Stack

React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + TanStack Query 5 +
`@supabase/supabase-js`. Gestor de paquetes: **pnpm 12.21.0** (`packageManager` en
`package.json`). PWA con service worker propio (sin Workbox).

## Arranque

```bash
cp .env.example .env.local   # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm build
```

## Arquitectura (screaming architecture)

La estructura grita el dominio, no el framework:

```
src/
├── app/       composición y shell: rutas, layout, estilos globales, entrypoint
├── auth/      sesión, perfil, login y ruta protegida
├── tasks/     CRUD, vistas Hoy/Próximas/Vencidas/Completadas, filtros y CSV
├── chat/      conversación con el agente, historial, voz y confirmaciones
├── team/      cambio sorpresa: bandeja del supervisor, asignación y filtro por persona
├── profile/   perfil, zona horaria e instalación PWA
└── shared/    UI genérica, utilidades, cliente Supabase y enums compartidos
```

**Regla de dependencias:** `shared/` no importa de ninguna feature. `app/` es el
único lugar que importa pantallas. Las features pueden importar el `api.ts` y el
`types.ts` de otra feature (contrato de dominio explícito), nunca sus pantallas.
Los enums primitivos viven en `shared/types.ts` y se re-exportan desde
`tasks/types.ts` para mantener imports cómodos.

## Contrato que espera el frontend

### Tablas (RLS)

```text
profiles(id uuid PK, full_name text, role 'employee'|'supervisor',
         created_at timestamptz, updated_at timestamptz)

tasks(id uuid PK, user_id uuid -> auth.users, title text NOT NULL,
      description text, due_date timestamptz,
      priority 'low'|'medium'|'high', assignee_id uuid -> profiles,
      status 'pending'|'in_progress'|'done', tags text[] DEFAULT '{}',
      created_at timestamptz, updated_at timestamptz, completed_at timestamptz)

chat_messages(id uuid PK, user_id uuid -> auth.users,
              role 'user'|'assistant', content text,
              actions jsonb DEFAULT '[]', created_at timestamptz)
```

RLS: el empleado ve y modifica solo sus filas; el supervisor lee todas las tareas
y puede actualizar `assignee_id`. El frontend **no usa `service_role`**.

### Edge Function `task-agent` (verify_jwt = true)

Request:

```json
{
  "message": "cobrarle a Juan el viernes y cotización a Ana mañana, urgente",
  "context": { "timezone": "America/Santo_Domingo", "today": "2026-11-19" },
  "confirm": false,
  "selected_task_id": null
}
```

Response:

```json
{
  "reply": "Creé 2 tareas: Cobrar a Juan (viernes) y Cotización a Ana (mañana, urgente).",
  "actions": [
    { "type": "created", "task_id": "<uuid>", "title": "Cobrar a Juan" },
    { "type": "created", "task_id": "<uuid>", "title": "Cotización a Ana" }
  ],
  "clarification": { "question": "¿Cuál de las dos de Juan?", "options": [{ "id": "<uuid>", "title": "Cobrar a Juan" }] },
  "confirmation": { "message": "¿Eliminar la tarea de Juan?", "task_ids": ["<uuid>"] }
}
```

`clarification` y `confirmation` son opcionales. El modelo **no escribe** en la
base de datos: la Edge Function ejecuta y valida cada herramienta
(`crear_tarea`, `listar_tareas`, `actualizar_tarea`, `completar_tarea`) con el JWT
del usuario. La llave de IA vive en Secrets. El frontend guarda los mensajes en
`chat_messages` por sí mismo; la función no debe duplicarlos.

## Cobertura de requerimientos (frontend)

| RF | Estado |
|---|---|
| 01, 02 | ✅ Login/registro y rutas protegidas |
| 04 | ✅ Nombre y rol visibles en el encabezado |
| 05, 07, 08, 10 | ✅ Alta/edición/borrado con confirmación, cambio de estado a un toque, validación junto al campo |
| 06 | ✅ Cuatro vistas por fecha y estado |
| 09, 11 | ✅ Filtros combinables, búsqueda con debounce, etiquetas |
| 12–18 | ✅ Chat, varias tareas por mensaje, resumen con enlace a cada tarea, confirmación, errores con reintento y "crear a mano", zona horaria |
| 20, 21 | ✅ Historial persistido y dictado por voz (Web Speech API) |
| 22–25 | ✅ 360 px, manifest + iconos 192/512, service worker, estados de carga/vacío/error, caché de últimas tareas y aviso "sin conexión" |
| 26 | ⚠️ Notificaciones push: pendiente |
| 27–29 | ⚠️ Deploy, llave en backend y migraciones: pendiente (backend) |
| 30 | ⚠️ Pruebas automáticas: pendiente |
| Cambio sorpresa | ✅ Rol supervisor: bandeja global, asignación y filtro por persona |
| 28 (llave IA) | ✅ Nunca se envía al navegador; se invoca la Edge Function |

## Modo sin conexión

El service worker precachea el shell. Las últimas tareas se guardan en
`localStorage` (`tareas:tasks:<uid>`) tras cada carga y se muestran con un aviso
cuando `navigator.onLine` es falso. Las peticiones a Supabase nunca se cachean en
el service worker.

## Pendientes

- Edge Function `task-agent` con tool calling y validación con Zod.
- Aplicar las migraciones en un proyecto Supabase de desarrollo y verificar auth/RLS.
- Usuarios de prueba, deploy a URL pública, video de 3–5 min y revisiones.
- Pruebas automáticas de fechas relativas y herramientas del agente.
- Notificaciones push (deseable).
