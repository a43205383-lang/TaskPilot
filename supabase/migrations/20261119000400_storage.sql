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
