-- Run this file once in the Supabase SQL Editor.
-- Then create an email/password user in Authentication > Users and run the
-- final UPDATE statement at the bottom with that user's email address.

alter table public.shipments
  add column if not exists events jsonb not null default '[]'::jsonb,
  add column if not exists hold_request jsonb;

alter table public.shipments enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

drop policy if exists "Anyone can read shipments" on public.shipments;
create policy "Anyone can read shipments"
on public.shipments
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can create shipments" on public.shipments;
create policy "Admins can create shipments"
on public.shipments
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update shipments" on public.shipments;
create policy "Admins can update shipments"
on public.shipments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete shipments" on public.shipments;
create policy "Admins can delete shipments"
on public.shipments
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('package-images', 'package-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Admins can read package images" on storage.objects;
create policy "Admins can read package images"
on storage.objects
for select
to authenticated
using (bucket_id = 'package-images' and public.is_admin());

drop policy if exists "Admins can upload package images" on storage.objects;
create policy "Admins can upload package images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'package-images' and public.is_admin());

drop policy if exists "Admins can update package images" on storage.objects;
create policy "Admins can update package images"
on storage.objects
for update
to authenticated
using (bucket_id = 'package-images' and public.is_admin())
with check (bucket_id = 'package-images' and public.is_admin());

drop policy if exists "Admins can delete package images" on storage.objects;
create policy "Admins can delete package images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'package-images' and public.is_admin());

-- After creating the admin user, replace the email and run this statement:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';
