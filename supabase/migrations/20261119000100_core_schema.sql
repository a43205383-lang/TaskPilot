-- TaskPilot: perfiles, tareas y conversaciones.
begin;

create type public.app_role as enum ('employee', 'supervisor');
create type public.task_status as enum ('pending', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');
create type public.chat_message_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  due_date timestamptz,
  priority public.task_priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'pending',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_user_due_date_idx on public.tasks (user_id, due_date asc nulls last);
create index tasks_assignee_due_date_idx on public.tasks (assignee_id, due_date asc nulls last);
create index tasks_status_idx on public.tasks (status);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.chat_message_role not null,
  content text not null check (btrim(content) <> ''),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  created_at timestamptz not null default now()
);
create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at asc);

commit;
