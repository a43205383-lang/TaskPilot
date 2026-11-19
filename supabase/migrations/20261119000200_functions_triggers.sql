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
