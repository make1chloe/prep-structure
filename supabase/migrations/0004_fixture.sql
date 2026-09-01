-- ─────────────────────────────────────────────────────────────
-- 0004 · 리허설 전용 계정 (계획 원장님 확정 ⑤)
--
-- ⚠️ 이 줄들은 **재적재해도 안 지운다**(`fixture`).
--    대조 리포트의 줄 수 세기와 이관 대상에서 **뺀다** —
--    안 빼면 리포트가 이 줄들만큼 **영원히 어긋난다.**
-- ⚠️ `auth.users` 는 안 건드린다. 접근 규칙 검사는 jwt 클레임을
--    직접 세워서 하므로 진짜 계정이 필요 없다.
-- ─────────────────────────────────────────────────────────────
insert into v2.profiles (id, role, name, state, import_batch) values
  ('00000000-0000-4000-8000-000000000001','principal', 'zz_시험_원장',   'active','fixture'),
  ('00000000-0000-4000-8000-000000000002','instructor','zz_시험_강사',   'active','fixture'),
  ('00000000-0000-4000-8000-000000000003','student',   'zz_시험_학생',   'active','fixture'),
  ('00000000-0000-4000-8000-000000000004','parent',    'zz_시험_학부모', 'active','fixture'),
  ('00000000-0000-4000-8000-000000000005','student',   'zz_시험_남의아이','active','fixture')
on conflict (id) do nothing;

insert into v2.students (id, profile_id, name, grade, state, import_batch) values
  ('00000000-0000-4000-9000-000000000001','00000000-0000-4000-8000-000000000003','zz_시험_학생',   2,'active','fixture'),
  ('00000000-0000-4000-9000-000000000002','00000000-0000-4000-8000-000000000005','zz_시험_남의아이',2,'active','fixture')
on conflict (id) do nothing;

-- 학부모는 **첫째 아이만** 본다. 둘째는 남의 아이다
insert into v2.parent_student (parent_profile_id, student_id, rel, import_batch) values
  ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-9000-000000000001','모','fixture')
on conflict do nothing;

insert into v2.classes (id, kind, state, import_batch) values
  ('00000000-0000-4000-a000-000000000001','regular','active','fixture'),
  ('00000000-0000-4000-a000-000000000002','regular','active','fixture')
on conflict (id) do nothing;

insert into v2.class_schedule (class_id, from_date, weekdays, start_time) values
  ('00000000-0000-4000-a000-000000000001','2026-03-01','{1,3}','17:00'),
  ('00000000-0000-4000-a000-000000000002','2026-03-01','{2,4}','17:00')
on conflict do nothing;

insert into v2.class_member (class_id, student_id, from_date, import_batch) values
  ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-9000-000000000001','2026-03-01','fixture'),
  ('00000000-0000-4000-a000-000000000002','00000000-0000-4000-9000-000000000002','2026-03-01','fixture')
on conflict do nothing;
