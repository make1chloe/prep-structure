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
-- 회차가 모자란 반 하나(요일 없음 · 아이 없음) — 일정 12 의 「⚠️ N회 모자람 — 보강 필요 · 📅 보강일 잡기」 길을 걷는다(2026-09-07: 그 길이 처음 그려지며 숨어 있던 버그가 나왔다 — 늘 걷는다)
insert into v2.classes (id, kind, nickname, state, import_batch) values
  ('99999999-0000-4000-a000-000000000002', 'regular', 'zz_토요 정규', 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.class_schedule (id, class_id, from_date, weekdays, start_time, end_time)
  select '99999999-0000-4000-b000-000000000002', '99999999-0000-4000-a000-000000000002', '2026-01-01', array[]::smallint[], '19:00', '20:00'   -- 요일이 비어 있다(아직 안 정한 반) — 어느 날의 명단에도 안 서고 회차는 늘 0 → 요일을 안 탄다
  where not exists (select 1 from v2.class_schedule where id = '99999999-0000-4000-b000-000000000002');
-- 그 반의 아이 하나(다른 반엔 없다 — 반 보강일은 아이마다 줄이 서므로 아이가 있어야 잡힌다 · 학교 없음)
insert into v2.students (id, profile_id, name, grade, state, import_batch) values
  ('99999999-0000-4000-9000-000000000003', null, 'zz_시험_학생셋', 3, 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.class_member (class_id, student_id, from_date, import_batch) values
  ('99999999-0000-4000-a000-000000000002', '99999999-0000-4000-9000-000000000003', '2026-01-01', 'fixture')
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
insert into v2.student_book (id, student_id, book_id, from_date, round, per_session, stop_mode, unit_test, unit_test_n, import_batch) values
  ('99999999-0000-4000-e300-000000000002', '99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e000-000000000001', '2026-01-01', 3, 1, 'running', 'per_n_sub', 3, 'fixture')
on conflict (id) do nothing;   -- (버) 단원평가 「소단원 3개마다」 — 3회독에서 끝낸 1-1·1-2·1-3 이 한 묶음 → 05 에 「📝 단원평가 출제」가 저절로(0149 unit_test_due). 11 화면 걷기는 학생하나 교재를 켜고 끄므로 학생둘에 둔다
insert into v2.progress (student_id, unit_id, round, status, done_on, marked_on, last_by) values
  ('99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e100-000000000001', 3, 'done', '2026-08-01', '2026-08-01', 'staff'),
  ('99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e100-000000000002', 3, 'done', '2026-08-01', '2026-08-01', 'staff'),
  ('99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e100-000000000003', 3, 'done', '2026-08-01', '2026-08-01', 'staff')
on conflict do nothing;   -- 8/1 에 끝냄 → 대시보드 「커서 잠김」(21일 넘게 그대로)은 그대로 선다
-- 단원평가 — 원장님이 따로 출제한 25문항(교재와 무관, 문법 분류로)
insert into v2.grammar_topics (id, name, sort) values ('99999999-0000-4000-d100-000000000001', 'zz_시험_관계사', 999) on conflict (id) do nothing;
-- (버) 교재 단원 ↔ 문법 분류(unit_topic) — 1-2·1-3 이 관계사 → 저절로 선 단원평가 카드의 「단원」이 이 분류로(1-1 은 15 걷기가 zz_관계사를 잇는다)
insert into v2.unit_topic (unit_id, topic_id) values
  ('99999999-0000-4000-e100-000000000002', '99999999-0000-4000-d100-000000000001'),
  ('99999999-0000-4000-e100-000000000003', '99999999-0000-4000-d100-000000000001')
on conflict do nothing;
insert into v2.unit_test (id, student_id, topic_id, assigned_on, q_count, state)
  select '99999999-0000-4000-d200-000000000001', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-d100-000000000001', v2.today() - 1, 25, 'made'
  where not exists (select 1 from v2.unit_test where id = '99999999-0000-4000-d200-000000000001');
-- 늦귀가 되풀이 눌러보기(확정-⑭ · 0113) — 그저께 판과 어제 판에 예상 귀가(약속)가 있었다. 오늘 적으면 21일 안 3번째 → 「3주 안 3번째 남습니다 — 숙제량을 볼까요?」(규칙 late.repeat_count 3 · late.repeat_days 21)
-- 그저께(today-2)는 경고 씨앗(1일-3 · 1일-5)과 어느 달에도 안 겹친다(오늘 ≥ 1일이라 today-2 ≥ 1일-2)
insert into v2.day_sheet (id, student_id, class_id, date, attend, closed_at, import_batch)
  select '99999999-0000-4000-c000-000000000004', '99999999-0000-4000-9000-000000000001', '99999999-0000-4000-a000-000000000001', v2.today() - 2, 'present', now() - interval '2 day', 'fixture'
  where not exists (select 1 from v2.day_sheet where id = '99999999-0000-4000-c000-000000000004');
-- (카) 그저께 판의 숙제 하나 — 오늘 열면 30일 안 안 본 숙제 전부가 검사 줄로 끌려오므로(lib/day.js unchecked) 셋이 서고, 가장 오래된 것이 이틀 전이라 줄 머리에 「2일째 안 봄」(lib/roster-plan unseenPill · 검사-㊶ — 걷기에서 한 번도 안 떴었다)
insert into v2.day_item (id, sheet_id, slot, range_note, unit_id, sort) values
  ('99999999-0000-4000-d000-000000000003', '99999999-0000-4000-c000-000000000004', 'home', 'zz_그저께 단어 20개', '99999999-0000-4000-e100-000000000003', 1)
on conflict (id) do nothing;
-- (머) 그저께 숙제의 단원은 PSS 1-3(끝낸 단원) — 걷기가 ✕ 로 보면 오늘 학습·숙제의 기본이 「1-3 다시」로 깔린다(lib/routine-plan redoUnits · 남긴 것 4)
-- (머) 같은 조절 3번째 — 어제·그저께 판에서 이 교재를 조절했었다(tuned_at) → 오늘 02 를 열면 「같은 조절 3번째 — 루틴을 고칠까요?」(규칙 tune.ask_after 3 · 확정-62)
insert into v2.sheet_book (sheet_id, book_id, tuned_at) values
  ('99999999-0000-4000-c000-000000000001', '99999999-0000-4000-e000-000000000001', now() - interval '1 day'),
  ('99999999-0000-4000-c000-000000000004', '99999999-0000-4000-e000-000000000001', now() - interval '2 day')
on conflict (sheet_id, book_id) do nothing;
insert into v2.late_stay (id, sheet_id, reason, until_at, sent_at) values
  ('99999999-0000-4000-c100-000000000001', '99999999-0000-4000-c000-000000000001', '워크북 나머지', '21:40', now() - interval '1 day'),
  ('99999999-0000-4000-c100-000000000004', '99999999-0000-4000-c000-000000000004', '문장훈련 녹음', '21:20', now() - interval '2 day')
on conflict (id) do nothing;
-- 대시보드 눌러보기(목업 17) — 학생둘에게 독해책을 배정했는데 독해 영역 루틴이 없다 → 「🚨 빌 아이 1 · 루틴 없음」(문법책이 먼저 오게 from_date 는 더 옛날). 남기실 말 1 · 신규 문의 1
insert into v2.books (id, code, name, area, order_basis, chunk_depth, state, import_batch) values
  ('99999999-0000-4000-e000-000000000002', 'ZZ002', 'zz_리허설 독해책', '독해', 'sub', 'sub', 'active', 'fixture')
on conflict (id) do nothing;
insert into v2.units (id, book_id, chapter, sub, activity, is_workbook, sort, page_start, page_end, q_count, import_batch) values
  ('99999999-0000-4000-e100-000000000011', '99999999-0000-4000-e000-000000000002', 'UNIT 1', '1-1 주제 찾기', '본책', false, 1, 8, 9, 10, 'fixture')
on conflict (id) do nothing;
insert into v2.student_book (id, student_id, book_id, from_date, round, per_session, stop_mode, import_batch) values
  ('99999999-0000-4000-e300-000000000012', '99999999-0000-4000-9000-000000000002', '99999999-0000-4000-e000-000000000002', '2025-12-01', 1, 1, 'running', 'fixture')
on conflict (id) do nothing;
insert into v2.request (id, student_id, kind, body, at, state)
  select '99999999-0000-4000-f200-000000000001', '99999999-0000-4000-9000-000000000001', 'question', '다음 주 수요일 병원이라 늦을 것 같아요', now() - interval '1 day', 'open'
  where not exists (select 1 from v2.request where id = '99999999-0000-4000-f200-000000000001');
insert into v2.inquiry (id, name, phone, school, grade, way, stage, body) values
  ('99999999-0000-4000-f300-000000000001', 'zz_시험_문의', '010-0000-0000', 'zz_시험_중학교', 1, 'phone', 'new', '레벨테스트 문의')
on conflict (id) do nothing;
-- 아이 화면 07 눌러보기 — 학원 회선에 로컬 주소(눌러보기는 127.0.0.1 로 들어온다) · 아이 화면 카드 넷은 켬(원장님이 실제 DB 에선 32칸을 다 정하셨다 — 리허설도 켜 둔다)
update v2.integration set config = jsonb_set(coalesce(config, '{}'::jsonb), '{ips}', '["127.0.0.1", "::1"]'::jsonb) where id = 'arrival';
insert into v2.role_access (role, key, allowed) values ('student', 'me.arrival', true), ('student', 'me.today', true), ('student', 'me.books', true), ('student', 'me.flags', true), ('student', 'me.grid', true)
on conflict (role, key) do nothing;
-- 받을 교재·학습지 눌러보기(07-2 ①) — 자료 갈래 둘 · 학생에게 나눠 준 것 셋(하나는 끝냄)
insert into v2.material_type (id, name, steps, sort) values
  ('99999999-0000-4000-a100-000000000001', 'zz_클카 문장훈련', '{make,hand,solve}', 901),
  ('99999999-0000-4000-a100-000000000002', 'zz_너른터', '{make,print,hand,solve,score}', 902)
on conflict (id) do nothing;
insert into v2.material (id, type_id, title, state) values
  ('99999999-0000-4000-a200-000000000001', '99999999-0000-4000-a100-000000000001', '2과 단어', 'printed'),
  ('99999999-0000-4000-a200-000000000002', '99999999-0000-4000-a100-000000000002', '대의파악', 'printed'),
  ('99999999-0000-4000-a200-000000000003', '99999999-0000-4000-a100-000000000001', '1과 단어', 'done')
on conflict (id) do nothing;
insert into v2.material_give (material_id, student_id, handed_at, got_at, stage) values
  ('99999999-0000-4000-a200-000000000001', '99999999-0000-4000-9000-000000000001', now() - interval '1 day', null, 'none'),
  ('99999999-0000-4000-a200-000000000002', '99999999-0000-4000-9000-000000000001', now() - interval '3 day', now() - interval '3 day', 'doing'),
  ('99999999-0000-4000-a200-000000000003', '99999999-0000-4000-9000-000000000001', now() - interval '10 day', now() - interval '10 day', 'done')
on conflict do nothing;
-- 학부모 화면 09 눌러보기 — 리허설 학부모 ↔ 학생 잇기 · 학부모 카드 다섯 켬(자료·단어·리포트는 안 정함 = 숨김)
insert into v2.parent_student (parent_profile_id, student_id, rel, import_batch) values
  ('44444444-4444-4444-4444-444444444444', '99999999-0000-4000-9000-000000000001', '어머니', 'fixture')
on conflict do nothing;
insert into v2.role_access (role, key, allowed) values ('parent', 'parent.intro', true), ('parent', 'parent.recent', true), ('parent', 'parent.homework', true), ('parent', 'parent.next', true), ('parent', 'parent.sent', true), ('parent', 'parent.reports', true), ('parent', 'parent.grid', true)
on conflict (role, key) do nothing;

-- 자료함 20 · 영상 19 눌러보기(3단계-9) — 학부모가 보낸 사진 하나(갈래 안 고름 → 「방금 온 것」) · 원장이 어제 숙제 첫 줄에 붙인 pdf(아이 화면 📎 · 학부모는 마감한 판이라 보인다) · 영상 하나(300초) 배정 + 지나간 구간 [0,30)·[60,90) = 60초 → 20% · 학부모 자료 카드 켬. 보관함 파일 자체는 걷기가 /var/tmp/e2e-storage 에 쓴다
insert into v2.file (id, by_profile, student_id, orig_name, mime, bytes, path, shrunk, note, uploaded_at) values
  ('99999999-0000-4000-f500-000000000001', '44444444-4444-4444-4444-444444444444', '99999999-0000-4000-9000-000000000001', 'zz_수행평가.jpg', 'image/jpeg', 12000, 'e2e/zz-parent.jpg', true, '수행평가 안내문이에요', now() - interval '2 hour'),
  ('99999999-0000-4000-f500-000000000002', '11111111-1111-1111-1111-111111111111', '99999999-0000-4000-9000-000000000001', 'zz_어순정리.pdf', 'application/pdf', 3000, 'e2e/zz-staff.pdf', false, '어순 정리 — 오답 다시 풀 곳', now() - interval '1 day')
on conflict (id) do nothing;
insert into v2.file_link (file_id, day_item_id) values ('99999999-0000-4000-f500-000000000002', '99999999-0000-4000-d000-000000000001') on conflict do nothing;
insert into v2.video (id, title, url, folder, seconds) values ('99999999-0000-4000-f600-000000000001', 'zz_간접의문문 정리', 'https://www.youtube.com/watch?v=zzzzzzzzzzz', 'zz_문법', 300) on conflict (id) do nothing;
insert into v2.video_assign (video_id, student_id, due_on) values ('99999999-0000-4000-f600-000000000001', '99999999-0000-4000-9000-000000000001', v2.today() + 3) on conflict do nothing;
insert into v2.video_view (video_id, student_id, spans, last_pos) values ('99999999-0000-4000-f600-000000000001', '99999999-0000-4000-9000-000000000001', array[int4range(0, 30), int4range(60, 90)], 90) on conflict do nothing;
insert into v2.role_access (role, key, allowed) values ('parent', 'parent.files', true) on conflict (role, key) do nothing;

-- 발송 10 눌러보기 — 리허설은 방해금지 없음(시작=끝). 걷기가 밤에 돌아도 알림이 미뤄지지 않게. 진짜 DB 는 0118 씨앗(23:00~09:00) 그대로
update v2.rule set value = '00:00' where key in ('send.quiet_from', 'send.quiet_to');
update v2.rule set value = '1' where key = 'day.heavy_pages';   -- 📣 「오늘 좀 많습니다」 띠를 걷기에서 보려고 문턱을 1쪽으로(실제 기본은 30)

-- (저) 받아오기가 기간을 옮긴 회차(0152 · 확정-69 — 나이스 줄과 같은 꼴 · 출처는 site: 나이스 줄이면 12b 머리가 「M/D 받음」이 돼 「아직 안 받음」 걷기가 깨진다) — 전국 하루짜리(고등 아이가 없어 0명 · 이틀 뒤로 옮겨졌다) → 대시보드 📅 「학교 일정이 바뀌었어요」 · 06b 전국 줄 「📡 날짜 바뀜 … 봤음」
insert into v2.exams (id, scope, school_id, grade, name, term_from, term_to, english_on, source, source_key, state, prev_term_from, prev_term_to, changed_at, import_batch)
  select '99999999-0000-4000-e600-000000000001', 'national', null, null, 'zz_시험_모의고사', current_date + 50, current_date + 50, null, 'site', 'site:zz_시험_모의고사', 'active', current_date + 48, current_date + 48, now() - interval '1 day', 'fixture'
  where not exists (select 1 from v2.exams where id = '99999999-0000-4000-e600-000000000001');
