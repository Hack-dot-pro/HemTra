-- P1-T8: Storage bucket private `bills` + policy (design §6.2 hình bill, §4.3)
-- Doc: chi user da dang nhap & session con han. Ghi: dung duong dan bills/YYYY/MM/<mabill>.png
-- (khong ghi qua duong dan hop le). Khong co policy UPDATE/DELETE -> client khong ghi de,
-- khong xoa duoc (S9); dọn file qua Edge Function service_role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 307200, array['image/png']);
-- 300KB (muc tieu <200KB, chot 300KB); chi PNG

-- Doc: session con han
create policy "bills_objects_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bills' and session_fresh());

-- Ghi: session con han + duong dan hop le
create policy "bills_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bills'
    and session_fresh()
    and name ~ '^[0-9]{4}/[0-9]{2}/HT-[0-9]{6}(-OFF-[A-Za-z0-9]{4}|-[0-9]{4,})\.png$'
  );
-- UPDATE/DELETE: KHONG tao policy -> tu choi (khong ghi de / khong xoa tu client)
