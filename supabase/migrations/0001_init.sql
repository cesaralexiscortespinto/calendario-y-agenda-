-- Calendario personal: entrenamientos, partidos y viajes, con marca de asistencia.
-- Un solo usuario (auth.uid()) posee todas sus filas.

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('entrenamiento', 'partido', 'viaje')),
  title text not null,
  category text,
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  location text,
  attending boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index events_user_idx on events(user_id);
create index events_date_idx on events(date);

alter table events enable row level security;

create policy "user can view own events"
  on events for select
  using (user_id = auth.uid());

create policy "user can insert own events"
  on events for insert
  with check (user_id = auth.uid());

create policy "user can update own events"
  on events for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user can delete own events"
  on events for delete
  using (user_id = auth.uid());
