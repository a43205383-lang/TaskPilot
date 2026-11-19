-- =============================================================================
-- setup.sql  (ARCHIVO GENERADO)
-- Une las 4 migraciones de supabase/migrations en orden.
-- Fuente de verdad: los archivos individuales en supabase/migrations/.
-- Pegar completo en Supabase Dashboard > SQL Editor > Run.
-- =============================================================================
-- =============================================================================
-- 20261119000100_core_schema.sql
-- Escáner de recibos con IA — esquema base
--
-- Tablas:
--   profiles        perfil + rol (employee | accountant) ligado a auth.users
--   expenses        cabecera del gasto (datos extraídos por la IA y editables)
--   expense_items   líneas de detalle del recibo (RF-17)
--   expense_images  fotos/PDF del recibo en Storage (RF-09)
--   ai_usage        contador diario de llamadas a IA (RF-35)
-- =============================================================================

begin;

create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.app_role as enum ('employee', 'accountant');

create type public.expense_status as enum ('draft', 'confirmed', 'requires_review');

create type public.expense_category as enum (
  'alimentos',
  'combustible',
  'transporte',
  'oficina',
  'servicios',
  'otros'
);

create type public.approval_status as enum ('pending', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.app_role not null default 'employee',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de la aplicación. Se crea automáticamente al registrarse (trigger handle_new_user).';
comment on column public.profiles.role is
  'employee: solo ve sus gastos. accountant: ve todos y puede aprobar/rechazar.';

-- Perfiles para usuarios que ya existieran antes de esta migración.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,

  -- Datos del recibo (nullable a propósito: "requiere revisión" puede llegar vacío)
  merchant          text,
  expense_date      date,
  currency          text not null default 'DOP' check (currency in ('DOP', 'USD')),
  exchange_rate     numeric(12, 6) not null default 1 check (exchange_rate > 0),
  subtotal          numeric(12, 2),
  itbis             numeric(12, 2),
  tip               numeric(12, 2),
  total             numeric(12, 2),
  total_dop         numeric(12, 2) generated always as (round(total * exchange_rate, 2)) stored,
  payment_method    text,
  rnc               text,
  ncf               text,
  category          public.expense_category not null default 'otros',

  -- Flujo del gasto
  status            public.expense_status not null default 'draft',
  needs_review      boolean not null default false,
  review_reasons    text[] not null default '{}',

  -- Aprobación contable (cambio sorpresa)
  approval_status   public.approval_status not null default 'pending',
  approved_by       uuid references public.profiles (id),
  approved_at       timestamptz,
  review_comment    text,

  -- Metadatos de la extracción con IA
  field_confidence  jsonb not null default '{}'::jsonb,
  ai_model          text,
  ai_raw            jsonb,

  -- Duplicados
  receipt_hash      text,
  duplicate_of      uuid references public.expenses (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint expenses_amounts_non_negative check (
    coalesce(subtotal, 0) >= 0
    and coalesce(itbis, 0) >= 0
    and coalesce(tip, 0) >= 0
    and coalesce(total, 0) >= 0
  ),
  -- Un gasto confirmado debe tener lo mínimo para sumar en reportes.
  constraint expenses_confirmed_complete check (
    status <> 'confirmed'
    or (merchant is not null and btrim(merchant) <> '' and expense_date is not null and total is not null)
  )
);

comment on table public.expenses is
  'Gasto/recibo. Solo status = confirmed cuenta para los totales; approval_status refleja la decisión del contador.';
comment on column public.expenses.total_dop is
  'Total convertido a DOP con exchange_rate. Usar esta columna para sumar reportes multi-moneda.';
comment on column public.expenses.field_confidence is
  'Mapa campo -> confianza 0..1 devuelto por la IA, para resaltar campos dudosos (RF-14).';
comment on column public.expenses.receipt_hash is
  'SHA-256 de la imagen original para detectar re-subidas del mismo archivo (RF-20).';

-- Índices
create index expenses_user_date_idx     on public.expenses (user_id, expense_date desc nulls last);
create index expenses_status_idx        on public.expenses (status);
create index expenses_approval_idx      on public.expenses (approval_status, expense_date desc nulls last);
create index expenses_category_idx      on public.expenses (category);
create index expenses_duplicate_idx     on public.expenses (user_id, merchant, expense_date, total);
create index expenses_receipt_hash_idx  on public.expenses (user_id, receipt_hash);
create index expenses_merchant_trgm_idx on public.expenses using gin (merchant gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- expense_items (RF-17)
-- ----------------------------------------------------------------------------
create table public.expense_items (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  position    integer not null default 0,
  description text not null,
  quantity    numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price  numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total  numeric(12, 2),
  created_at  timestamptz not null default now()
);

create index expense_items_expense_idx on public.expense_items (expense_id, position);

comment on table public.expense_items is
  'Líneas de detalle (descripción, cantidad, precio). Se borran en cascada con el gasto.';

-- ----------------------------------------------------------------------------
-- expense_images (RF-09)
-- ----------------------------------------------------------------------------
create table public.expense_images (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes <= 1572864),
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create unique index expense_images_path_key    on public.expense_images (storage_path);
create index        expense_images_expense_idx on public.expense_images (expense_id, position);

comment on table public.expense_images is
  'Imágenes del recibo. storage_path sigue la convención {user_id}/{expense_id}/{archivo}.';
comment on column public.expense_images.size_bytes is
  'Tope de 1.5 MB aplicado también en el bucket (RF-07).';

-- ----------------------------------------------------------------------------
-- ai_usage (RF-35)
-- ----------------------------------------------------------------------------
create table public.ai_usage (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  usage_date date not null default current_date,
  calls      integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

comment on table public.ai_usage is
  'Llamadas a IA por usuario y día. La función consume_ai_quota() la incrementa atómicamente.';

-- ----------------------------------------------------------------------------
-- Vista de conveniencia: gasto + ruta de la imagen principal
-- security_invoker = true => respeta las políticas RLS del usuario que consulta.
-- ----------------------------------------------------------------------------
create view public.expenses_with_receipt
with (security_invoker = true) as
select
  e.*,
  (
    select i.storage_path
    from public.expense_images i
    where i.expense_id = e.id
    order by i.position asc, i.created_at asc
    limit 1
  ) as receipt_path
from public.expenses e;

comment on view public.expenses_with_receipt is
  'Gastos con la ruta de su primera imagen. Consultar desde el cliente para listados con miniatura.';

commit;


-- =============================================================================
-- 20261119000200_functions_triggers.sql
-- Funciones auxiliares, triggers de integridad y reglas de rol.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Perfil automático al registrarse (RF-01)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Helpers de rol
-- ----------------------------------------------------------------------------
create or replace function public.is_accountant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'accountant'
  );
$$;

comment on function public.is_accountant() is
  'true si el usuario del JWT actual tiene rol accountant. SECURITY DEFINER para evitar recursión en RLS de profiles.';

create or replace function public.owns_expense(p_expense_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.expenses e
    where e.id = p_expense_id
      and e.user_id = (select auth.uid())
  );
$$;

comment on function public.owns_expense(uuid) is
  'true si el gasto pertenece al usuario del JWT actual. Usada por las políticas de ítems e imágenes.';

grant execute on function public.is_accountant() to authenticated;
grant execute on function public.owns_expense(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Un usuario no puede ascenderse a contador por la API (RF-02 / RF-04)
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.role() = null ocurre en el SQL Editor / migraciones: se permite.
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and auth.role() is not null
     and not public.is_accountant() then
    raise exception 'Solo un contador puede cambiar el rol de un perfil'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ----------------------------------------------------------------------------
-- Reglas de escritura de gastos
--   * Empleado: solo sus filas y no puede tocar los campos de aprobación.
--   * Contador: puede aprobar/rechazar con comentario, pero no cambiar el dueño.
--   * service_role / SQL Editor: sin restricciones.
-- ----------------------------------------------------------------------------
create or replace function public.guard_expense_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_privileged boolean :=
    coalesce(auth.role(), '') = 'service_role' or auth.role() is null;
  v_accountant boolean := public.is_accountant();
begin
  if tg_op = 'INSERT' then
    if not v_privileged then
      if new.user_id is distinct from auth.uid() then
        raise exception 'No puedes crear un gasto a nombre de otro usuario'
          using errcode = '42501';
      end if;
      -- Nadie se autoaprueba al crear.
      new.approval_status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
      new.review_comment := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.user_id is distinct from old.user_id and not v_privileged then
    raise exception 'No se puede cambiar el dueño de un gasto'
      using errcode = '42501';
  end if;

  if not v_privileged then
    if not v_accountant then
      if new.approval_status is distinct from old.approval_status
         or new.approved_by is distinct from old.approved_by
         or new.approved_at is distinct from old.approved_at
         or new.review_comment is distinct from old.review_comment then
        raise exception 'Solo un contador puede aprobar o rechazar gastos'
          using errcode = '42501';
      end if;
    elsif new.approval_status is distinct from old.approval_status then
      if new.approval_status in ('approved', 'rejected') then
        new.approved_by := auth.uid();
        new.approved_at := now();
      else
        new.approved_by := null;
        new.approved_at := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger expenses_guard_write
  before insert or update on public.expenses
  for each row execute function public.guard_expense_write();

-- ----------------------------------------------------------------------------
-- Cuota diaria de IA (RF-35)
-- Incrementa el contador del usuario autenticado y falla si supera el límite.
-- ----------------------------------------------------------------------------
create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c_daily_limit constant integer := 30;
  v_uid   uuid := (select auth.uid());
  v_calls integer;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  insert into public.ai_usage (user_id, usage_date, calls)
  values (v_uid, current_date, 1)
  on conflict (user_id, usage_date) do update
    set calls = public.ai_usage.calls + 1
  returning calls into v_calls;

  if v_calls > c_daily_limit then
    raise exception 'Límite diario de análisis de IA alcanzado (% llamadas)', c_daily_limit
      using errcode = 'P0001';
  end if;

  return v_calls;
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated, service_role;

commit;


-- =============================================================================
-- 20261119000300_rls_policies.sql
-- Row Level Security: aislamiento por usuario + acceso de lectura global
-- para el rol contador (RF-02, RF-04).
--
-- Regla general:
--   employee   -> solo sus propios gastos / ítems / imágenes.
--   accountant -> lee todo y actualiza la aprobación; no borra gastos ajenos.
-- =============================================================================

begin;

alter table public.profiles       enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_items  enable row level security;
alter table public.expense_images enable row level security;
alter table public.ai_usage       enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sin políticas de INSERT/DELETE: los perfiles los crea el trigger de auth.users
-- y solo se eliminan en cascada al borrar el usuario.

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
create policy expenses_select_own_or_accountant
  on public.expenses for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_accountant()
  );

create policy expenses_insert_own
  on public.expenses for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy expenses_update_own_or_accountant
  on public.expenses for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_accountant()
  )
  with check (
    user_id = (select auth.uid())
    or public.is_accountant()
  );

create policy expenses_delete_own
  on public.expenses for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- expense_items
-- ----------------------------------------------------------------------------
create policy expense_items_select
  on public.expense_items for select
  to authenticated
  using (
    public.owns_expense(expense_id)
    or public.is_accountant()
  );

create policy expense_items_insert
  on public.expense_items for insert
  to authenticated
  with check (public.owns_expense(expense_id));

create policy expense_items_update
  on public.expense_items for update
  to authenticated
  using (public.owns_expense(expense_id))
  with check (public.owns_expense(expense_id));

create policy expense_items_delete
  on public.expense_items for delete
  to authenticated
  using (public.owns_expense(expense_id));

-- ----------------------------------------------------------------------------
-- expense_images
-- ----------------------------------------------------------------------------
create policy expense_images_select
  on public.expense_images for select
  to authenticated
  using (
    public.owns_expense(expense_id)
    or public.is_accountant()
  );

create policy expense_images_insert
  on public.expense_images for insert
  to authenticated
  with check (public.owns_expense(expense_id));

create policy expense_images_update
  on public.expense_images for update
  to authenticated
  using (public.owns_expense(expense_id))
  with check (public.owns_expense(expense_id));

create policy expense_images_delete
  on public.expense_images for delete
  to authenticated
  using (public.owns_expense(expense_id));

-- ----------------------------------------------------------------------------
-- ai_usage
-- ----------------------------------------------------------------------------
create policy ai_usage_select_own
  on public.ai_usage for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Sin INSERT/UPDATE para el cliente: solo consume_ai_quota() (SECURITY DEFINER)
-- o service_role escriben en esta tabla.

-- ----------------------------------------------------------------------------
-- Privilegios (RLS filtra filas; los GRANT limitan operaciones)
-- ----------------------------------------------------------------------------
revoke all on public.profiles, public.expenses, public.expense_items,
              public.expense_images, public.ai_usage
  from anon;

grant select, update
  on public.profiles to authenticated;

grant select, insert, update, delete
  on public.expenses to authenticated;

grant select, insert, update, delete
  on public.expense_items to authenticated;

grant select, insert, update, delete
  on public.expense_images to authenticated;

grant select
  on public.ai_usage to authenticated;

revoke all on public.expenses_with_receipt from anon;
grant select on public.expenses_with_receipt to authenticated;

commit;


-- =============================================================================
-- 20261119000400_storage.sql
-- Bucket privado de recibos + políticas de Storage (RF-03, RF-07, RF-09).
--
-- Convención de rutas:
--   receipts/{auth.uid()}/{expense_id}/{uuid}.{jpg|png|webp|pdf}
--
-- El bucket es privado: la app debe pedir signed URLs para mostrar imágenes.
-- =============================================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  1572864, -- 1.5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Subida: solo dentro de la carpeta del propio usuario.
-- ----------------------------------------------------------------------------
create policy receipts_insert_own_folder
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- Lectura: el dueño o un contador (necesita ver recibos para aprobarlos).
-- ----------------------------------------------------------------------------
create policy receipts_select_own_or_accountant
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_accountant()
    )
  );

-- ----------------------------------------------------------------------------
-- Actualización / borrado: solo el dueño.
-- ----------------------------------------------------------------------------
create policy receipts_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy receipts_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
