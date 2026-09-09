-- Informes: reportes de texto libre (evaluaciones, seguimientos, resúmenes de partido, etc.)
-- Mismo esquema de propiedad que events/itinerary_items: una fila por usuario dueño.

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text,
  date date not null default current_date,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_user_idx on reports(user_id);
create index if not exists reports_date_idx on reports(date);

alter table reports enable row level security;

drop policy if exists "user can view own reports" on reports;
create policy "user can view own reports"
  on reports for select
  using (user_id = auth.uid());

drop policy if exists "user can insert own reports" on reports;
create policy "user can insert own reports"
  on reports for insert
  with check (user_id = auth.uid());

drop policy if exists "user can update own reports" on reports;
create policy "user can update own reports"
  on reports for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user can delete own reports" on reports;
create policy "user can delete own reports"
  on reports for delete
  using (user_id = auth.uid());
