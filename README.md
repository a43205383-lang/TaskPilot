# TaskPilot — Asistente de tareas con IA (PWA)

PWA móvil donde la persona escribe en lenguaje natural lo que tiene pendiente y un
agente con *tool calling* crea y gestiona tareas en Supabase.

> **Estado actual:** frontend publicado en Vercel, Edge Function `task-agent` desplegada
> en Supabase y migraciones aplicadas al proyecto. El usuario confirmó las pruebas
> manuales de autenticación, aislamiento RLS, gestión de tareas y fechas relativas.
> El checklist RF completo está al final de este documento.

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

### Edge Function `task-agent`

Request:

```json
{
  "message": "cobrarle a Juan el viernes y cotización a Ana mañana, urgente",
  "context": { "timezone": "America/Santo_Domingo", "today": "2026-11-20" }
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
  "clarification": {
    "question": "Encontré varias tareas que coinciden. ¿Cuál quieres cambiar?",
    "action": "complete_task",
    "options": [{ "id": "<uuid>", "title": "Cobrar a Juan" }]
  }
}
```

`clarification` y `confirmation` son opcionales. Una petición de borrado devuelve
`confirmation` con `task_ids`; la función borra solo cuando el usuario confirma.
La respuesta final incluye `actions` con cada tarea creada, actualizada, completada
o eliminada. El modelo **no escribe** en la base de datos: la Edge Function ejecuta
y valida `create_task`, `list_tasks`, `update_task`, `complete_task` y `delete_task`
con el JWT del usuario. La llave Gemini vive en Supabase Secrets. El frontend guarda
los mensajes en `chat_messages`; la función no los duplica.

## Cobertura de requerimientos

| RF | Estado y alcance |
|---|---|
| 01–03 | ✅ Registro/inicio de sesión, rutas protegidas y aislamiento RLS. El usuario verificó también acceso directo a la API entre dos usuarios. |
| 04–11 | ✅ Roles, CRUD manual de tareas, persistencia, estados, prioridades, vistas, búsqueda, filtros, etiquetas y validación de campos. |
| 12–18 | ✅ Chat en lenguaje natural, herramientas server-side, historial, selección ante tareas ambiguas, confirmación antes de borrar, resumen de acciones y enlaces a tareas. |
| 19 | ✅ Fechas relativas usan la zona configurada. El usuario comprobó «mañana» y «el viernes» en `America/Santo_Domingo`. |
| 20–21 | ✅ Historial del chat y dictado por voz mediante Web Speech API, con permiso del navegador. |
| 22 | ✅ Layout revisado para 360 px, botones táctiles ampliados y contenido adaptable sin scroll horizontal de página. |
| 23 | ✅ Manifest, iconos 192×192 y 512×512, service worker y modo `standalone`. |
| 24 | ✅ Shell y archivos estáticos precargados; perfil y tareas recientes se conservan localmente y se muestra el aviso sin conexión. |
| 25 | ✅ Estados de carga, vacío y error; errores de consulta y de acciones tienen mensajes visibles. |
| 26 (deseable) | 🟡 Notificación local una hora antes, si se concede permiso y la app permanece abierta/activa. No es Web Push y no garantiza avisos con la app cerrada. |
| 27 | ✅ El agente ejecuta herramientas de tareas desde la Edge Function bajo el JWT del usuario. |
| 28 | ✅ La clave Gemini está en Supabase Secrets; no se incluye en el bundle ni en las peticiones del navegador. |
| 29 | ✅ Esquema versionado en `supabase/migrations/`; los tres scripts recrean tablas, enums, funciones, triggers e RLS en Supabase nuevo. |
| Cambio sorpresa | ✅ Supervisor: bandeja global de tareas, asignación y filtro por persona. |

Las pruebas automatizadas no están configuradas; las verificaciones indicadas arriba
son revisiones de código y pruebas manuales reportadas por el usuario.

## Modo sin conexión

El service worker precachea el shell y los recursos compilados. Las últimas tareas
y el perfil se guardan por usuario en `localStorage`; al perder conexión se muestran
las tareas guardadas y el aviso «Sin conexión». Las peticiones a Supabase nunca se
cachean en el service worker. Cerrar sesión borra las cachés locales de TaskPilot.

## Antes de publicar cambios locales

- Desplegar en Vercel los cambios recientes de frontend y service worker.
- Si cambia `supabase/functions/task-agent/index.ts`, actualizar y desplegar la función en Supabase.
- Para notificaciones con la app cerrada, implementar Web Push con suscripciones y envío server-side; RF26 actual es local y requiere la app activa.
