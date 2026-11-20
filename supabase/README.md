# Supabase — TaskPilot

Este directorio contiene el esquema de TaskPilot: perfiles, tareas, historial del chat,
trigger de perfil, rol supervisor y políticas RLS. No se configura Storage para esta app.

## Migraciones

Aplica en orden los archivos `migrations/20261119000100_core_schema.sql`,
`migrations/20261119000200_functions_triggers.sql` y
`migrations/20261119000300_rls_policies.sql` en un proyecto Supabase nuevo.

El registro de auth crea un perfil con rol `employee`. Cambia a `supervisor` desde el
SQL Editor para preparar la cuenta de supervisión:

```sql
update public.profiles
set role = 'supervisor'
where id = (select id from auth.users where email = 'supervisor@ejemplo.com');
```

La aplicación usa exclusivamente la anon/publishable key en el navegador. Las políticas
RLS limitan tareas y conversaciones al usuario; el supervisor puede consultar todas las
tareas y asignarlas. La llave de IA debe vivir como Secret de la Edge Function
`task-agent`, nunca en variables `VITE_*`.

## Edge Function pendiente

El frontend invoca `task-agent` con JWT (`verify_jwt = true`). El contrato de solicitud,
respuesta, herramientas y validaciones está documentado en el README principal. La
implementación de la función y su llave de proveedor de IA siguen pendientes.

> Los archivos conservan los identificadores de migración del borrador anterior, pero
> ahora definen el esquema de TaskPilot. Si ya aplicaste una versión anterior, no vuelvas
> a aplicar estos archivos sobre esa base: crea un proyecto de desarrollo nuevo o prepara
> una migración de transición revisada antes de tocar una base con datos.
