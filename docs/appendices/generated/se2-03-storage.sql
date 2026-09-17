-- Supabase Storage extension of Appendix B; apply after se2-02-workflows.sql.
-- Uploaded dish photos are public menu assets. Account/chat records stay private.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dish-images','dish-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists dineflow_dish_upload on storage.objects;
create policy dineflow_dish_upload on storage.objects for insert to authenticated
with check(bucket_id='dish-images' and public.current_user_role() in ('admin','management'));
drop policy if exists dineflow_dish_read on storage.objects;
create policy dineflow_dish_read on storage.objects for select to public using(bucket_id='dish-images');
commit;
