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
insert into v2.schools (id, name, level, import_batch) values
  ('99999999-0000-4000-d000-000000000001', 'zz_시험_중학교', 'middle', 'fixture')
on conflict (id) do nothing;
insert into v2.students (id, profile_id, name, grade, state, school_id, import_batch) values
  ('99999999-0000-4000-9000-000000000001', '33333333-3333-3333-3333-333333333333', 'zz_시험_학생', 2, 'active', '99999999-0000-4000-d000-000000000001', 'fixture')
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
insert into v2.day_item (id, sheet_id, slot, range_note, unit_id, sort) values
  ('99999999-0000-4000-d000-000000000001', '99999999-0000-4000-c000-000000000001', 'home', '워크북 복습 · PSS 1-3 · p.10 · 문항 1-18', null, 1),
  ('99999999-0000-4000-d000-000000000002', '99999999-0000-4000-c000-000000000001', 'home', '클카 문장훈련 · PSS 1-3 간접의문문 Ⅰ', null, 2)
on conflict (id) do nothing;

-- ── 루틴 깔기 눌러보기 — 리허설 문법책 한 권(소단원 5 + 다음 대단원 1) · 루틴 4줄(학원 2 · 둘 다 1 · 숙제 1, 필수 3) · 배정(1회독, 한 수업 1덩어리) · 1-1~1-3 은 한 것
insert into v2.books (id, code, name, area, order_basis, chunk_depth, state, import_batch) values
  ('99999999-0000-4000-e000-000000000001', 'ZZ001', 'zz_리허설 문법책', '문법', 'sub', 'sub', 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.units (id, book_id, chapter, sub, activity, is_workbook, sort, page_start, page_end, q_count, import_batch) values
  ('99999999-0000-4000-e100-000000000001', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', 'PSS 1-1 문장의 형식', '본책', false, 1, 10, 10, 16, 'fixture'),
  ('99999999-0000-4000-e100-000000000002', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', 'PSS 1-2 의문사', '본책', false, 2, 11, 11, 14, 'fixture'),
  ('99999999-0000-4000-e100-000000000003', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', 'PSS 1-3 간접의문문 Ⅰ', '본책', false, 3, 12, 12, 12, 'fixture'),
  ('99999999-0000-4000-e100-000000000004', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', 'PSS 1-4 간접의문문 Ⅱ', '본책', false, 4, 13, 13, 15, 'fixture'),
  ('99999999-0000-4000-e100-000000000005', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', 'PSS 1-5 부정의문문', '본책', false, 5, 14, 14, 13, 'fixture'),
  ('99999999-0000-4000-e100-000000000006', '99999999-0000-4000-e000-000000000001', 'CHAPTER 2', 'PSS 2-1 시제', '본책', false, 6, 20, 21, 18, 'fixture')
on conflict (id) do nothing;
insert into v2.learn_items (id, name, method, sort, import_batch) values
  ('99999999-0000-4000-e200-000000000001', 'zz_의미덩어리 구두테스트', '소단원 문장을 입으로', 1, 'fixture'),
  ('99999999-0000-4000-e200-000000000002', 'zz_클카 문장훈련', '클래스카드 문장훈련', 2, 'fixture'),
  ('99999999-0000-4000-e200-000000000003', 'zz_교재 풀기', '본책 문제', 3, 'fixture'),
  ('99999999-0000-4000-e200-000000000004', 'zz_워크북 복습', '워크북', 4, 'fixture')
on conflict (id) do nothing;
insert into v2.area_routine (area, item_id, place, required, sort, import_batch) values
  ('문법', '99999999-0000-4000-e200-000000000001', 'class', true,  1, 'fixture'),
  ('문법', '99999999-0000-4000-e200-000000000002', 'both',  true,  2, 'fixture'),
  ('문법', '99999999-0000-4000-e200-000000000003', 'class', false, 3, 'fixture'),
  ('문법', '99999999-0000-4000-e200-000000000004', 'home',  true,  4, 'fixture')
on conflict do nothing;
insert into v2.student_book (id, student_id, book_id, from_date, round, per_session, stop_mode, import_batch) values
  ('99999999-0000-4000-e300-000000000001', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-e000-000000000001', '2026-01-01', 1, 1, 'running', 'fixture')
on conflict (id) do nothing;
insert into v2.progress (student_id, unit_id, round, status, done_on, marked_on, last_by) values
  ('99999999-0000-4000-9000-000000000001', '99999999-0000-4000-e100-000000000001', 1, 'done', '2026-08-01', '2026-08-01', 'staff'),
  ('99999999-0000-4000-9000-000000000001', '99999999-0000-4000-e100-000000000002', 1, 'done', '2026-08-03', '2026-08-03', 'staff'),
  ('99999999-0000-4000-9000-000000000001', '99999999-0000-4000-e100-000000000003', 1, 'done', '2026-08-05', '2026-08-05', 'staff')
on conflict do nothing;

-- ── 시험 카드 눌러보기 — 어제 낸 단어 시험(1-3 · 전체 20 · 통과 90 · 학원 기본 방식) — 오늘 「시험 · 시작하자마자」에 선다
insert into v2.quiz (id, student_id, kind, source, book_id, unit_from, assigned_sheet_id, assigned_on, total, cut_pct, style_id, state)
  select '99999999-0000-4000-f000-000000000001', '99999999-0000-4000-9000-000000000001', 'word', 'book', '99999999-0000-4000-e000-000000000001', '99999999-0000-4000-e100-000000000003',
         '99999999-0000-4000-c000-000000000001', v2.today() - 1, 20, 90,
         (select id from v2.quiz_style where student_id is null and book_id is null and round = 1 and kind = 'word' limit 1), 'planned'
  where not exists (select 1 from v2.quiz where id = '99999999-0000-4000-f000-000000000001');
-- ── 조절(02) 눌러보기 — 한 줄짜리 긴 소단원(62문항, 「이번에 낼 번호」가 뜬다)
insert into v2.units (id, book_id, chapter, sub, activity, is_workbook, sort, page_start, page_end, q_count, import_batch) values
  ('99999999-0000-4000-e100-000000000007', '99999999-0000-4000-e000-000000000001', 'CHAPTER 1', '중간·기말 대비문제', '문제', false, 7, 30, 38, 62, 'fixture')
on conflict (id) do nothing;

-- ── 경고·반성문 눌러보기 — 지난달 끝자락에 경고 이틀(지각). 오늘 지각까지 3회째면 반성문을 묻고, 「전원 정리하기」 뒤엔 오늘 것 1회만 남는다 (어제 판 today-1 과 안 겹치게 1일-3 · 1일-5)
insert into v2.day_sheet (id, student_id, class_id, date, attend, closed_at, import_batch)
  select '99999999-0000-4000-c000-000000000002', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-a000-000000000001', date_trunc('month', v2.today())::date - 3, 'late', now() - interval '3 day', 'fixture'
  where not exists (select 1 from v2.day_sheet where id = '99999999-0000-4000-c000-000000000002');
insert into v2.day_sheet (id, student_id, class_id, date, attend, closed_at, import_batch)
  select '99999999-0000-4000-c000-000000000003', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-a000-000000000001', date_trunc('month', v2.today())::date - 5, 'late', now() - interval '5 day', 'fixture'
  where not exists (select 1 from v2.day_sheet where id = '99999999-0000-4000-c000-000000000003');

-- ── 어제 숙제 첫 줄은 소단원 1-4 를 가리킨다(단원이 위에서 선 뒤에 잇는다 — 앞에 두면 FK 에 걸려 seed 가 거기서 멈춘다) — △ 를 주면 진도 ◐, 깔기(안 한 차례)에는 영향이 없다
update v2.day_item set unit_id = '99999999-0000-4000-e100-000000000004' where id = '99999999-0000-4000-d000-000000000001' and unit_id is null;

-- ── 결석·지각 예정 눌러보기 — 둘째 리허설 학생은 오늘 결석 예정(보강 줄 todo) → 판이 안 서고 숙제가 안 나간다
insert into v2.students (id, profile_id, name, grade, state, import_batch) values
  ('99999999-0000-4000-9000-000000000002', null, 'zz_시험_학생둘', 1, 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.class_member (class_id, student_id, from_date, import_batch) values
  ('99999999-0000-4000-a000-000000000001', '99999999-0000-4000-9000-000000000002', '2026-01-01', 'fixture')
on conflict do nothing;
insert into v2.makeup (id, student_id, of_date, state, reason)
  select '99999999-0000-4000-f100-000000000001', '99999999-0000-4000-9000-000000000002', v2.today(), 'todo', '가족 여행'
  where not exists (select 1 from v2.makeup where id = '99999999-0000-4000-f100-000000000001');
-- 학생둘 — 같은 교재를 3회독째(학생 줄 머리 「3회독째」 알약)
insert into v2.student_book (id, student_id, book_id, from_date, round, per_session, stop_mode, import_batch) values
  ('99999999-0000-4000-e300-000000000002', '99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e000-000000000001', '2026-01-01', 3, 1, 'running', 'fixture')
on conflict (id) do nothing;
-- 단원평가 — 원장님이 따로 출제한 25문항(교재와 무관, 문법 분류로)
insert into v2.grammar_topics (id, name, sort) values ('99999999-0000-4000-d100-000000000001', 'zz_시험_관계사', 999) on conflict (id) do nothing;
insert into v2.unit_test (id, student_id, topic_id, assigned_on, q_count, state)
  select '99999999-0000-4000-d200-000000000001', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-d100-000000000001', v2.today() - 1, 25, 'made'
  where not exists (select 1 from v2.unit_test where id = '99999999-0000-4000-d200-000000000001');
