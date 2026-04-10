-- Bootstrap private storage bucket and RLS policies for hibi-media.
-- Run this in Supabase SQL editor with an owner/admin role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hibi-media',
  'hibi-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Read own objects
create policy if not exists "hibi_media_select_own"
on storage.objects
for select
using (
  bucket_id = 'hibi-media'
  and auth.uid() is not null
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Upload own objects
create policy if not exists "hibi_media_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'hibi-media'
  and auth.uid() is not null
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Update own objects
create policy if not exists "hibi_media_update_own"
on storage.objects
for update
using (
  bucket_id = 'hibi-media'
  and auth.uid() is not null
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'hibi-media'
  and auth.uid() is not null
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Delete own objects
create policy if not exists "hibi_media_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'hibi-media'
  and auth.uid() is not null
  and split_part(name, '/', 2) = auth.uid()::text
);
