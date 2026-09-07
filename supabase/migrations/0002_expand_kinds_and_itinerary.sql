-- Amplía los tipos de evento y agrega las planillas diarias importadas desde PDF.

alter table events drop constraint events_kind_check;
alter table events add constraint events_kind_check
  check (kind in ('entrenamiento', 'partido', 'viaje', 'charla_tecnica', 'tmi', 'otros'));

create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_label text,
  category text,
  day_date date not null,
  start_time time not null,
  label text not null,
  kind text check (kind in ('entrenamiento', 'partido', 'viaje', 'charla_tecnica', 'tmi', 'otros')),
  added_event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index itinerary_items_user_idx on itinerary_items(user_id);
create index itinerary_items_date_idx on itinerary_items(day_date);

alter table itinerary_items enable row level security;

create policy "user can view own itinerary items"
  on itinerary_items for select
  using (user_id = auth.uid());

create policy "user can insert own itinerary items"
  on itinerary_items for insert
  with check (user_id = auth.uid());

create policy "user can update own itinerary items"
  on itinerary_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user can delete own itinerary items"
  on itinerary_items for delete
  using (user_id = auth.uid());
