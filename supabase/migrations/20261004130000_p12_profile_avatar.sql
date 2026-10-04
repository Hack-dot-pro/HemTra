-- P12-T9 — avatar cho profile admin:
--   1) profiles.avatar_path: đường dẫn ảnh đại diện trong bucket `avatars`
--      (EF profile-update ghi bằng service_role; client đọc qua signed URL).
--   2) bucket `avatars` (private — ảnh cá nhân không public).
--   3) policy: authenticated ĐỌC được ảnh avatar (hiển thị ở header/modal),
--      GHI chỉ qua EF (service_role bypass RLS — không cần policy insert/delete).

alter table public.profiles
  add column if not exists avatar_path text not null default '';

comment on column public.profiles.avatar_path is
  'P12-T9: đường dẫn ảnh đại diện trong bucket avatars (rỗng = dùng chữ cái đầu)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Đọc ảnh avatar bằng phiên đăng nhập (signed URL cũng cần quyền SELECT này).
drop policy if exists avatars_read_authenticated on storage.objects;
create policy avatars_read_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');
