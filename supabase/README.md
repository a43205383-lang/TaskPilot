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

## Edge Function `task-agent`

El frontend invoca `task-agent` con el JWT de la sesión. La implementación está en
`functions/task-agent/index.ts`, valida el token contra `/auth/v1/user` y realiza las
consultas con el JWT del usuario, así que las políticas RLS siguen aplicándose. Gemini
se llama solo desde la función.

Para desplegar desde el Dashboard:

1. En **Edge Functions**, crea `task-agent` y pega el contenido de
   `functions/task-agent/index.ts` en el editor.
2. Desactiva la verificación JWT del gateway para esta función, para que el preflight
   `OPTIONS` llegue al handler. El handler valida cada `POST` consultando
   `/auth/v1/user` con el JWT antes de ejecutar herramientas y rechaza sesiones inválidas.
3. En **Edge Function Secrets**, añade `GEMINI_API_KEY` con tu clave de Google AI Studio.
   El modelo predeterminado es `gemini-3.5-flash-lite`. `GEMINI_MODEL` es opcional; si
   existe en los Secrets, su valor reemplaza el predeterminado. Para conservar el modelo
   recomendado, elimina ese Secret o configúralo como `gemini-3.5-flash-lite`.
4. Guarda y despliega la función. No pegues la llave en el código ni en Vercel.

El runtime de Supabase inyecta `SUPABASE_URL` y la clave publishable/anon para inicializar
el cliente delegado al JWT de la persona. La función no usa `service_role`.

> Los archivos conservan los identificadores de migración del borrador anterior, pero
> ahora definen el esquema de TaskPilot. Si ya aplicaste una versión anterior, no vuelvas
> a aplicar estos archivos sobre esa base: crea un proyecto de desarrollo nuevo o prepara
> una migración de transición revisada antes de tocar una base con datos.
