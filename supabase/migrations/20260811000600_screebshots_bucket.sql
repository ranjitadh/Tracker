-- Storage Buckets Configuration for Screenshots (screebshots & screenshots)
insert into storage.buckets (id, name, public)
values ('screebshots', 'screebshots', true), ('screenshots', 'screenshots', true)
on conflict (id) do update set public = true;

-- Storage Objects RLS Policies
drop policy if exists "Public Access screebshots" on storage.objects;
drop policy if exists "Authenticated Upload screebshots" on storage.objects;
drop policy if exists "Authenticated Update screebshots" on storage.objects;

create policy "Public Access screebshots" on storage.objects for select using (bucket_id in ('screebshots', 'screenshots'));
create policy "Authenticated Upload screebshots" on storage.objects for insert with check (bucket_id in ('screebshots', 'screenshots') or auth.role() is not null);
create policy "Authenticated Update screebshots" on storage.objects for update using (bucket_id in ('screebshots', 'screenshots') or auth.role() is not null);
