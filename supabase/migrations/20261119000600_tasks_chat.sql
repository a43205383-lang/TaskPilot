-- TaskPilot tables. This project already contains expense tables; these additions
-- are isolated and leave the existing expense data and policies intact.

do $$ begin
  create type public.task_status as enum ('pending', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.chat_message_role as enum ('user', 'assistant');
exception when duplicate_object then null;
end $$;

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (btrim(title) <> ''),
  description  text,
  due_date     timestamptz,
  priority     public.task_priority not null default 'medium',
  assignee_id  uuid references public.profiles (id) on delete set null,
  status       public.task_status not null default 'pending',
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_user_due_date_idx
  on public.tasks (user_id, due_date asc nulls last);
create index if not exists tasks_assignee_due_date_idx
  on public.tasks (assignee_id, due_date asc nulls last);
create index if not exists tasks_status_idx
  on public.tasks (status);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.chat_message_role not null,
  content    text not null check (btrim(content) <> ''),
  actions    jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at asc);

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text = 'supervisor'
  );
$$;

revoke all on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated;

-- A supervisor can update the assignee of another user's task, but cannot
-- silently edit the task itself or transfer ownership through the table API.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Task ownership cannot be changed'
      using errcode = '42501';
  end if;

  if old.user_id <> (select auth.uid())
     and (select public.is_supervisor())
     and (
       new.user_id is distinct from old.user_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority
       or new.status is distinct from old.status
       or new.tags is distinct from old.tags
       or new.completed_at is distinct from old.completed_at
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Supervisors may only assign another user''s task'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_task_update() from public, anon, authenticated;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_guard_update on public.tasks;
create trigger tasks_guard_update
  before update on public.tasks
  for each row execute function public.guard_task_update();

alter table public.tasks enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists tasks_select_owner_or_supervisor on public.tasks;
create policy tasks_select_owner_or_supervisor
  on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_supervisor()));

drop policy if exists tasks_insert_owner on public.tasks;
create policy tasks_insert_owner
  on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists tasks_update_owner_or_supervisor on public.tasks;
create policy tasks_update_owner_or_supervisor
  on public.tasks for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_supervisor()))
  with check (user_id = (select auth.uid()) or (select public.is_supervisor()));

drop policy if exists tasks_delete_owner on public.tasks;
create policy tasks_delete_owner
  on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chat_messages_select_owner on public.chat_messages;
create policy chat_messages_select_owner
  on public.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chat_messages_insert_owner on public.chat_messages;
create policy chat_messages_insert_owner
  on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.tasks, public.chat_messages from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.chat_messages to authenticated;

-- The frontend reads profile rows for its assignee picker and the signed-in user.
grant select, update on public.profiles to authenticated;
