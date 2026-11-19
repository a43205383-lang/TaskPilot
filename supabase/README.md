# Base de datos — Escáner de recibos con IA

Migraciones versionadas para Supabase (Postgres + Auth + Storage). Recrean desde
cero tablas, enums, triggers, RLS y el bucket privado de imágenes (RF-34).

## Archivos

Ejecutar **en este orden**:

| # | Archivo | Contenido |
|---|---------|-----------|
| 1 | `migrations/20261119000100_core_schema.sql` | Enums, tablas, índices y vista `expenses_with_receipt` |
| 2 | `migrations/20261119000200_functions_triggers.sql` | Perfil automático, reglas de rol, aprobación y cuota de IA |
| 3 | `migrations/20261119000300_rls_policies.sql` | RLS y permisos de tablas |
| 4 | `migrations/20261119000400_storage.sql` | Bucket `receipts` y políticas de Storage |

## Cómo aplicarlas

### Opción A — Dashboard (la más rápida)

1. Entra al proyecto en <https://supabase.com/dashboard>.
2. **SQL Editor → New query**.
3. Pega el contenido del archivo 1 y pulsa **Run**. Repite con los archivos 2, 3 y 4.

Cada archivo abre y cierra una transacción: si algo falla, no queda a medias.

### Opción B — Supabase CLI

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### Después de aplicar

1. **Authentication → Providers → Email**: para probar rápido, desactiva
   *Confirm email* (o confirma manualmente los dos usuarios de prueba).
2. Crea el usuario contador y asígnale el rol:

```sql
update public.profiles
set role = 'accountant'
where id = (select id from auth.users where email = 'contador@ejemplo.com');
```

## Modelo

```text
auth.users 1──1 profiles
profiles 1──N expenses
expenses 1──N expense_items
expenses 1──N expense_images  (varias fotos por gasto, RF-09)
profiles 1──N ai_usage        (cuota diaria de IA, RF-35)
```

### `expenses` — decisiones clave

- **Campos nullable**: un recibo ilegible puede quedar en `requires_review` sin
  datos. La restricción `expenses_confirmed_complete` impide confirmar un gasto
  sin comercio, fecha y total.
- **`status`** (`draft` | `confirmed` | `requires_review`): solo `confirmed`
  suma en reportes (RF-19).
- **`approval_status`** (`pending` | `approved` | `rejected`) + `approved_by`,
  `approved_at`, `review_comment`: cubre el cambio sorpresa del contador.
- **`field_confidence`** (jsonb): mapa `campo -> 0..1` para resaltar dudosos.
- **`receipt_hash`** (SHA-256) y `duplicate_of`: apoyo para RF-20. La app avisa,
  no bloquea.
- **`currency` + `exchange_rate` + `total_dop`**: deja la puerta abierta a USD
  sin rehacer reportes; los totales se suman sobre `total_dop`.
- **`itbis`** en vez de un genérico `tax`: el brief pide ITBIS 18 % (RD).

### Líneas de detalle

`expense_items` guarda descripción, cantidad, precio unitario y total de línea.
Se borran en cascada con el gasto.

## Seguridad

### Matriz de acceso

| Recurso | Empleado | Contador | Cliente anónimo |
|---|---|---|---|
| `profiles` | lee todos, edita el suyo (no el rol) | lee todos | nada |
| `expenses` | CRUD solo propios | lee todos, actualiza aprobación | nada |
| `expense_items` | CRUD solo de sus gastos | lee todos | nada |
| `expense_images` | CRUD solo de sus gastos | lee todos | nada |
| `ai_usage` | lee solo el suyo | lee solo el suyo | nada |
| Storage `receipts` | CRUD en `{uid}/...` | lee todo | nada |

Refuerzos que no dependen solo de RLS:

- `guard_profile_role`: un empleado no puede hacerse `accountant` con un
  `update` directo a la API.
- `guard_expense_write`: un empleado no puede tocar `approval_status`,
  `approved_by`, `approved_at` ni `review_comment`, ni cambiar `user_id`.
- `consume_ai_quota()`: incremento atómico y límite diario de 30 análisis por
  usuario; sin `INSERT/UPDATE` directo sobre `ai_usage` desde el cliente.

### Storage

- Bucket **privado**, máximo **1.5 MB** y MIME types de imagen/PDF.
- Ruta obligatoria: `receipts/{auth.uid()}/{expense_id}/{uuid}.jpg`.
  Las políticas comparan la primera carpeta con `auth.uid()`.
- Mostrar imágenes con `createSignedUrl(path, 60)`. El contador puede firmar
  URLs de recibos ajenos por su política de `select`.
- Al borrar un gasto (RF-21), borrar primero los objetos de Storage y luego la
  fila; el `delete` en cascada no elimina archivos del bucket.

## Verificación rápida (aislamiento)

Con la `anon key` y el JWT de cada usuario:

```bash
# Usuario A: solo debe ver sus filas
curl "https://<ref>.supabase.co/rest/v1/expenses?select=id,merchant,total" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <jwt-A>"

# Usuario A intentando leer un gasto de B por id: debe devolver []
curl "https://<ref>.supabase.co/rest/v1/expenses?id=eq.<id-de-B>" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <jwt-A>"

# Usuario A intentando aprobar su propio gasto: debe fallar (42501)
curl -X PATCH "https://<ref>.supabase.co/rest/v1/expenses?id=eq.<id-propio>" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <jwt-A>" \
  -H "Content-Type: application/json" \
  -d '{"approval_status":"approved"}'
```

En el SQL Editor las políticas no aplican (se ejecuta como `postgres`), así que
las pruebas de aislamiento deben hacerse por la API o con `set local role`.

## Pendientes / notas para el README principal

- El límite de 30 análisis/día es una constante en `consume_ai_quota`; ajústalo
  si el evaluador necesita más pruebas.
- `exchange_rate` editable: si se implementa USD, guardar la tasa usada en el
  momento del gasto (ya está en la columna).
- No se guardan auditorías de cambios (historial de aprobación); el estado
  actual sí queda registrado en `expenses`.
- Los usuarios de prueba se crean desde el Dashboard, no por SQL, para que
  Auth genere correctamente las credenciales.
