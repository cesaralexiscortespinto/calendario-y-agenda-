-- Permite adjuntar un video del ejercicio y una ficha (PDF o imagen) a los TMI.

alter table events add column if not exists video_url text;
alter table events add column if not exists ficha_url text;

insert into storage.buckets (id, name, public)
values ('tmi-media', 'tmi-media', true)
on conflict (id) do nothing;

drop policy if exists "tmi media insert own" on storage.objects;
create policy "tmi media insert own"
  on storage.objects for insert
  with check (bucket_id = 'tmi-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tmi media select own" on storage.objects;
create policy "tmi media select own"
  on storage.objects for select
  using (bucket_id = 'tmi-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tmi media update own" on storage.objects;
create policy "tmi media update own"
  on storage.objects for update
  using (bucket_id = 'tmi-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tmi media delete own" on storage.objects;
create policy "tmi media delete own"
  on storage.objects for delete
  using (bucket_id = 'tmi-media' and (storage.foldername(name))[1] = auth.uid()::text);
