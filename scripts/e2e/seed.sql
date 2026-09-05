-- 리허설 계정 — 역할마다 하나. 진짜 사람은 한 명도 없다(대전제 12). 비밀번호는 전부 e2e-pass.
insert into auth.users (id, email, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', 'zz_principal@e2e.test',  'e2e-pass'),
  ('22222222-2222-2222-2222-222222222222', 'zz_instructor@e2e.test', 'e2e-pass'),
  ('33333333-3333-3333-3333-333333333333', 'chloe0000@chloe-eng.internal',    'e2e-pass'),
  ('44444444-4444-4444-4444-444444444444', '01000000000@chloe-eng.internal',     'e2e-pass'),
  ('55555555-5555-5555-5555-555555555555', 'zz_assistant@e2e.test',  'e2e-pass')
on conflict (id) do nothing;
insert into v2.profiles (id, role, name, import_batch) values
  ('11111111-1111-1111-1111-111111111111', 'principal',  'zz_시험_원장', 'rehearsal'),
  ('22222222-2222-2222-2222-222222222222', 'instructor', 'zz_시험_강사', 'rehearsal'),
  ('33333333-3333-3333-3333-333333333333', 'student',    'zz_시험_학생', 'rehearsal'),
  ('44444444-4444-4444-4444-444444444444', 'parent',     'zz_시험_학부모', 'rehearsal')
on conflict (id) do nothing;
-- 조교는 나중 마이그레이션이 role 에 더했다 — 없으면 조용히 건너뛴다
do $$ begin
  insert into v2.profiles (id, role, name, import_batch) values ('55555555-5555-5555-5555-555555555555', 'assistant', 'zz_시험_조교', 'rehearsal') on conflict (id) do nothing;
exception when check_violation then raise notice 'assistant 없음 — 건너뜀'; end $$;

-- 리허설 학생·학부모도 처음 비밀번호 문을 지난다(0100 의 표시 줄은 마이그레이션 때 이미 섰으니 여기서 켠다)
update v2.profiles set must_change_pw = true where role in ('student','parent') and name like 'zz_시험_%';

-- ── 오늘 수업 눌러보기 — 리허설 학생에게 반·시간표(매일)·어제 숙제 둘
insert into v2.students (id, profile_id, name, grade, state, import_batch) values
  ('99999999-0000-4000-9000-000000000001', '33333333-3333-3333-3333-333333333333', 'zz_시험_학생', 2, 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.classes (id, kind, nickname, state, import_batch) values
  ('99999999-0000-4000-a000-000000000001', 'regular', '매일 5:00 리허설', 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.class_schedule (id, class_id, from_date, weekdays, start_time, end_time)
  select '99999999-0000-4000-b000-000000000001', '99999999-0000-4000-a000-000000000001', '2026-01-01', array[0,1,2,3,4,5,6]::smallint[], '17:00', '18:30'
  where not exists (select 1 from v2.class_schedule where id = '99999999-0000-4000-b000-000000000001');
insert into v2.class_member (class_id, student_id, from_date, import_batch) values
  ('99999999-0000-4000-a000-000000000001', '99999999-0000-4000-9000-000000000001', '2026-01-01', 'fixture')
on conflict do nothing;
-- 어제 판 + 숙제 둘 (오늘 열면 검사 줄로 끌려온다)
insert into v2.day_sheet (id, student_id, class_id, date, attend, closed_at, import_batch)
  select '99999999-0000-4000-c000-000000000001', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-a000-000000000001', v2.today() - 1, 'present', now() - interval '1 day', 'fixture'
  where not exists (select 1 from v2.day_sheet where id = '99999999-0000-4000-c000-000000000001');
insert into v2.day_item (id, sheet_id, slot, range_note, sort) values
  ('99999999-0000-4000-d000-000000000001', '99999999-0000-4000-c000-000000000001', 'home', '워크북 복습 · PSS 1-3 · p.10 · 문항 1-18', 1),
  ('99999999-0000-4000-d000-000000000002', '99999999-0000-4000-c000-000000000001', 'home', '클카 문장훈련 · PSS 1-3 간접의문문 Ⅰ', 2)
on conflict (id) do nothing;
