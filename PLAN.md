# TaskPilot — plan técnico

TaskPilot es una PWA móvil para organizar tareas con lenguaje natural. React autentica
con Supabase Auth; los perfiles, las tareas y el historial viven en Postgres protegidos
por RLS. La Edge Function `task-agent` interpreta mensajes y ejecuta herramientas con
el JWT de la persona.

## Ya presente en el repo

- Registro, inicio y cierre de sesión; listener de sesión y rutas protegidas.
- CRUD de tareas, estados, prioridades, fechas, etiquetas, filtros y vistas por fecha.
- Historial conversacional y cliente del contrato `task-agent`.
- Perfil con zona horaria y soporte PWA/offline.
- Bandeja y asignación de tareas para el rol supervisor.
- Migraciones de perfiles, tareas, chat, trigger de perfil y políticas RLS.

## Pendiente de integración / entrega

- Implementar y desplegar `task-agent` con validación de entradas y tool calling.
- Aplicar las migraciones a un proyecto Supabase nuevo y verificar login, perfiles y RLS.
- Configurar usuarios demo, desplegar la PWA y completar pruebas funcionales.
- Notificaciones push y pruebas automáticas siguen siendo deseables o pendientes.

No se debe configurar Storage, extracción de recibos, Gemini ni roles de contador: no
forman parte de TaskPilot.
