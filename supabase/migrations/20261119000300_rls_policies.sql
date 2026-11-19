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
