begin;

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.chat_messages enable row level security;

create policy profiles_read_authenticated on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy tasks_read_owner_or_supervisor on public.tasks
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_supervisor()));
create policy tasks_insert_owner on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tasks_update_owner_or_supervisor on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_supervisor()))
  with check (user_id = (select auth.uid()) or (select public.is_supervisor()));
create policy tasks_delete_owner on public.tasks
  for delete to authenticated using (user_id = (select auth.uid()));

create policy chat_messages_read_owner on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy chat_messages_insert_owner on public.chat_messages
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.profiles, public.tasks, public.chat_messages from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.chat_messages to authenticated;

commit;
