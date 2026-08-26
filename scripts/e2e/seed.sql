-- 검사용 학원 하나 (2026-08-07).
--
-- **진짜 학원 자료는 절대 안 쓴다.** 이름·전화 다 지어낸 것이다.
-- 화면이 비면 「버튼이 안 눌린다」 와 「보여줄 것이 없다」 를 못 가른다 —
-- 그래서 반·학생·숙제·시험까지 최소한을 심는다.

-- ── 계정 ─────────────────────────────────────────────────
insert into auth.users (id, email, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', 'principal@e2e.test',   'e2e-pass'),
  ('22222222-2222-2222-2222-222222222222', 'chloe0001@e2e.test',   'e2e-pass'),
  ('33333333-3333-3333-3333-333333333333', 'chloe0002@e2e.test',   'e2e-pass'),
  ('44444444-4444-4444-4444-444444444444', 'parent0001@e2e.test',  'e2e-pass')
on conflict (id) do nothing;

-- profiles 는 트리거가 만들어 준다. 역할만 바로잡는다
insert into public.profiles (id, name, role) values
  ('11111111-1111-1111-1111-111111111111', '원장', 'principal'),
  ('22222222-2222-2222-2222-222222222222', '김서은', 'student'),
  ('33333333-3333-3333-3333-333333333333', '박지호', 'student'),
  ('44444444-4444-4444-4444-444444444444', '김서은 어머니', 'parent')
on conflict (id) do update set name = excluded.name, role = excluded.role;

-- ── 학생 ─────────────────────────────────────────────────
insert into public.students (id, profile_id, name, school, grade, parent_phone, login_id, status) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '김서은', '해송고등학교', '고1', '010-0000-0001', 'chloe0001', 'enrolled'),
  ('aaaaaaa1-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333',
   '박지호', '신정중학교', '중2', '010-0000-0002', 'chloe0002', 'enrolled')
on conflict (id) do nothing;

insert into public.parent_student (parent_profile_id, student_id) values
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaa1-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── 반 ───────────────────────────────────────────────────
insert into public.classes (id, name, days, start_time) values
  ('bbbbbbb1-0000-0000-0000-000000000001', '고1 A', array['월','수','금'], '17:00')
on conflict (id) do nothing;

insert into public.class_students (class_id, student_id) values
  ('bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001'),
  ('bbbbbbb1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000002')
on conflict do nothing;

-- ── 오늘 수업 기록 (없으면 검사 화면이 통째로 빈다) ──────
insert into public.attendance (student_id, date, status) values
  ('aaaaaaa1-0000-0000-0000-000000000001', current_date, 'present'),
  ('aaaaaaa1-0000-0000-0000-000000000002', current_date, 'present')
on conflict (student_id, date) do nothing;

insert into public.daily_reports (student_id, date) values
  ('aaaaaaa1-0000-0000-0000-000000000001', current_date),
  ('aaaaaaa1-0000-0000-0000-000000000002', current_date)
on conflict do nothing;

-- ── 학부모가 보낸 알림 (대시보드가 비면 볼 것이 없다) ────
insert into public.requests (student_id, created_by, kind, from_date, to_date, body, status)
values ('aaaaaaa1-0000-0000-0000-000000000001',
        '44444444-4444-4444-4444-444444444444',
        'absence', current_date + 3, current_date + 3, '병원 예약이 있어 못 갑니다', 'new')
on conflict do nothing;

-- ── 앞으로의 결석 예정 · 잡아둔 보강 (출결 화면) ─────────
insert into public.attendance (student_id, date, status, planned, reason) values
  ('aaaaaaa1-0000-0000-0000-000000000002', current_date + 5, 'absent', true, '가족 일정')
on conflict (student_id, date) do nothing;

insert into public.attendance (student_id, date, status, makeup_of) values
  ('aaaaaaa1-0000-0000-0000-000000000002', current_date + 7, 'makeup', current_date + 5)
on conflict (student_id, date) do nothing;

-- ── 학교 목록 (설문지 「골라 넣기」 검사용 — 0114) ─────────
-- 표가 비면 설문지 학교 칸이 손으로 적는 칸으로 내려앉는다 — 그 화면을
-- 검사하려면 목록이 있어야 한다
insert into public.schools (name) values ('신정중'), ('박문중')
on conflict do nothing;

-- ── 학교 시험 (일정 화면) ────────────────────────────────
insert into public.exam_periods (school, grade, name, from_date, to_date)
values ('해송고등학교', null, '2학기 중간', current_date + 20, current_date + 23)
on conflict do nothing;

-- ── 신규 문의 (전화로 받은 것) ───────────────────────────
--
-- 원장님이 전화를 받고 바로 두 통을 보내신다 — 설문지 링크, 그리고
-- 일정·오시는 길. 일정이 잡혀 있어야 ② 단추가 뜬다.
insert into public.inquiries (id, name, phone, school, grade, source, status, test_on, test_at, consult_on, consult_at)
values ('ccccccc1-0000-0000-0000-000000000001',
        '최다인', '010-0000-0009', '연수여자고등학교', '고1', '전화', 'new',
        current_date + 4, '17:00', current_date + 6, '14:00')
on conflict (id) do nothing;

-- 학원 주소·전화 — 「오시는 길」 문자가 이걸 쓴다
insert into public.integrations (id, enabled, config) values
  ('academy', true, '{"name":"검사학원"}'::jsonb),
  ('message', true, '{"phone":"032-000-0000","address":"인천 연수구 검사로 1"}'::jsonb)
on conflict (id) do update set config = excluded.config, enabled = true;
