-- Запустіть цей скрипт у Supabase: SQL Editor → New query → Run.
-- Таблиця окрема від попередньої `tasks`, тому дані не перетинатимуться.

create table if not exists public.work_tasks (
  id text primary key,
  value text not null,
  done boolean not null default false,
  priority text,
  category text,
  created_at timestamptz not null default now(),
  reminder_at timestamptz,
  recurrence text,
  last_completed_at timestamptz,
  deleted_at timestamptz
);

alter table public.work_tasks enable row level security;

drop policy if exists "Authenticated users can read work tasks" on public.work_tasks;
drop policy if exists "Authenticated users can add work tasks" on public.work_tasks;
drop policy if exists "Authenticated users can update work tasks" on public.work_tasks;
drop policy if exists "Authenticated users can delete work tasks" on public.work_tasks;

create policy "Authenticated users can read work tasks"
on public.work_tasks for select to authenticated using (true);

create policy "Authenticated users can add work tasks"
on public.work_tasks for insert to authenticated with check (true);

create policy "Authenticated users can update work tasks"
on public.work_tasks for update to authenticated using (true) with check (true);

create policy "Authenticated users can delete work tasks"
on public.work_tasks for delete to authenticated using (true);
