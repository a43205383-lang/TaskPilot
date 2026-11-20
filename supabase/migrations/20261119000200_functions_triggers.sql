begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
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

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_supervisor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'supervisor'
  );
$$;
revoke all on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated;

-- Prevent employees from changing their own role through the Data API.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not (select public.is_supervisor()) then
    raise exception 'Only a supervisor may change a profile role' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();
revoke all on function public.guard_profile_role() from public, anon, authenticated;

-- Supervisors may assign another user's task, but cannot edit or transfer it.
create or replace function public.guard_task_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Task ownership cannot be changed' using errcode = '42501';
  end if;

  if old.user_id <> (select auth.uid())
     and (select public.is_supervisor())
     and (
       new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority
       or new.status is distinct from old.status
       or new.tags is distinct from old.tags
       or new.completed_at is distinct from old.completed_at
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Supervisors may only assign another user task' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_guard_update before update on public.tasks
  for each row execute function public.guard_task_update();
revoke all on function public.guard_task_update() from public, anon, authenticated;

commit;
