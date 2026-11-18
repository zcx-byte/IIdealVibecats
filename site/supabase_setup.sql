-- ТРОПЫ РОССИИ: аккаунты, избранное и личный план походов
-- Выполните весь файл в Supabase → SQL Editor → New query → Run.
-- Таблица routes уже должна существовать.
-- Тип route_id будет автоматически скопирован из public.routes.id.

create extension if not exists pgcrypto;

do $$
declare
  route_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into route_id_type
  from pg_attribute a
  where a.attrelid = 'public.routes'::regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if route_id_type is null then
    raise exception 'Не найдена колонка public.routes.id. Проверьте имя основной таблицы маршрутов.';
  end if;

  execute format($sql$
    create table if not exists public.favorites (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      route_id %s not null references public.routes(id) on delete cascade,
      created_at timestamptz not null default now(),
      constraint favorites_user_route_unique unique (user_id, route_id)
    )
  $sql$, route_id_type);

  execute format($sql$
    create table if not exists public.trip_plan (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      route_id %s not null references public.routes(id) on delete cascade,
      planned_date date,
      status text not null default 'planned' check (status in ('planned', 'completed')),
      note text not null default '' check (char_length(note) <= 1500),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint trip_plan_user_route_unique unique (user_id, route_id)
    )
  $sql$, route_id_type);
end $$;

create index if not exists favorites_user_id_idx on public.favorites(user_id);
create index if not exists trip_plan_user_id_idx on public.trip_plan(user_id);
create index if not exists trip_plan_planned_date_idx on public.trip_plan(planned_date);

alter table public.favorites enable row level security;
alter table public.trip_plan enable row level security;

drop policy if exists "Users can view their own favorites" on public.favorites;
create policy "Users can view their own favorites"
  on public.favorites for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own favorites" on public.favorites;
create policy "Users can add their own favorites"
  on public.favorites for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own favorites" on public.favorites;
create policy "Users can remove their own favorites"
  on public.favorites for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own trip plan" on public.trip_plan;
create policy "Users can view their own trip plan"
  on public.trip_plan for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add to their own trip plan" on public.trip_plan;
create policy "Users can add to their own trip plan"
  on public.trip_plan for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own trip plan" on public.trip_plan;
create policy "Users can update their own trip plan"
  on public.trip_plan for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove from their own trip plan" on public.trip_plan;
create policy "Users can remove from their own trip plan"
  on public.trip_plan for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.trip_plan to authenticated;

create or replace function public.set_trip_plan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trip_plan_updated_at on public.trip_plan;
create trigger trip_plan_updated_at
before update on public.trip_plan
for each row execute function public.set_trip_plan_updated_at();

-- Важно: включите подтверждение email в Supabase Auth → Providers → Email,
-- если хотите, чтобы пользователь подтверждал адрес перед первым входом.
