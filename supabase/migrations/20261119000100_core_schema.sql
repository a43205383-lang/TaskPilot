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
