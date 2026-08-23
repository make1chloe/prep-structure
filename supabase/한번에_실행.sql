-- ============================================================
-- ⚠ 이 파일은 **이미 0001~0007 이 깔려 있는 프로젝트**용입니다.
--   헷갈리면 그냥 `SETUP_ALL.sql` 을 쓰세요. 그거 하나로 두 경우 다 됩니다.
--
--   "relation public.daily_report_items does not exist" 같은 에러가 났다면
--   기초 테이블이 없다는 뜻이니 SETUP_ALL.sql 을 쓰셔야 합니다.
--
-- 클로이영어 앱 — 0008 부터의 변경만
--
-- 쓰는 법
--   1. https://supabase.com/dashboard → 프로젝트 선택
--   2. 왼쪽 메뉴 SQL Editor → Untitled query 안을 클릭
--   3. **Ctrl+A 로 전체 선택하고 지운 뒤** 이 파일 내용을 붙여넣기
--      ★ 지난번 내용 아래에 덧붙이지 마세요. 통째로 갈아끼우는 것입니다.
--      — 앱 안에서 바로 복사할 수 있습니다: 설정 → Supabase SQL
--   4. 오른쪽 아래 Run (또는 Cmd/Ctrl + Enter)
--   5. "Success" 가 나오면 끝
--
-- 여러 번 실행해도 안전합니다 — 이미 있는 것은 전부 건너뜁니다.
--
-- ※ 중간에 에러가 나면 **아무것도 반영되지 않습니다** (한 덩어리로 실행되기 때문).
--   DB 가 망가진 게 아니니 원인만 고쳐서 다시 Run 하시면 됩니다.
--   어디서 걸렸는지 모르겠으면 앱의 **설정 → Supabase SQL** 에서 한 개씩 돌려보세요.
--
-- ⚠ 이 파일은 손으로 고치지 마세요.
--   supabase/migrations/ 를 고친 뒤  node scripts/build-setup-sql.mjs  로 다시 만듭니다.
--   (2026-08-23 · 0001~0150 · 148개)
-- ============================================================

-- ─────────── 0008_homework_unit.sql ───────────
-- 0008: 숙제 배정에 교재 단원 연결
--   daily_report_items.textbook_unit_id : 이 숙제가 가리키는 교재 단원 (교재DB의 단원명과 연동)
--   daily_report_items.range_note       : 단원으로 딱 떨어지지 않는 범위 메모 (예: "12~19p, 짝수만")
-- 안전하게 여러 번 실행 가능합니다.

alter table public.daily_report_items
  add column if not exists textbook_unit_id uuid references public.textbook_units(id) on delete set null;

alter table public.daily_report_items
  add column if not exists range_note text;

create index if not exists daily_report_items_unit_idx
  on public.daily_report_items (textbook_unit_id);

-- ─────────── 0009_notices.sql ───────────
-- 0009: 숙제 다중 단원 배정 + 공지/전달사항 + 학습 방법
-- 안전하게 여러 번 실행 가능합니다.

-- ---------- 1) 숙제 하나에 단원 여러 개 ----------
alter table public.daily_report_items
  add column if not exists textbook_unit_ids uuid[];

-- ---------- 2) 공지 · 전달사항 ----------
-- 한 번 써서 전체/반/학교·학년/개인에게 뿌린다. (원칙1: 같은 값 두 번 입력하지 않기)
--   kind = 'deliver' : 수업 중 학생에게 말로 전달할 사항 → 하원 전 전달 체크
--   kind = 'notice'  : 학부모 리포트에 나갈 공지
create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  kind         text not null default 'deliver',
  scope        text not null default 'all',   -- all | class | grade | student
  class_id     uuid references public.classes(id) on delete set null,
  school       text,
  grade        text,
  body         text not null,
  task_id      uuid,                          -- 나중에 할일/일정 DB와 연결할 자리
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists notices_date_idx on public.notices (date);

-- 만들 때 대상 학생을 확정해서 한 줄씩 깔아둔다 → 오늘 수업 화면은 이 표만 읽으면 된다
create table if not exists public.notice_receipts (
  notice_id    uuid not null references public.notices(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  delivered_at timestamptz,
  primary key (notice_id, student_id)
);
create index if not exists notice_receipts_student_idx
  on public.notice_receipts (student_id);

do $$
declare t text;
begin
  foreach t in array array['notices','notice_receipts'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- ---------- 3) 학습 항목별 학습 방법 (학생용 안내) ----------
alter table public.homework_items add column if not exists method text;

-- ─────────── 0010_student_progress.sql ───────────
-- 0010: 학생별 교재 배정 · 단원 진도 (순서 무관 체크)
-- 안전하게 여러 번 실행 가능합니다.
--
-- 설계 메모 (원칙1: 같은 값 두 번 입력하지 않기)
--   교재 단원은 textbook_units 한 곳에만 있다. 학생별로 복사하지 않는다.
--   학생이 "끝낸 단원"만 student_unit_progress 에 한 줄씩 쌓는다.
--   줄이 없으면 = 아직 안 한 단원. 그래서 순서와 무관하게 아무 단원이나 체크할 수 있다.

-- 학생 ← 교재 배정 (반에 교재를 붙이면 그 반 학생 전원에게 자동으로 깔린다)
create table if not exists public.student_textbooks (
  student_id  uuid not null references public.students(id) on delete cascade,
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  assigned_on date not null default current_date,
  status      text not null default 'active',   -- active | done | dropped
  primary key (student_id, textbook_id)
);
create index if not exists student_textbooks_book_idx
  on public.student_textbooks (textbook_id);

-- 학생별 단원 진도 — 완료한(또는 진행중인) 단원만 기록
create table if not exists public.student_unit_progress (
  student_id       uuid not null references public.students(id) on delete cascade,
  textbook_unit_id uuid not null references public.textbook_units(id) on delete cascade,
  status           text not null default 'done',   -- done | doing | skip
  done_on          date default current_date,
  note             text,
  primary key (student_id, textbook_unit_id)
);
create index if not exists student_unit_progress_unit_idx
  on public.student_unit_progress (textbook_unit_id);

do $$
declare t text;
begin
  foreach t in array array['student_textbooks','student_unit_progress'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- ─────────── 0011_page_progress.sql ───────────
-- 0011: 단원을 아직 안 만든 교재의 진도 (페이지로 기록)
-- 단원 데이터를 다 만들기 전에도 "지금 몇 페이지까지"로 진도를 볼 수 있게 한다.
alter table public.student_textbooks
  add column if not exists current_page int;

-- ─────────── 0012_report_send.sql ───────────
-- 0012: 데일리리포트 발송
--   sent_at     : 학부모에게 보낸 시각 (없으면 아직 안 보냄)
--   report_text : 실제로 보낸 문구. 비어 있으면 자동 생성 문구를 쓴다.
--                 선생님이 고쳐서 보내면 여기에 저장되고, 재발송도 이걸 쓴다.
alter table public.daily_reports add column if not exists sent_at timestamptz;
alter table public.daily_reports add column if not exists report_text text;
create index if not exists daily_reports_sent_idx on public.daily_reports (date, sent_at);

-- ─────────── 0013_resend.sql ───────────
-- 0013: 재발송 (숙제 문자 · 데일리리포트 다시 보내기)
--   homework_text     : 고친 숙제 문자. 비어 있으면 자동 생성 문구를 쓴다.
--   homework_sent_at  : 숙제 문자를 마지막으로 보낸 시각
--   report_sends      : 보낸 이력. 몇 번 보냈는지, 그때 뭘 보냈는지 남는다.
alter table public.daily_reports add column if not exists homework_text text;
alter table public.daily_reports add column if not exists homework_sent_at timestamptz;

create table if not exists public.report_sends (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  kind            text not null default 'report',   -- report | homework
  body            text not null,
  sent_at         timestamptz not null default now(),
  sent_by         uuid references public.profiles(id) on delete set null
);
create index if not exists report_sends_report_idx
  on public.report_sends (daily_report_id, kind);

alter table public.report_sends enable row level security;
drop policy if exists staff_all on public.report_sends;
create policy staff_all on public.report_sends
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0014_tasks.sql ───────────
-- 0014: 할일 · 일정 DB
--
-- 속성 정리 (원칙4-1: 만들기 전에 나열하고 불필요한 것 제거)
--   title        할일/일정 이름                       필수
--   kind         todo(할일) | schedule(일정)          필수 — 목록에서 나누는 기준
--   category     학사일정/수업/행정/상담/교재/기타     분류
--   due_on       할일 마감일 · 일정 날짜               필수
--   end_on       여러 날짜에 걸치는 일정의 끝날        선택
--   start_time   시간이 정해진 일정                    선택
--   status       open | done | canceled               필수
--   done_at      완료 시각                             자동
--   class_id     특정 반과 관련된 일정                 선택
--   assignee_id  담당자                                선택
--   note         메모                                  선택
--   deliver_*    이 일정에서 만들 "학생 전달사항"      선택 ← notices 와 연결
--
--   제외: 반복 규칙(아직 안 씀), 우선순위(날짜+상태로 충분), 태그(category로 충분), 첨부

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          text not null default 'todo',      -- todo | schedule
  category      text,
  due_on        date not null default current_date,
  end_on        date,
  start_time    time,
  status        text not null default 'open',      -- open | done | canceled
  done_at       timestamptz,
  class_id      uuid references public.classes(id) on delete set null,
  assignee_id   uuid references public.profiles(id) on delete set null,
  note          text,

  -- 이 일정에서 학생에게 전달할 사항 (비어 있으면 만들지 않는다)
  deliver_body      text,
  deliver_scope     text,                          -- all | class | grade | student
  deliver_class_id  uuid references public.classes(id) on delete set null,
  deliver_school    text,
  deliver_grade     text,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_due_idx on public.tasks (due_on, status);

alter table public.tasks enable row level security;
drop policy if exists staff_all on public.tasks;
create policy staff_all on public.tasks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 일정에서 만든 전달사항을 되짚을 수 있게 (0009 에서 자리만 만들어 둔 컬럼)
alter table public.notices
  add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists notices_task_idx on public.notices (task_id);

-- ─────────── 0015_integrations.sql ───────────
-- 0015: 연동 설정 (문자 발송 · 웹훅 · 학원 정보)
--
-- 환경변수 대신 앱에서 바꾼다. 값이 바뀌어도 재배포가 필요 없다.
--   id      solapi | webhook | academy
--   enabled 이 연동을 쓸지
--   config  jsonb — 키·번호·URL 등 (비밀값 포함, 화면에는 가려서 보여준다)
--
-- 보안: 원장만 읽고 쓸 수 있다. 비밀값은 서버에서만 읽고 화면으로 내려보내지 않는다.

create table if not exists public.integrations (
  id         text primary key,
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.integrations enable row level security;
drop policy if exists principal_all on public.integrations;
create policy principal_all on public.integrations
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  );

-- 발송 결과를 남긴다 (성공/실패 사유)
alter table public.report_sends add column if not exists channel text;   -- copy | sms | webhook
alter table public.report_sends add column if not exists ok boolean;
alter table public.report_sends add column if not exists detail text;
alter table public.report_sends add column if not exists to_phone text;

insert into public.integrations (id, enabled, config) values
  ('academy', true, '{"name":"클로이영어"}'::jsonb)
on conflict (id) do nothing;

-- ─────────── 0016_push.sql ───────────
-- 0016: 앱 알림 (웹 푸시) — 문자 비용 없이 학생·학부모에게 알림
--
--   push_subscriptions : 기기 하나당 한 줄. 알림 허용을 누르면 브라우저가 만들어 준다.
--   보낼 때 필요한 키(VAPID)는 integrations 테이블의 'push' 에 저장한다.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_student_idx
  on public.push_subscriptions (student_id);

alter table public.push_subscriptions enable row level security;

-- 본인 기기는 본인이 등록/삭제, 선생님은 전체 조회 가능
drop policy if exists own_or_staff on public.push_subscriptions;
create policy own_or_staff on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid() or public.is_staff())
  with check (profile_id = auth.uid() or public.is_staff());

-- 학생이 자기 정보를 볼 수 있게 (학생용 페이지)
drop policy if exists student_self on public.students;
create policy student_self on public.students
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

drop policy if exists student_self_reports on public.daily_reports;
create policy student_self_reports on public.daily_reports
  for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
  );

drop policy if exists student_self_items on public.daily_report_items;
create policy student_self_items on public.daily_report_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.daily_reports r
      join public.students s on s.id = r.student_id
      where r.id = daily_report_id and s.profile_id = auth.uid()
    )
  );

-- 숙제 항목·교재 단원은 학생도 읽을 수 있어야 한다 (학습 방법 · 단원명)
drop policy if exists read_all_staff_or_student on public.homework_items;
create policy read_all_staff_or_student on public.homework_items
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbook_units;
create policy read_all_staff_or_student on public.textbook_units
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbooks;
create policy read_all_staff_or_student on public.textbooks
  for select to authenticated using (true);

-- ─────────── 0017_plan_consult_templates.sql ───────────
-- 0017: 결석 예정 · 신규 상담 · 안내 문자 템플릿
-- 안전하게 여러 번 실행 가능합니다.

-- ------------------------------------------------------------
-- 1. 결석 예정 (미리 연락받은 결석)
--
-- 속성 정리: 새 상태값을 만들지 않고 기존 'absent' 에 표시만 더한다.
--   planned = true  → 미리 연락받음 (당일 결석과 구분)
--   reason          → 사유 (학교 행사 / 병원 / 가족 일정 …)
--   makeup_of       → 이미 있는 컬럼. 보강일을 잡으면 그 날짜 행에 원 결석일이 들어간다.
-- 이렇게 하면 출결 집계·보강 안내가 지금 구조 그대로 돌아간다.
-- ------------------------------------------------------------
alter table public.attendance add column if not exists planned boolean not null default false;
alter table public.attendance add column if not exists reason  text;
create index if not exists attendance_planned_idx on public.attendance (date, planned);


-- ------------------------------------------------------------
-- 2. 신규 상담 (문의 → 상담 → 레벨테스트 → 등록)
--
-- 속성 정리
--   name/phone            필수 — 이것만 있으면 접수된다
--   school/grade          상담 준비에 필요
--   source                유입경로 (블로그/소개/전단/검색/방문)
--   status                new | scheduled | consulted | tested | enrolled | hold | declined
--   consult_on/at         상담 예정 일시
--   test_on/at            레벨테스트 예정 일시
--   test_result/test_note 테스트 결과
--   want_days/want_time   희망 요일·시간 (반 배정 판단)
--   class_id              배정하려는 반
--   student_id            등록으로 전환되면 연결 (원칙1: 이름을 다시 안 적는다)
--   memo                  상담 내용
--   제외: 주소·형제자매·직업 등 (지금 쓰지 않음)
-- ------------------------------------------------------------
create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  student_phone text,
  school      text,
  grade       text,
  source      text,
  status      text not null default 'new',
  consult_on  date,
  consult_at  time,
  test_on     date,
  test_at     time,
  test_result text,
  test_note   text,
  want_days   text[],
  want_time   text,
  class_id    uuid references public.classes(id) on delete set null,
  student_id  uuid references public.students(id) on delete set null,
  memo        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create index if not exists inquiries_test_idx   on public.inquiries (test_on);


-- ------------------------------------------------------------
-- 3. 안내 문자 템플릿
--
-- 교재 구매 안내, 레벨테스트 등원·하원 안내처럼 정형화된 문자를 미리 써둔다.
-- 본문에 {{변수}} 를 넣으면 보낼 때 실제 값으로 바뀐다.
--   {{학원명}} {{학생명}} {{날짜}} {{시간}}
--   {{교재목록}} {{교재비}} {{구매링크}}   ← 교재 구매 안내용
--   {{테스트결과}}                        ← 레벨테스트용
-- ------------------------------------------------------------
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'general',  -- book | test_in | test_out | general
  body       text not null,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 같은 이름이 두 번 들어가지 않게 한다.
-- 이 파일을 여러 번 실행하면 아래 seed 가 매번 새로 꽂혀서
-- '교재 구매 안내' 가 3개, 4개로 늘어나고 있었다. 있던 중복은 여기서 정리한다.
delete from public.message_templates a
 using public.message_templates b
 where a.name = b.name and a.ctid > b.ctid;
create unique index if not exists message_templates_name_idx
  on public.message_templates (name) where active;

insert into public.message_templates (name, kind, body, sort) values
  ('교재 구매 안내', 'book',
   '[{{학원명}}] {{학생명}} 학생 교재 안내

이번에 사용할 교재입니다.

{{교재목록}}

구매: {{구매링크}}

구매가 어려우시면 학원으로 말씀해주세요.', 10),
  ('레벨테스트 등원 안내', 'test_in',
   '[{{학원명}}] {{학생명}} 학생이 레벨테스트를 위해 도착했습니다.

테스트는 약 40분 정도 걸리며, 끝나면 다시 안내드리겠습니다.', 20),
  ('레벨테스트 하원 안내', 'test_out',
   '[{{학원명}}] {{학생명}} 학생 레벨테스트가 끝나 하원했습니다.

{{테스트결과}}

상담 일정은 따로 연락드리겠습니다. 감사합니다.', 30)
on conflict (name) where active do nothing;


-- ------------------------------------------------------------
-- 4. 권한
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['inquiries','message_templates'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- ─────────── 0018_tuition_apply.sql ───────────
-- 0018: 수강료 계산 (회차 기준) · 학부모 신청 양식
-- 안전하게 여러 번 실행 가능합니다.

-- ------------------------------------------------------------
-- 1. 휴강일
--    scope = all  : 전체 휴강 (명절·학원 사정)
--    scope = class: 특정 반만 휴강
-- ------------------------------------------------------------
create table if not exists public.holidays (
  id       uuid primary key default gen_random_uuid(),
  date     date not null,
  name     text,
  scope    text not null default 'all',   -- all | class
  class_id uuid references public.classes(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists holidays_date_idx on public.holidays (date);


-- ------------------------------------------------------------
-- 2. 수강료 단가
--    classes.tuition       월 수강료 (원)
--    classes.base_sessions 기준 회차. 비우면 그 달 정상 회차를 기준으로 본다.
--    students.tuition      이 학생만 다른 금액을 받을 때 (형제 할인 등)
--    students.started_on   등원 시작일 — 달 중간에 시작하면 회차가 줄어든다
--    students.ended_on     퇴원일
-- ------------------------------------------------------------
alter table public.classes  add column if not exists tuition       int;
alter table public.classes  add column if not exists base_sessions int;
alter table public.students add column if not exists tuition       int;
alter table public.students add column if not exists started_on    date;
alter table public.students add column if not exists ended_on      date;


-- ------------------------------------------------------------
-- 3. 학부모 신청 양식
--    전화로 이름만 받아두고 링크를 보내면, 학부모가 직접 채운다.
--    양식을 안 내고 바로 오는 경우도 있어서 전부 선택 입력이다.
--    form_submitted_at 이 비어 있으면 "양식 미제출" 로 표시된다.
-- ------------------------------------------------------------
alter table public.inquiries add column if not exists form_submitted_at timestamptz;
alter table public.inquiries add column if not exists prev_academy   text;   -- 이전 학원 / 학습 경험
alter table public.inquiries add column if not exists goal           text;   -- 목표·요청사항
alter table public.inquiries add column if not exists want_days_text text;   -- 희망 요일 (자유 입력)
alter table public.inquiries add column if not exists visit_on       date;   -- 학부모 방문상담 희망일
alter table public.inquiries add column if not exists visit_at       time;
alter table public.inquiries add column if not exists visit_alt      text;   -- 다른 가능 시간
alter table public.inquiries add column if not exists test_want_on   date;   -- 레벨테스트 희망일
alter table public.inquiries add column if not exists test_want_at   time;
alter table public.inquiries add column if not exists token          text;   -- 양식 링크 식별자

create unique index if not exists inquiries_token_idx on public.inquiries (token)
  where token is not null;


-- ------------------------------------------------------------
-- 4. 권한
-- ------------------------------------------------------------
alter table public.holidays enable row level security;
drop policy if exists staff_all on public.holidays;
create policy staff_all on public.holidays
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학부모가 로그인 없이 양식을 제출할 수 있게 (넣기만 가능, 읽기는 불가)
drop policy if exists anon_apply_insert on public.inquiries;
create policy anon_apply_insert on public.inquiries
  for insert to anon
  with check (true);

-- 링크(token)로 접수 건을 채워 넣는 경우도 허용 (해당 건만)
drop policy if exists anon_apply_update on public.inquiries;
create policy anon_apply_update on public.inquiries
  for update to anon
  using (token is not null)
  with check (token is not null);


-- ------------------------------------------------------------
-- 5. 교재 안내 문자에서 교재비 제거 (학원에서 교재비를 따로 받지 않음)
-- ------------------------------------------------------------
update public.message_templates
set body = '[{{학원명}}] {{학생명}} 학생 교재 안내

이번에 사용할 교재입니다.

{{교재목록}}

구매: {{구매링크}}

구매가 어려우시면 학원으로 말씀해주세요.'
where kind = 'book' and body like '%교재비%';

-- ─────────── 0019_requests_bookuse.sql ───────────
-- 0019: 일정 ↔ 결석예정 연결 · 학생/학부모 요청 · 교재 사용 기록 · 문구 설정
-- 안전하게 여러 번 실행 가능합니다. (테이블을 지우는 구문은 없습니다)

-- ------------------------------------------------------------
-- 1. 일정(tasks)을 상위 개념으로 — 하나의 일정에서 세 가지가 파생된다
--      deliver_body        → 학생 전달사항 (이미 있음)
--      notice_body         → 학부모 공지
--      absence_student_ids → 결석 예정 (due_on ~ end_on 기간 전체)
-- ------------------------------------------------------------
alter table public.tasks add column if not exists notice_body         text;
alter table public.tasks add column if not exists absence_student_ids uuid[];
alter table public.tasks add column if not exists absence_reason      text;
alter table public.tasks add column if not exists applied_at          timestamptz;


-- ------------------------------------------------------------
-- 2. 학생 · 학부모가 직접 넣는 요청
--    결석 알림, 보강 요청, 질문. 선생님이 확인하면 결석 예정으로 반영된다.
-- ------------------------------------------------------------
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  kind        text not null default 'absence',   -- absence | makeup | question
  from_date   date,
  to_date     date,
  body        text,
  status      text not null default 'new',       -- new | accepted | declined | done
  reply       text,
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests (status, created_at desc);
create index if not exists requests_student_idx on public.requests (student_id);


-- ------------------------------------------------------------
-- 3. 교재 사용 기록 — "사용중"이 두 가지라서 나눈다
--      textbooks.status         학원 차원 (사용중 / 절판 / 중단)
--      student_textbooks.status 학생 차원 (사용중 / 완료 / 중단)  ← 이미 있음
--    끝낸 교재는 재원생 기록에만 남고, 숙제 배정·진도 화면에서는 빠진다.
-- ------------------------------------------------------------
alter table public.student_textbooks add column if not exists ended_on date;
alter table public.student_textbooks add column if not exists note     text;


-- ------------------------------------------------------------
-- 4. 문구 설정 (인삿말·맺음말·연락처) — 앱에서 바꾼다
-- ------------------------------------------------------------
insert into public.integrations (id, enabled, config) values
  ('message', true, '{"greeting":"","closing":"","phone":"","address":""}'::jsonb)
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 5. 권한
-- ------------------------------------------------------------
alter table public.requests enable row level security;

-- 선생님은 전부, 학생·학부모는 자기 것만
drop policy if exists staff_all on public.requests;
create policy staff_all on public.requests
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_requests on public.requests;
create policy own_requests on public.requests
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = requests.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_requests_insert on public.requests;
create policy own_requests_insert on public.requests
  for insert to authenticated
  with check (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = requests.student_id and ps.parent_profile_id = auth.uid()
    )
  );

-- 학생·학부모가 자기 반 정보를 읽을 수 있게 (결석 알릴 날짜 판단용)
drop policy if exists read_classes_all on public.classes;
create policy read_classes_all on public.classes
  for select to authenticated using (true);

drop policy if exists read_class_students on public.class_students;
create policy read_class_students on public.class_students
  for select to authenticated using (true);

-- ─────────── 0020_todo_schedule.sql ───────────
-- 0020: 할일과 일정을 나눈다 · 할일 분류를 직접 관리
--
-- 나누는 기준
--   일정(schedule) : 날짜·시간이 정해진 것 (학사일정, 특강, 시험, 상담 예약, 휴강)
--   할일(todo)     : 내가 해야 하는 것 (마감일은 있을 수도, 없을 수도)
--
-- 할일은 분류를 직접 만들어 쓴다 (원칙4-6: 자주 바뀌는 항목은 마스터 테이블로)
-- 하위 할일(parent_id)로 큰 일을 쪼갤 수 있다.

create table if not exists public.todo_categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  parent_id uuid references public.todo_categories(id) on delete cascade,
  color     text,                       -- sky | lav | mint | amber | muted
  sort      int not null default 0,
  active    boolean not null default true
);
create index if not exists todo_categories_parent_idx on public.todo_categories (parent_id);

-- 같은 이름이 두 번 들어가지 않게 (여러 번 실행하면 아래 기본 분류가 계속 늘어났다)
delete from public.todo_categories a
 using public.todo_categories b
 where a.name = b.name and a.parent_id is not distinct from b.parent_id and a.ctid > b.ctid;
create unique index if not exists todo_categories_name_idx
  on public.todo_categories (name) where active and parent_id is null;

alter table public.tasks add column if not exists todo_category_id uuid
  references public.todo_categories(id) on delete set null;
alter table public.tasks add column if not exists parent_id uuid
  references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists priority int not null default 0;  -- 0 보통 / 1 중요 / 2 급함
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists no_due boolean not null default false;

create index if not exists tasks_kind_idx on public.tasks (kind, status, due_on);
create index if not exists tasks_parent_idx on public.tasks (parent_id);

-- 기본 분류 (지우거나 이름을 바꿔도 됩니다)
insert into public.todo_categories (name, color, sort) values
  ('수업 준비', 'sky', 10),
  ('교재 · 자료', 'mint', 20),
  ('학부모 응대', 'lav', 30),
  ('신규 상담', 'amber', 40),
  ('행정 · 정산', 'muted', 50),
  ('홍보 · 블로그', 'lav', 60),
  ('시설 · 비품', 'muted', 70),
  ('기타', 'muted', 90)
on conflict (name) where active and parent_id is null do nothing;

alter table public.todo_categories enable row level security;
drop policy if exists staff_all on public.todo_categories;
create policy staff_all on public.todo_categories
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0021_exams.sql ───────────
-- 0021: 학교 시험 일정
--
-- 입력이 두 단계로 들어온다
--   1차: 시험 **기간** 만 안다 (학교에서 먼저 알려주는 것)
--        → 그 기간의 정규수업은 타과목 시험 때문에 **결석 예상**
--   2차: **영어 시험일** 이 확정된다
--        → 그 **전날**은 정규수업이 아니어도 등원해야 한다
--
-- 속성 정리
--   school     필수 — 학교마다 시험이 다르다
--   grade      비우면 그 학교 전체 학년
--   name       1학기 중간고사 / 2학기 기말고사 …
--   from_date  ~ to_date   시험 기간 (1차)
--   english_on 영어 시험일 (2차, 나중에 채운다)
--   제외: 과목별 전체 일정 (영어만 알면 된다), 시험 범위(교재 단원으로 대체)

create table if not exists public.exam_periods (
  id         uuid primary key default gen_random_uuid(),
  school     text not null,
  grade      text,
  name       text,
  from_date  date not null,
  to_date    date not null,
  english_on date,
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists exam_periods_range_idx on public.exam_periods (from_date, to_date);

alter table public.exam_periods enable row level security;
drop policy if exists staff_all on public.exam_periods;
create policy staff_all on public.exam_periods
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모도 자기 학교 시험 일정을 볼 수 있게
drop policy if exists read_exams on public.exam_periods;
create policy read_exams on public.exam_periods
  for select to authenticated using (true);

-- ─────────── 0022_exam_seed_2026.sql ───────────
-- 0022: 2026년 학교 시험 일정 (노션 학사일정DB에서 옮김)
--
-- 노션에는 시험 기간과 영어 시험일이 **따로 적혀 있었다.**
--   "신송중 2회고사"  2026-07-01 ~ 07-03   ← 기간
--   "신송중 영어시험"  2026-07-04          ← 영어 시험일
-- 여기서는 학교로 짝을 지어 한 줄로 합쳤다.
--
-- 1회고사(4월)에는 영어 시험일 기록이 노션에 없어서 비워 두었다.
-- 나중에 `수업 스케줄 · 시험` 화면에서 채워 넣으면 된다.
--
-- 박문중은 2회고사 기간이 노션에 없고 영어 시험일(07-07)만 있었다.
-- 기간을 몰라 그날 하루로 넣어 두었으니 확인 후 고쳐주세요.
--
-- 여러 번 실행해도 같은 시험이 두 번 들어가지 않는다.

create unique index if not exists exam_periods_uniq
  on public.exam_periods (school, coalesce(grade,''), from_date);

insert into public.exam_periods (school, grade, name, from_date, to_date, english_on, note) values
  -- 1학기 중간고사 (영어 시험일 기록 없음)
  ('해송고',   null, '1학기 중간고사', '2026-04-27', '2026-04-30', null, '노션 이관'),
  ('은송중',   null, '1학기 중간고사', '2026-04-27', '2026-04-28', null, '노션 이관'),
  ('현송중',   null, '1학기 중간고사', '2026-04-27', '2026-04-28', null, '노션 이관'),
  ('연송고',   null, '1학기 중간고사', '2026-04-27', '2026-04-30', null, '노션 이관'),
  ('신정중',   null, '1학기 중간고사', '2026-04-28', '2026-04-29', null, '노션 이관'),
  ('연수여고', null, '1학기 중간고사', '2026-04-28', '2026-04-30', null, '노션 이관'),
  ('옥련여고', null, '1학기 중간고사', '2026-04-28', '2026-05-01', null, '노션 이관'),
  ('신송중',   null, '1학기 중간고사', '2026-04-29', '2026-04-30', null, '노션 이관'),
  ('박문중',   null, '1학기 중간고사', '2026-04-29', '2026-04-30', null, '노션 이관'),

  -- 1학기 기말고사 (영어 시험일까지 있음)
  ('옥련여고', null, '1학기 기말고사', '2026-06-30', '2026-07-03', '2026-07-03', '노션 이관'),
  ('신송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-04', '노션 이관'),
  ('신정중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('은송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('현송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('연송고',   null, '1학기 기말고사', '2026-07-02', '2026-07-07', null,         '노션 이관 · 영어 시험일 기록 없음'),
  ('연수여고', null, '1학기 기말고사', '2026-07-02', '2026-07-07', '2026-07-04', '노션 이관'),
  ('해송고',   null, '1학기 기말고사', '2026-07-02', '2026-07-07', '2026-07-04', '노션 이관'),
  ('박문중',   null, '1학기 기말고사', '2026-07-07', '2026-07-07', '2026-07-07', '노션에 기간이 없어 영어 시험일 하루만 넣음 — 확인 필요'),

  -- 2학기 (신정중만 노션에 있음)
  ('신정중',   null, '2학기 중간고사', '2026-10-28', '2026-10-30', null, '노션 이관'),
  ('신정중',   null, '2학기 기말고사', '2026-12-14', '2026-12-16', null, '노션 이관')
on conflict do nothing;

-- ─────────── 0023_report_comments.sql ───────────
-- 0023: 숙제 · 데일리리포트에 댓글
--
-- 지금은 학부모가 문자를 받고 **답장할 데가 없다.** 전화나 카톡으로 오면
-- 기록이 흩어진다. 그래서 리포트 한 줄에 댓글을 붙인다.
--
-- 속성 정리 (원칙4-1)
--   daily_report_id  어느 날 어느 학생의 리포트인가            필수
--   student_id       RLS 를 단순하게 하려고 같이 둔다          필수
--   author_id        쓴 사람 (profiles)                        필수
--   author_role      staff | student | parent — 화면 구분용    필수
--   body             내용                                      필수
--   read_at          선생님이 읽은 시각 (안 읽은 것만 보려고)
--   제외: 대댓글(스레드), 첨부, 수정 이력 — 지금 필요 없다
--
-- 학생·학부모는 **자기 것만** 읽고 쓴다. 남의 리포트는 보이지 않는다.

create table if not exists public.report_comments (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  author_role     text not null default 'staff',   -- staff | student | parent
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists report_comments_report_idx
  on public.report_comments (daily_report_id, created_at);
create index if not exists report_comments_unread_idx
  on public.report_comments (read_at, created_at);

alter table public.report_comments enable row level security;

-- 선생님은 전부
drop policy if exists staff_all on public.report_comments;
create policy staff_all on public.report_comments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 자기 것만 읽기
drop policy if exists own_comments_read on public.report_comments;
create policy own_comments_read on public.report_comments
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = report_comments.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = report_comments.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 학생·학부모는 자기 것에만 쓰기 (author_id 를 남의 것으로 못 적게 같이 검사)
drop policy if exists own_comments_write on public.report_comments;
create policy own_comments_write on public.report_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.students s
              where s.id = report_comments.student_id and s.profile_id = auth.uid())
      or exists (select 1 from public.parent_student ps
                 where ps.student_id = report_comments.student_id
                   and ps.parent_profile_id = auth.uid())
    )
  );

-- 자기가 쓴 댓글은 지울 수 있다 (잘못 쓴 경우)
drop policy if exists own_comments_delete on public.report_comments;
create policy own_comments_delete on public.report_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- 학부모가 자기 자녀 연결을 확인할 수 있게 (없으면 댓글 권한 판정이 막힌다)
drop policy if exists own_parent_link on public.parent_student;
create policy own_parent_link on public.parent_student
  for select to authenticated
  using (parent_profile_id = auth.uid() or public.is_staff());

-- ─────────── 0024_warnings_stay.sql ───────────
-- 0024: 경고 · 반성문 · 오늘 마무리(늦귀가과제)
--
-- ── 경고 ────────────────────────────────────────────────────
-- 규칙: 지각 / 숙제 미제출·미흡 / 단어시험 미통과 → 경고 1회. 3회 누적 → 반성문.
--
-- 경고를 테이블에 따로 쌓지 않는다. 이미 데일리리포트에 다 있기 때문이다.
--   지각        → attendance_kind = 'late'
--   숙제        → daily_report_items.status = 'missing' | 'weak'
--   단어시험    → word_correct / word_total 이 통과선 미달
-- 매번 계산하면 되고, 그래야 리포트를 고쳤을 때 경고도 같이 맞는다.
--
-- 대신 **사람이 내린 판단만** 저장한다. 이건 계산으로 알 수 없다.
--   waive      그 날 경고를 없던 것으로 (사정이 있었다)
--   reflection 반성문을 썼다 → 여기까지 정산, 다음 경고부터 새로 센다
--   defer      3회가 됐지만 이번엔 넘어간다 → 정산은 하되 '유예' 로 남는다
--
-- ── 오늘 마무리 ─────────────────────────────────────────────
-- 숙제를 안 했거나 그날 학습이 부족하면 남아서 채우고 간다.
-- 미흡·미제출을 찍으면 자동으로 목록에 올라오고, 다 못하면 숙제로 넘기거나 넘어간다.
-- 학생용 페이지에서도 보인다.

-- ------------------------------------------------------------
-- 1. 경고에 대한 판단 기록
-- ------------------------------------------------------------
create table if not exists public.warning_actions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        text not null,          -- waive | reflection | defer
  on_date     date not null,          -- 판단한 날 (정산 기준점)
  target_date date,                   -- waive 일 때: 어느 날 경고를 없앨지
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists warning_actions_student_idx
  on public.warning_actions (student_id, on_date);

alter table public.warning_actions enable row level security;
drop policy if exists staff_all on public.warning_actions;
create policy staff_all on public.warning_actions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 자기 것만 읽기 (문자에 나가는 내용이라 봐도 된다)
drop policy if exists own_read on public.warning_actions;
create policy own_read on public.warning_actions
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = warning_actions.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = warning_actions.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 2. 오늘 마무리 (늦귀가과제)
--
--   status  todo    남아서 할 것
--           done    다 함
--           moved   못 끝내서 숙제로 넘김
--           skipped 오늘은 넘어감
-- ------------------------------------------------------------
create table if not exists public.stay_tasks (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  body             text not null,
  status           text not null default 'todo',
  auto             boolean not null default false,   -- 미흡·미제출에서 자동으로 올라온 것
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);
create index if not exists stay_tasks_student_date_idx
  on public.stay_tasks (student_id, date);
create index if not exists stay_tasks_date_idx on public.stay_tasks (date, status);

alter table public.stay_tasks enable row level security;
drop policy if exists staff_all on public.stay_tasks;
create policy staff_all on public.stay_tasks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.stay_tasks;
create policy own_read on public.stay_tasks
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = stay_tasks.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = stay_tasks.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 3. 경고 기준을 설정에서 바꿀 수 있게
--    (단어시험 통과선, 반성문까지 몇 회인지)
-- ------------------------------------------------------------
insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordPassPct":80,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ─────────── 0025_word_test.sql ───────────
-- 0025: 단어시험 방식 (학생마다 · 교재마다 · 회독마다 다르다)
--
-- 단어시험은 학생마다 보는 방법이 다르다. 개수는 정해져 있지 않고,
-- **네 가지 유형이 합쳐서 100%** 가 되게 배분한다. 0인 것도 있다.
--
--   객관식 뜻      영단어를 주고 뜻을 고른다
--   주관식 뜻      영단어를 주고 뜻을 쓴다
--   객관식 영단어  뜻을 주고 영단어를 고른다
--   주관식 영단어  뜻을 주고 영단어를 쓴다 — 첫 글자 힌트가 있을 수도, 없을 수도
--
-- 언제 정하나
--   · 그 교재를 **시작할 때** 한 번
--   · 진도를 다 끝내고 **한 번 더 돌릴 때(2회독)** 다시. 보통 더 어렵게 바꾼다
--
-- 그래서 (학생, 교재, 회독) 하나에 설정 한 줄이다.

create table if not exists public.word_test_settings (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  textbook_id  uuid not null references public.textbooks(id) on delete cascade,
  round        int  not null default 1,      -- 몇 회독째

  -- 네 가지 배분 (합이 100 이 되게 화면에서 잡아준다)
  mc_meaning   int not null default 0,       -- 객관식 뜻
  sa_meaning   int not null default 0,       -- 주관식 뜻
  mc_word      int not null default 0,       -- 객관식 영단어
  sa_word      int not null default 0,       -- 주관식 영단어

  first_hint   boolean not null default false, -- 주관식 영단어 첫 글자 힌트
  started_on   date default current_date,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (student_id, textbook_id, round)
);
create index if not exists word_test_settings_student_idx
  on public.word_test_settings (student_id, textbook_id);

alter table public.word_test_settings enable row level security;
drop policy if exists staff_all on public.word_test_settings;
create policy staff_all on public.word_test_settings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모도 자기 것은 볼 수 있게 (어떻게 시험 보는지 알아야 준비한다)
drop policy if exists own_read on public.word_test_settings;
create policy own_read on public.word_test_settings
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = word_test_settings.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = word_test_settings.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 지금 몇 회독째인지 (교재를 다 끝내고 다시 돌리면 올린다)
alter table public.student_textbooks add column if not exists round int not null default 1;


-- ------------------------------------------------------------
-- 경고 기준 정정
--   단어시험은 **오답 10% 이내면 통과** 다 (맞은 비율이 아니라 틀린 비율).
--   0001 스키마의 pass_threshold_pct 주석과 같은 뜻.
--   예전에 넣어둔 wordPassPct(맞은 비율) 는 뜻이 반대라 지운다.
-- ------------------------------------------------------------
update public.integrations
   set config = (config - 'wordPassPct') || '{"wordWrongPct":10}'::jsonb
 where id = 'warning';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ─────────── 0026_round_progress_reset.sql ───────────
-- 0026: 회독별 진도 기록 + 경고 월간 초기화
--
-- ── 회독 진도를 지우지 않는다 ────────────────────────────────
-- 0025 에서 "다음 회독으로" 를 누르면 끝낸 단원을 **지웠다.**
-- 그러면 1회독을 언제 어디까지 했는지가 사라진다.
-- 이제는 지우지 않고 회독을 붙여서 **쌓는다.**
--   (학생, 단원, 회독) 하나에 한 줄. 2회독은 빈 상태로 시작하고,
--   1회독 기록은 그대로 남아서 학생 기록에서 볼 수 있다.

alter table public.student_unit_progress
  add column if not exists round int not null default 1;

-- 기본키를 (학생, 단원) → (학생, 단원, 회독) 으로 넓힌다
alter table public.student_unit_progress
  drop constraint if exists student_unit_progress_pkey;
alter table public.student_unit_progress
  add constraint student_unit_progress_pkey
  primary key (student_id, textbook_unit_id, round);

create index if not exists student_unit_progress_round_idx
  on public.student_unit_progress (student_id, round);


-- ── 경고 월간 초기화 ────────────────────────────────────────
-- 한 달에 한 번 쌓인 경고를 0으로 되돌린다.
-- warning_actions 에 kind = 'reset' 한 줄을 남기는 것으로 끝난다.
-- 스키마를 바꿀 필요가 없다 — kind 는 원래 자유 문자열이다.
--   waive      그 날 경고만 빼기
--   reflection 반성문 씀
--   defer      이번엔 넘어감 (유예)
--   reset      월간 초기화        ← 여기서 추가
-- 어느 쪽이든 **기록은 지워지지 않는다.** 경고가 몇 회였고 언제 정리했는지
-- 학생 기록에 그대로 남는다. 다음 달 카운트만 0에서 시작한다.
comment on column public.warning_actions.kind is
  'waive | reflection | defer | reset — 사람이 내린 판단. 경고 자체는 리포트에서 계산한다';

-- "이번 달은 그냥 둘게요" 를 눌렀을 때 그 달을 기억해 둔다 (알림이 다시 안 뜨게)
insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ─────────── 0027_late_notice.sql ───────────
-- 0027: 늦은 귀가 안내 (하원 안내 문자)
--
-- 남아서 단어 재시험을 보거나 숙제를 마저 하고 가면 평소보다 늦게 나간다.
-- 데리러 오시는 학부모께는 **수업 중에** 알려드려야 의미가 있다.
--
-- 자동으로 잡히는 사유
--   · 단어시험 미통과   → 재시험을 보고 간다
--   · 숙제 미제출·미흡  → 오늘 마무리로 남는다
-- 원장님은 **하원 예상 시간만** 고르면 된다.
--
-- 그 밖의 사유(상담, 보강, 학교 행사 …)는 직접 적어서 보낸다.
--
-- 하루에 학생 한 명당 한 번이므로 daily_reports 에 붙인다.
-- 데일리리포트·숙제 문자와 같은 자리에서 발송 이력이 남는다.

alter table public.daily_reports
  add column if not exists late_until   text,          -- 하원 예상 시간 "21:30"
  add column if not exists late_reason  text,          -- 직접 적은 사유 (자동 사유는 계산한다)
  add column if not exists late_text    text,          -- 손으로 고친 문구
  add column if not exists late_sent_at timestamptz;   -- 보낸 시각

comment on column public.daily_reports.late_until is
  '하원 예상 시간 (HH:MM). 값이 있으면 늦은 귀가 안내 대상이다';

-- 발송 이력의 kind 에 'late' 가 하나 늘어난다.
-- report_sends.kind 는 자유 문자열이라 스키마는 그대로다.
comment on column public.report_sends.kind is
  'report | homework | late — 어떤 문자였는지';

-- ─────────── 0028_prep_task.sql ───────────
-- 0028: 숙제를 배정하면 **내 할일**이 자동으로 생긴다
--
-- 단원평가 대비 복습을 숙제로 내주면, 다음 수업 전에 **내가 문제를 출제해야 한다.**
-- 지금까지는 그걸 따로 기억하고 있어야 했다.
--
-- 그래서 숙제 항목에 "이걸 배정하면 이런 할일이 생긴다" 를 적어둔다.
-- 이름을 코드에 박지 않는다 — 나중에 다른 숙제에도 붙일 수 있어야 하기 때문이다.
--   예) 단원평가 대비 복습  →  "{학생} 단원평가 출제"
--       수행평가대비 워크북  →  "{학생} 수행평가 자료 준비"
-- {학생} 자리에 학생 이름이 들어간다. 비워두면 할일을 만들지 않는다.

alter table public.homework_items
  add column if not exists prep_task text;

comment on column public.homework_items.prep_task is
  '이 숙제를 배정하면 만들 내 할일의 제목. {학생} 은 학생 이름으로 바뀐다. 비면 안 만든다';

-- 같은 배정으로 할일이 두 번 생기지 않게 (리포트를 여러 번 저장해도 하나)
alter table public.tasks
  add column if not exists auto_key text;
create unique index if not exists tasks_auto_key_idx
  on public.tasks (auto_key) where auto_key is not null;

comment on column public.tasks.auto_key is
  '자동으로 만든 할일의 열쇠. 값이 있으면 앱이 만든 것이다 (사람이 만든 건 비어 있다)';

-- 단원평가 대비 복습이 아직 없으면 만들어 둔다
insert into public.homework_items (name, category, sort) values
  ('단원평가 대비 복습', '내신', 590)
on conflict (name) do nothing;

-- 이름에 '단원평가' 가 들어간 항목은 출제 할일을 켜준다 (직접 껐으면 그대로 둔다)
update public.homework_items
   set prep_task = '{학생} 단원평가 출제'
 where prep_task is null
   and name like '%단원평가%';

-- ─────────── 0029_message_kinds.sql ───────────
-- 0029: 문자 문구를 종류별로 나눈다
--
-- 지금까지 인삿말·맺음말이 **하나뿐**이라 데일리리포트에도, 숙제 문자에도,
-- 하원 안내에도 같은 말이 붙었다. 종류마다 톤이 다른데 그럴 수가 없었다.
--
-- 문자를 두 갈래로 본다.
--
--   ① 앱이 본문을 만드는 것 (key 가 있다)
--      데일리리포트 · 숙제 문자 · 하원 안내
--      본문은 그날 입력에서 자동으로 만들어진다. 손댈 것은 인삿말·맺음말뿐이다.
--
--   ② 내가 본문을 쓰는 것 (key 가 없다)
--      교재 안내 · 지각 안내 · 보강 안내 · 단원평가 결과 · 상담 일정 …
--      {{변수}} 를 넣어두면 보낼 때 채워진다.
--
-- 둘 다 **설정 → 문자 문구** 한 곳에서 추가·수정·삭제한다. 코드에는 없다.

alter table public.message_templates
  add column if not exists key      text,   -- report | homework | late (앱이 본문을 만드는 것)
  add column if not exists greeting text,
  add column if not exists closing  text;

create unique index if not exists message_templates_key_idx
  on public.message_templates (key) where key is not null;

comment on column public.message_templates.key is
  '앱이 본문을 자동으로 만드는 문자. 값이 있으면 본문은 못 고치고 인삿말·맺음말만 고친다';


-- ------------------------------------------------------------
-- ① 앱이 만드는 문자 — 자리를 만들어 둔다
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, key, body, sort) values
  ('데일리리포트',      'auto', 'report',   '', 10),
  ('숙제 문자 (학생용)', 'auto', 'homework', '', 20),
  ('늦은 귀가 안내',     'auto', 'late',     '', 30)
on conflict (key) where key is not null do nothing;   -- 부분 유니크 인덱스라 조건을 같이 적어야 한다

-- 예전에 한 곳에 적어둔 인삿말·맺음말을 데일리리포트로 옮긴다 (한 번만)
update public.message_templates t
   set greeting = coalesce(t.greeting, i.config->>'greeting'),
       closing  = coalesce(t.closing,  i.config->>'closing')
  from public.integrations i
 where i.id = 'message'
   and t.key = 'report'
   and t.greeting is null
   and t.closing is null;


-- ------------------------------------------------------------
-- ② 내가 쓰는 문자 — 아직 없는 것만 만들어 둔다
--    문구는 초안입니다. 설정 화면에서 원장님 말투로 고쳐 쓰세요.
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, body, sort)
select v.name, v.kind, v.body, v.sort
  from (values
    ('지각 안내', 'late_in',
     '[{{학원명}}] {{학생명}} 학생 등원 안내

{{학생명}} 학생이 {{시간}}에 등원했습니다.
수업에 늦지 않도록 가정에서도 한 번 챙겨주시면 감사하겠습니다.', 40),

    ('보강 안내', 'makeup',
     '[{{학원명}}] {{학생명}} 학생 보강 안내

{{날짜}} {{시간}} 으로 보강 일정을 잡았습니다.

{{내용}}

시간이 어려우시면 말씀해주세요.', 50),

    ('단원평가 결과 안내', 'exam',
     '[{{학원명}}] {{학생명}} 학생 단원평가 결과

{{내용}}

부족한 부분은 다음 수업에서 다시 짚어주겠습니다.', 60),

    ('신규 상담 · 레벨테스트 일정 안내', 'consult',
     '[{{학원명}}] {{학생명}} 학생 상담 안내

문의해주셔서 감사합니다.

▶ 일시: {{날짜}} {{시간}}
▶ 장소: {{학원주소}}

{{내용}}

변경이 필요하시면 편하게 연락주세요.', 70)
  ) as v(name, kind, body, sort)
 where not exists (
   select 1 from public.message_templates m where m.name = v.name
 );

-- ─────────── 0030_alimtalk.sql ───────────
-- 0030: 알림톡 연결 · 할일 제목에 단원 넣기
--
-- ── 알림톡 ──────────────────────────────────────────────────
-- 알림톡은 **미리 승인받은 템플릿**으로만 나간다. 본문을 마음대로 못 쓴다.
-- 대신 템플릿 안의 #{변수} 는 보낼 때 채울 수 있다.
--
-- 그래서 문자 종류마다 두 가지를 적어둔다.
--   · 알림톡 템플릿 코드  — 카카오에서 승인받을 때 받은 코드
--   · 변수 연결          — 템플릿의 #{변수} 를 앱의 어떤 값에 붙일지
--
--     { "#{학생명}": "{{학생명}}", "#{내용}": "{{본문}}" }
--
-- 코드를 안 적으면 지금처럼 문자로 나간다. 종류마다 따로 정할 수 있다.
-- (데일리리포트만 알림톡, 나머지는 문자 — 이런 것도 된다)

alter table public.message_templates
  add column if not exists alimtalk_id   text,
  add column if not exists alimtalk_vars jsonb not null default '{}'::jsonb;

comment on column public.message_templates.alimtalk_id is
  '카카오에서 승인받은 알림톡 템플릿 코드. 비어 있으면 문자로 나간다';
comment on column public.message_templates.alimtalk_vars is
  '알림톡 템플릿의 #{변수} 를 앱의 값에 붙인 것. {"#{이름}":"{{학생명}}"}';


-- ── 할일 제목에 단원을 넣을 수 있게 ─────────────────────────
-- 0028 의 기본값은 학생 이름만 들어갔다. 무슨 단원인지가 빠져서
-- 할일만 보고는 뭘 출제해야 하는지 알 수 없었다.
--   {학생} 학생 이름   {단원} 배정한 단원   {교재} 그 교재   {숙제} 숙제 이름
-- 값이 비면 앞뒤 구분자까지 알아서 정리된다.
update public.homework_items
   set prep_task = '{학생}-단원평가-{단원}'
 where prep_task = '{학생} 단원평가 출제';

-- ─────────── 0031_monthly_report.sql ───────────
-- 0031: 월말 리포트 · 단원평가 결과
--
-- 하루치 리포트는 그날만 보여준다. 한 달을 모아 보면 다른 게 보인다 —
-- 숙제를 얼마나 해왔는지, 몇 번 왔는지, 단원평가는 어땠는지.
--
-- 새로 입력받는 것은 **단원평가 결과 하나뿐**이다. 나머지는 그 달의
-- 데일리리포트를 다시 세면 나온다.

-- ------------------------------------------------------------
-- 1. 단원평가 결과
--    '단원평가 대비 복습' 을 내주면 할일이 생기고(0028), 시험을 보면 여기에 남는다.
-- ------------------------------------------------------------
create table if not exists public.unit_exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null default current_date,
  name        text not null,                       -- 무슨 단원평가인지 (단원명)
  textbook_id uuid references public.textbooks(id) on delete set null,
  total       int,                                 -- 전체 문항
  score       int,                                 -- 맞은 개수 (보여줄 때는 틀린 개수로 뒤집는다)
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists unit_exams_student_idx on public.unit_exams (student_id, date);

alter table public.unit_exams enable row level security;
drop policy if exists staff_all on public.unit_exams;
create policy staff_all on public.unit_exams
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.unit_exams;
create policy own_read on public.unit_exams
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = unit_exams.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = unit_exams.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 2. 월말 리포트
--    학생 한 명의 한 달에 한 줄. 문구는 자동으로 만들고, 고치면 여기 담는다.
-- ------------------------------------------------------------
create table if not exists public.monthly_reports (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  ym         text not null,                        -- "2026-07"
  text       text,                                 -- 손으로 고친 문구 (비면 자동 문구)
  note       text,                                 -- 이 학생에게만 덧붙일 한마디
  sent_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, ym)
);
create index if not exists monthly_reports_ym_idx on public.monthly_reports (ym);

alter table public.monthly_reports enable row level security;
drop policy if exists staff_all on public.monthly_reports;
create policy staff_all on public.monthly_reports
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.monthly_reports;
create policy own_read on public.monthly_reports
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = monthly_reports.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = monthly_reports.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 3. 월말 리포트도 문자 문구에서 인삿말·맺음말을 정한다
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, key, body, sort) values
  ('월말 리포트', 'auto', 'monthly', '', 35)
on conflict (key) where key is not null do nothing;

-- ─────────── 0032_pass_pct.sql ───────────
-- 0032: 점수 기준을 하나로 — **성취도 %**
--
-- 어떤 줄은 높아야 좋고(숙제 성취도) 어떤 줄은 낮아야 좋으면(오답률)
-- 읽는 사람이 매번 뒤집어 생각해야 한다. 전부 **높을수록 좋은 %** 로 맞춘다.
--
--   단어시험    18/20  →  90% (2개 틀림)
--   단원평가    17/20  →  85% (3개 틀림)
--   숙제 성취도          88%
--
-- 통과선도 같은 방향으로 적는다. "오답 10% 이내" 와 "성취도 90% 이상" 은 같은 말이다.
update public.integrations
   set config = (config - 'wordWrongPct')
              || jsonb_build_object(
                   'wordPassPct',
                   coalesce(100 - (config->>'wordWrongPct')::int, 90)
                 )
 where id = 'warning'
   and config ? 'wordWrongPct';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordPassPct":90,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ─────────── 0033_study_timer.sql ───────────
-- 0033: 학생용 — 순서대로 · 시간을 재면서
--
-- 등원해서 무엇부터 할지 학생이 매번 묻지 않게 **순서대로** 보여준다.
-- 그리고 시작하려면 **타이머를 눌러야** 한다. 얼마나 걸렸는지가 남으면
-- "오래 걸렸지만 끝까지 했다" 를 알아볼 수 있다.
--
-- 다만 **선생님을 기다려야 하는 것**(단어시험, 숙제 검사 …)은 타이머를 켜면
-- 기다린 시간까지 공부한 시간으로 잡힌다. 그런 항목은 타이머를 안 쓴다.
-- 어떤 항목이 그런지는 학습 항목 화면에서 정한다.

alter table public.homework_items
  add column if not exists no_timer boolean not null default false;

comment on column public.homework_items.no_timer is
  '선생님 확인이 필요해 기다릴 수 있는 항목. 학생 화면에서 타이머를 안 띄운다';

-- 처음 쓰는 사람이 바로 쓸 수 있게, 기다리는 게 뻔한 것들은 켜 둔다.
-- (단어시험은 학생이 혼자 보므로 뺀다 — 0036 에서 바로잡았다)
update public.homework_items
   set no_timer = true
 where no_timer = false
   and (name like '%구두%' or name like '%검사%' or name like '%채점%' or name like '%상담%');


-- ------------------------------------------------------------
-- 공부한 시간
--   한 번 시작하고 멈출 때마다 한 줄. 여러 번 나눠 해도 그대로 쌓인다.
-- ------------------------------------------------------------
create table if not exists public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  stay_task_id     uuid references public.stay_tasks(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  seconds          int,                    -- 멈출 때 계산해 둔다 (매번 빼지 않게)
  created_at       timestamptz not null default now()
);
create index if not exists study_sessions_student_idx
  on public.study_sessions (student_id, date);

alter table public.study_sessions enable row level security;
drop policy if exists staff_all on public.study_sessions;
create policy staff_all on public.study_sessions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 쓰고 읽는다 (타이머를 누르는 건 학생이다)
drop policy if exists own_all on public.study_sessions;
create policy own_all on public.study_sessions
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = study_sessions.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = study_sessions.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.study_sessions;
create policy parent_read on public.study_sessions
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = study_sessions.student_id
              and ps.parent_profile_id = auth.uid())
  );

-- ─────────── 0034_inclass_study.sql ───────────
-- 0034: 등원 학습 · 학생이 누르는 '학습 완료'
--
-- 0033 에서 타이머를 **집에서 하는 숙제**에 붙였는데, 정작 필요한 것은
-- **등원해서 학원에서 하는 학습**이었다. 실시간으로 남아야 하는 쪽은 이쪽이다.
--
-- 흐름
--   선생님  오늘 수업에서 "오늘 학원에서 할 것" 을 정해준다   (status = 'inclass')
--   학생    등원해서 위에서부터 하나씩 ▶시작 → ■학습 완료
--   학생    '검사 받을게요' 를 따로 안 누른다. **학습 완료가 곧 검사 대기**다
--   선생님  손이 비면 대기줄을 보고 **한꺼번에** 검사한다
--
-- 학생이 누른 완료(student_done_at)와 선생님이 찍은 결과(status)는 다른 것이다.
-- 학생은 "다 했어요" 를 말할 뿐이고, 잘했는지는 선생님이 본다.

alter table public.daily_report_items
  add column if not exists student_done_at timestamptz;

comment on column public.daily_report_items.student_done_at is
  '학생이 학습 완료를 누른 시각. 선생님 검사 결과(status)와는 다른 것이다';

comment on column public.daily_report_items.status is
  'assigned(다음 수업 숙제) | inclass(오늘 학원에서 할 것) | done | weak | missing | verified';

-- 타이머 줄에 등원 학습도 붙을 수 있게
alter table public.study_sessions
  add column if not exists kind text not null default 'home';

comment on column public.study_sessions.kind is
  'inclass(학원에서) | home(집에서). 나중에 습관을 볼 때 나눠 본다';

-- ─────────── 0035_routine.sql ───────────
-- 0035: 학습 루틴 — 진도를 따라 순서대로
--
-- 문법 교재는 단원마다 하는 일이 정해져 있다.
--
--   1  등원: 단원 설명 정독 · 문답노트     숙제: 구두테스트(녹음) · 본교재 문제풀기
--   2  등원: 숙제채점 · 구두테스트(직접)   숙제: 워크북 풀기
--   3  등원: 숙제채점 · 단원평가           숙제: —
--
-- 한 줄이 **한 수업 회차**다. 매번 손으로 고르지 않고, 이 순서를 따라간다.
-- 학생마다 지금 몇 번째인지만 기억하면 된다.
--
-- 같은 '구두테스트' 라도 등원이면 직접 보고 숙제면 녹음이라, **다른 학습 항목**으로
-- 넣는다. 그래야 학생 화면에 할 일이 정확히 뜨고 시간도 따로 쌓인다.

create table if not exists public.routine_steps (
  id            uuid primary key default gen_random_uuid(),
  textbook_id   uuid not null references public.textbooks(id) on delete cascade,
  sort          int  not null default 0,
  label         text,                                  -- "설명 정독 · 문답노트" (알아보기 쉽게)
  inclass_items uuid[] not null default '{}',          -- 그날 학원에서 할 것
  home_items    uuid[] not null default '{}',          -- 그날 내주는 숙제
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists routine_steps_book_idx on public.routine_steps (textbook_id, sort);

alter table public.routine_steps enable row level security;
drop policy if exists staff_all on public.routine_steps;
create policy staff_all on public.routine_steps
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 이 학생이 이 교재에서 **다음에 할 단계** (0부터. 끝까지 가면 다시 0)
alter table public.student_textbooks
  add column if not exists routine_step int not null default 0;


-- ------------------------------------------------------------
-- 루틴이 없는 학생·과목을 위한 **기본값**
--   매번 같은 것을 고르는 수고를 덜어준다. 루틴이 있으면 루틴이 먼저다.
-- ------------------------------------------------------------
alter table public.students
  add column if not exists default_inclass uuid[] not null default '{}',
  add column if not exists default_home    uuid[] not null default '{}';

comment on column public.students.default_inclass is
  '등원 학습 기본값. 오늘 수업에서 [기본값] 을 누르면 이게 깔린다';

-- ─────────── 0036_no_timer_fix.sql ───────────
-- 0036: '선생님과 함께' 를 실제에 맞게 좁힌다
--
-- 0033 에서 이름에 시험·검사·채점·상담이 들어가면 타이머를 껐다.
-- 그런데 **단어시험은 학생이 혼자 본다.** 선생님을 기다려야 하는 것은
-- 구두테스트와 검사(숙제 검사·채점)뿐이다.
--
-- 잘못 꺼두면 두 가지가 어긋난다.
--   · 혼자 하는 것에 타이머가 안 붙어 시간이 안 쌓인다
--   · 등원하자마자 전원이 동시에 선생님을 기다리는 것처럼 잡힌다
--
-- 여기서 한 번 바로잡는다. 이후로는 학습 항목 화면에서 정하시면 된다.
update public.homework_items
   set no_timer = (
     name like '%구두%'
     or name like '%검사%'
     or name like '%채점%'
     or name like '%상담%'
   );

-- ─────────── 0037_arrival.sql ───────────
-- 0037: 등원 절차 · 단어시험 시점
--
-- ── 등원 절차 ───────────────────────────────────────────────
-- 아이가 들어오면 순서가 정해져 있다.
--   ① 핸드폰 제출  ② 출석 체크  ③ 숙제 제출   그다음에 학습 시작
-- 셋 다 그날 한 번이라 daily_reports 에 붙인다.
--
-- ── 단어시험 시점 ───────────────────────────────────────────
-- 수업 시작하자마자 보는 학생이 있고, 다 끝내고 보는 학생이 있다.
-- 학생마다 기본값을 정해두고, 그날 사정이 있으면 그날만 바꾼다.
--   students.word_when       그 학생의 평소 (start | end)
--   daily_reports.word_when  오늘만 다르게 (비면 평소대로)

alter table public.daily_reports
  add column if not exists phone_in    boolean not null default false,
  add column if not exists homework_in boolean not null default false,
  add column if not exists word_when   text;

comment on column public.daily_reports.phone_in is '핸드폰을 냈다';
comment on column public.daily_reports.homework_in is '숙제를 냈다';
comment on column public.daily_reports.word_when is
  '오늘만 다르게 (start=수업 시작 / end=다 끝내고). 비어 있으면 학생 기본값을 따른다';

alter table public.students
  add column if not exists word_when text not null default 'start';

comment on column public.students.word_when is
  '단어시험을 언제 보는가 — start(수업 시작) | end(다 끝내고)';

-- 어떤 학습 항목이 단어시험인지 (이름을 코드에 박지 않으려고 표시해 둔다)
alter table public.homework_items
  add column if not exists word_test boolean not null default false;

update public.homework_items
   set word_test = true
 where word_test = false
   and name like '%단어%'
   and (name like '%시험%' or name like '%테스트%');

-- ─────────── 0038_arrival_by_student.sql ───────────
-- 0038: 등원 체크는 **학생이** 누른다
--
-- 0037 에서 폰·숙제 제출을 daily_reports 에 넣고 선생님이 찍게 했다.
-- 그런데 이건 **학생이 하는 일**이다. 들어와서 폰 내고 숙제 내는 건 아이 몫이고,
-- 선생님은 다 냈는지 눈으로 확인만 하면 된다.
--
-- 출석 체크는 **외부 앱**에서 한다. 우리 화면에서 등원 절차는 둘뿐이다.
--   ① 핸드폰 제출   ② 숙제 제출
--
-- 학생이 자기 것을 쓰려면 권한이 필요한데, daily_reports 를 통째로 열어주면
-- 점수나 리포트까지 건드릴 수 있다. 그래서 **따로 표를 둔다.**

create table if not exists public.arrival_checks (
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null,
  phone_at    timestamptz,      -- 핸드폰 낸 시각
  homework_at timestamptz,      -- 숙제 낸 시각
  primary key (student_id, date)
);
create index if not exists arrival_checks_date_idx on public.arrival_checks (date);

alter table public.arrival_checks enable row level security;

drop policy if exists staff_all on public.arrival_checks;
create policy staff_all on public.arrival_checks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 쓰고 읽는다
drop policy if exists own_all on public.arrival_checks;
create policy own_all on public.arrival_checks
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = arrival_checks.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = arrival_checks.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.arrival_checks;
create policy parent_read on public.arrival_checks
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = arrival_checks.student_id
              and ps.parent_profile_id = auth.uid())
  );

-- 0037 에서 만든 daily_reports 의 두 칸은 이제 안 쓴다.
-- 지우지는 않는다 — 이미 찍어둔 게 있을 수 있고, 지워서 얻을 게 없다.
comment on column public.daily_reports.phone_in is
  '안 씀 (0038 부터 arrival_checks 로 옮김)';
comment on column public.daily_reports.homework_in is
  '안 씀 (0038 부터 arrival_checks 로 옮김)';

-- ─────────── 0039_arrival_attend.sql ───────────
-- 0039: 등원 체크에 '출석 체크' 를 더한다
--
-- 출석은 외부 앱에서 한다. 그런데 **아이들이 잊어버린다.**
-- 그래서 우리 화면이 물어봐 준다 — 대신 해주는 게 아니라 짚어주는 것이다.
--
-- 순서: ① 핸드폰 제출  ② 출석 체크  ③ 숙제 제출
--
-- 셋을 한 번에 늘어놓으면 습관적으로 세 번 연달아 눌러버린다.
-- 그래서 화면에서는 **한 번에 하나씩만** 보여준다.

alter table public.arrival_checks
  add column if not exists attend_at timestamptz;

comment on column public.arrival_checks.attend_at is
  '외부 앱에서 출석 체크를 했다고 학생이 확인한 시각';

-- ─────────── 0040_attend_marks_present.sql ───────────
-- 0040: 아이가 출석 체크를 하면 등원으로 잡는다
--
-- 출석은 외부 앱에서 하지만, 아이가 우리 화면에서 '출석 체크 했어요' 를 누르면
-- 그게 곧 등원 신호다. 선생님이 또 찍을 이유가 없다.
--
-- 늦게 온 아이는 누른 시각이 남으니 선생님 화면에서 보고 지각으로 고치면 된다.
--
-- 학생에게 열어주는 문은 **최대한 좁게** 만든다.
--   · 자기 줄만
--   · 오늘 날짜만
--   · status = 'present' 만
--   · 넣기만 (고치거나 지우지 못한다)
-- 이러면 학생이 할 수 있는 일은 '오늘 내가 왔다고 말하는 것' 하나뿐이다.

drop policy if exists own_arrival_insert on public.attendance;
create policy own_arrival_insert on public.attendance
  for insert to authenticated
  with check (
    status = 'present'
    and date = ((now() at time zone 'Asia/Seoul')::date)
    and exists (
      select 1 from public.students s
       where s.id = attendance.student_id and s.profile_id = auth.uid()
    )
  );

-- 자기 출결은 볼 수 있게 (이미 왔다고 되어 있는지 알아야 두 번 안 넣는다)
drop policy if exists own_read on public.attendance;
create policy own_read on public.attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
       where s.id = attendance.student_id and s.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.parent_student ps
       where ps.student_id = attendance.student_id and ps.parent_profile_id = auth.uid()
    )
  );

-- ─────────── 0041_academy_net.sql ───────────
-- 0041: 학원에서만 등원 체크가 되게
--
-- 아이가 오는 길에 미리 눌러버리면 등원 체크가 아무 뜻이 없다.
-- 폰 제출도 마찬가지다 — 누르는 것만으로는 아무것도 증명되지 않는다.
--
-- 그래서 **학원 인터넷에서 온 요청만** 받는다.
--   아이가 할 일은 없다. 학원 와이파이에 붙어 있으면 그냥 된다.
--   오는 길(LTE)에 누르면 "학원에 도착해서 눌러주세요" 가 뜬다.
--
-- 켜고 끄는 스위치는 따로 두지 않는다.
--   **주소가 하나라도 등록돼 있으면 켜진 것**이고, 다 지우면 꺼진다.
--   스위치가 따로 있으면 "켰는데 주소를 안 넣었다" 같은 상태가 생긴다.
--
-- 주소 자체는 비밀이 아니다. 학생도 읽을 수 있어야 화면에서 미리 알려줄 수 있다.
-- (브라우저에서 요청 IP 를 속일 수는 없다 — 서버가 직접 본다)

create table if not exists public.academy_net (
  ip         text primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.academy_net enable row level security;

drop policy if exists staff_all on public.academy_net;
create policy staff_all on public.academy_net
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists read_all on public.academy_net;
create policy read_all on public.academy_net
  for select to authenticated using (true);

-- ─────────── 0042_class_term.sql ───────────
-- 0042: 특강 기한 · 반별 출결
--
-- 두 가지를 푼다.
--
-- 1) 특강은 끝난다. 끝난 특강이 수강반 목록·오늘 수업·수강료에 계속
--    남아 있으면 매번 눈으로 걸러내야 한다.
--    → 종료일을 넣어두면 그 날이 지나는 순간 알아서 내려간다.
--      "보관 버튼을 누른다" 를 기억하지 않아도 되게.
--
-- 2) 정규는 왔는데 특강만 빠지는 날이 있다. 결석·보강·수강료가
--    반마다 따로 계산되므로, 그날 출결 한 줄로는 표현이 안 된다.
--    → 반별 출결을 따로 남긴다.
--
--    ※ 기존 attendance(하루 한 줄)는 **건드리지 않는다.**
--      그 표는 30군데 넘는 화면이 "학생·날짜에 한 줄" 을 전제로 읽고 쓴다.
--      수업 중에 쓰는 출결을 흔드는 것보다, 어쩌다 있는 특강 결석을
--      옆 표에 따로 남기는 쪽이 안전하다.
--      attendance = 그 학생이 그날 학원에 왔는가 (정규 기준)
--      class_attendance = 그날 그 반에 들어왔는가 (특강 등)

-- ------------------------------------------------------------
-- 1. 반에 기간을 준다
-- ------------------------------------------------------------
alter table public.classes add column if not exists starts_on  date;
alter table public.classes add column if not exists ends_on    date;
-- 기한 없이 흐지부지 끝나는 반도 있어서, 손으로 내리는 길도 남긴다
alter table public.classes add column if not exists archived_at timestamptz;

comment on column public.classes.starts_on is '개강일 (정규반은 비워둠 = 무기한)';
comment on column public.classes.ends_on   is '종강일 — 지나면 목록·오늘 수업·수강료에서 자동으로 내려간다';
comment on column public.classes.archived_at is '손으로 보관한 시각 (되살리면 null)';

create index if not exists classes_term_idx on public.classes (ends_on);


-- ------------------------------------------------------------
-- 2. 반별 출결
--    정규 출결은 attendance 에 그대로 남고, 여기엔 특강처럼
--    따로 세야 하는 반의 출결만 쌓인다.
-- ------------------------------------------------------------
create table if not exists public.class_attendance (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  status     attendance_status not null,
  makeup_of  date,                     -- 보강이면 원 결석일 (수강료가 여기 걸린다)
  note       text,
  created_at timestamptz not null default now(),
  unique (class_id, student_id, date)
);

create index if not exists class_attendance_date_idx    on public.class_attendance (date);
create index if not exists class_attendance_student_idx on public.class_attendance (student_id, date);

alter table public.class_attendance enable row level security;

drop policy if exists staff_all on public.class_attendance;
create policy staff_all on public.class_attendance
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.class_attendance;
create policy own_read on public.class_attendance
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = class_attendance.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = class_attendance.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- ─────────── 0043_student_login.sql ───────────
-- 0043: 학생 계정 연결
--
-- 학생용 화면(/me)은 만들어 뒀는데, **학생 계정을 만들 길이 없었다.**
-- students.profile_id 는 읽기만 했지 어디서도 채우지 않았다.
-- 그래서 원장님이 학생 아이디로 로그인해볼 수가 없다.
--
-- 계정을 원장님이 대신 만들어 주려면 Supabase 관리자 키가 필요한데,
-- 그 키는 앱에 두면 안 된다. 그래서 반대로 간다.
--
--   1. 원장님이 학생마다 **연결 코드**를 뽑는다 (6자리, 하루짜리)
--   2. 학생이 스스로 가입한다 (이메일 · 비밀번호)
--   3. 학생이 코드를 넣으면 그 계정이 그 학생에 붙는다
--
-- 코드는 한 번 쓰면 죽고, 하루가 지나도 죽는다.

create table if not exists public.student_link_codes (
  code       text primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists student_link_codes_student_idx
  on public.student_link_codes (student_id);

alter table public.student_link_codes enable row level security;

-- 선생님만 뽑고 본다
drop policy if exists staff_all on public.student_link_codes;
create policy staff_all on public.student_link_codes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 코드를 읽지 못한다. 코드 확인·연결은 아래 함수가 대신한다
-- (그래야 남의 코드를 뒤져볼 수 없다)


-- ------------------------------------------------------------
-- 코드를 써서 내 계정을 학생에 붙인다.
--
-- security definer 로 도는 함수 하나만 열어둔다. 학생은 이 함수 말고는
-- 코드 표에 손댈 수 없다.
-- ------------------------------------------------------------
create or replace function public.link_student_by_code(p_code text)
returns table (ok boolean, message text, student_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_link_codes%rowtype;
  v_taken uuid;
begin
  if auth.uid() is null then
    return query select false, '로그인이 필요해요.'::text, null::uuid;
    return;
  end if;

  select * into v_row from public.student_link_codes
   where code = upper(btrim(p_code));

  if not found then
    return query select false, '코드가 맞지 않아요.'::text, null::uuid;
    return;
  end if;
  if v_row.used_at is not null then
    return query select false, '이미 사용한 코드예요.'::text, null::uuid;
    return;
  end if;
  if v_row.expires_at < now() then
    return query select false, '코드가 만료됐어요. 선생님께 새로 받아주세요.'::text, null::uuid;
    return;
  end if;

  -- 이 학생에 이미 다른 계정이 붙어 있으면 덮어쓰지 않는다
  select s.profile_id into v_taken from public.students s where s.id = v_row.student_id;
  if v_taken is not null and v_taken <> auth.uid() then
    return query select false, '이 학생에는 이미 다른 계정이 연결돼 있어요.'::text, null::uuid;
    return;
  end if;

  update public.students set profile_id = auth.uid() where id = v_row.student_id;
  update public.profiles set role = 'student' where id = auth.uid() and role is distinct from 'principal';
  update public.student_link_codes
     set used_at = now(), used_by = auth.uid()
   where code = v_row.code;

  return query select true, '연결됐어요.'::text, v_row.student_id;
end $$;

revoke all on function public.link_student_by_code(text) from public;
grant execute on function public.link_student_by_code(text) to authenticated;


-- ------------------------------------------------------------
-- 학생 본인이 자기 students 행을 읽을 수 있어야 /me 가 뜬다.
-- (이미 있을 수 있으므로 다시 만든다)
-- ------------------------------------------------------------
drop policy if exists own_read on public.students;
create policy own_read on public.students
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.parent_student ps
               where ps.student_id = students.id and ps.parent_profile_id = auth.uid())
  );

-- ─────────── 0044_submissions.sql ───────────
-- 0044: 학생이 숙제를 제출한다
--
-- 지금은 "학습 완료" 를 누르는 것이 전부다. 정말 했는지는 등원해서
-- 공책을 봐야 안다. 그런데 원장님 루틴에는 **녹음으로 내는 구두테스트**가
-- 이미 있다 — 그건 종이로 받을 수가 없다.
--
--   · 사진  — 문제 푼 것, 워크북, 오답노트
--   · 녹음  — 구두테스트 (집에서 하는 것)
--   · 글    — 짧은 답이나 한마디
--
-- 파일은 Supabase Storage 의 비공개 버킷에 넣는다. 주소를 알아도 못 연다 —
-- 볼 때마다 짧은 시간짜리 링크를 새로 만들어 연다.

create table if not exists public.homework_submissions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null default (now() at time zone 'Asia/Seoul')::date,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  report_item_id   uuid references public.daily_report_items(id) on delete cascade,
  kind             text not null default 'photo',   -- photo / audio / text
  path             text,                            -- storage 안의 위치 (글이면 비어 있다)
  body             text,                            -- 글로 낸 것
  bytes            int,
  seconds          int,                             -- 녹음 길이
  checked_at       timestamptz,                     -- 선생님이 본 시각
  created_at       timestamptz not null default now()
);

create index if not exists submissions_student_idx on public.homework_submissions (student_id, date);
create index if not exists submissions_date_idx    on public.homework_submissions (date);
create index if not exists submissions_open_idx    on public.homework_submissions (date)
  where checked_at is null;

alter table public.homework_submissions enable row level security;

drop policy if exists staff_all on public.homework_submissions;
create policy staff_all on public.homework_submissions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 내고 본다
drop policy if exists own_all on public.homework_submissions;
create policy own_all on public.homework_submissions
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = homework_submissions.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = homework_submissions.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.homework_submissions;
create policy parent_read on public.homework_submissions
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = homework_submissions.student_id
              and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 저장 공간 — 비공개 버킷
--   경로 규칙: submissions/<student_id>/<date>/<파일명>
--   맨 앞 칸이 학생 id 라서, 그것만 보고 누구 것인지 가릴 수 있다.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('submissions', 'submissions', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    -- 선생님은 전부 본다
    execute $p$drop policy if exists submissions_staff on storage.objects$p$;
    execute $p$
      create policy submissions_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'submissions' and public.is_staff())
        with check (bucket_id = 'submissions' and public.is_staff())
    $p$;

    -- 학생은 자기 폴더에만 넣고, 자기 것만 본다
    execute $p$drop policy if exists submissions_own on storage.objects$p$;
    execute $p$
      create policy submissions_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'submissions'
          and exists (select 1 from public.students s
                       where s.profile_id = auth.uid()
                         and s.id::text = (storage.foldername(name))[1])
        )
        with check (
          bucket_id = 'submissions'
          and exists (select 1 from public.students s
                       where s.profile_id = auth.uid()
                         and s.id::text = (storage.foldername(name))[1])
        )
    $p$;
  end if;
end $$;

-- ─────────── 0045_student_id_login.sql ───────────
-- 0045: 아이디 로그인 · 체크리스트 숙제
--
-- 1) 이메일로 로그인시키면 아이들이 못 들어온다.
--    이메일 주소도 비밀번호도 잊어버린다. 그래서 학원이 아이디를 준다 —
--    chloe0001 같은 것. 비밀번호는 0000 으로 시작하고, 처음 들어오면
--    학생이 바꾼다. 또 잊으면 원장님이 0000 으로 되돌린다.
--
--    Supabase 로그인은 이메일만 받으므로, 아이디에 학원 도메인을 붙여
--    속으로만 이메일을 만든다 (chloe0001 → chloe0001@…). 학생은 그런 게
--    있는지도 모른다.
--
-- 2) 숙제 내는 방법을 사진 · 녹음 · 체크리스트 셋으로 한다.
--    체크리스트는 숙제 항목마다 미리 적어둔다 (한 줄에 하나).

alter table public.students add column if not exists login_id text;
create unique index if not exists students_login_id_key
  on public.students (lower(login_id)) where login_id is not null;
comment on column public.students.login_id is '학생이 치는 아이디 (chloe0001). 속으로는 여기에 도메인을 붙여 이메일로 만든다';

-- 처음 들어왔거나 원장님이 되돌렸으면 비밀번호부터 바꾸게 한다
alter table public.profiles add column if not exists must_change_pw boolean not null default false;

-- 체크리스트 — 숙제 항목마다 한 줄에 하나씩
alter table public.homework_items add column if not exists checklist text;
comment on column public.homework_items.checklist is '체크리스트 문항 (줄바꿈으로 구분). 비면 체크리스트 버튼이 안 나온다';


-- ------------------------------------------------------------
-- 내 비밀번호를 바꿨다고 표시한다.
--   비밀번호 자체는 Supabase 가 바꾸고, 여기서는 깃발만 내린다.
-- ------------------------------------------------------------
create or replace function public.clear_must_change_pw()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_pw = false where id = auth.uid();
$$;

revoke all on function public.clear_must_change_pw() from public;
grant execute on function public.clear_must_change_pw() to authenticated;


-- ------------------------------------------------------------
-- 아이디로 로그인하려면 그 아이디가 어느 이메일인지 알아야 한다.
-- 로그인 화면은 아직 로그인 전이라 표를 못 읽으므로, 함수 하나만 열어둔다.
--
-- 아이디가 있는지 없는지 말고는 아무것도 알려주지 않는다
-- (이름·학교 같은 것은 절대 돌려주지 않는다).
-- ------------------------------------------------------------
create or replace function public.email_for_login_id(p_login_id text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
    from public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
   where lower(s.login_id) = lower(btrim(p_login_id))
   limit 1;
$$;

revoke all on function public.email_for_login_id(text) from public;
grant execute on function public.email_for_login_id(text) to anon, authenticated;

-- ─────────── 0046_makeup_time.sql ───────────
-- 0046: 보강 시간
--
-- 보강을 잡을 때 날짜만 정하고 시간이 없었다. 그런데 보강은 정규 수업이
-- 아니라 **그날 비는 시간에 끼워 넣는 것**이라, 몇 시인지가 날짜만큼 중요하다.
-- 학부모께도 "금요일에 오세요" 로는 안 되고 "금요일 5시" 라야 한다.
--
-- 시간은 비워둘 수 있다 (아직 안 정했을 수 있으므로).

alter table public.attendance add column if not exists makeup_time time;
comment on column public.attendance.makeup_time is '보강 시각. 비면 아직 안 정한 것';

alter table public.class_attendance add column if not exists makeup_time time;

-- ─────────── 0047_storage_fix.sql ───────────
-- 0047: 숙제 파일이 안 올라가던 것
--
-- 학생이 녹음을 내면 "new row violates row-level security policy" 가 났다.
--
-- 0044 의 저장소 규칙은 정책 안에서 public.students 를 직접 뒤졌다.
--
--   exists (select 1 from public.students s
--            where s.profile_id = auth.uid()
--              and s.id::text = (storage.foldername(name))[1])
--
-- 이 조회는 **부르는 사람 권한으로** 돈다. 그래서 students 의 잠금(RLS)에
-- 한 번 더 걸리고, 그 안에서 또 다른 표를 보게 되면 조용히 거짓이 된다.
-- 정책 안에서 다른 표를 뒤지는 것 자체가 약한 설계였다.
--
-- 그래서 **"지금 나는 어느 학생인가" 를 돌려주는 함수 하나**로 바꾼다.
-- 이 함수는 security definer 라 잠금을 타지 않는다. 정책은 값 하나만 비교한다.

create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.profile_id = auth.uid() limit 1;
$$;

revoke all on function public.my_student_id() from public;
grant execute on function public.my_student_id() to authenticated;


-- ------------------------------------------------------------
-- 숙제 제출 표 — 정책을 함수 하나로 단순화
-- ------------------------------------------------------------
drop policy if exists own_all on public.homework_submissions;
create policy own_all on public.homework_submissions
  for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());


-- ------------------------------------------------------------
-- 저장소 — 경로 맨 앞이 내 학생 id 인 것만
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'objects') then

    execute $p$drop policy if exists submissions_own on storage.objects$p$;
    execute $p$
      create policy submissions_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'submissions'
          and (storage.foldername(name))[1] = public.my_student_id()::text
        )
        with check (
          bucket_id = 'submissions'
          and (storage.foldername(name))[1] = public.my_student_id()::text
        )
    $p$;

    -- 선생님은 전부 (체험 모드로 대신 낼 때도 여기로 통과한다)
    execute $p$drop policy if exists submissions_staff on storage.objects$p$;
    execute $p$
      create policy submissions_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'submissions' and public.is_staff())
        with check (bucket_id = 'submissions' and public.is_staff())
    $p$;
  end if;
end $$;


-- 버킷이 아직 없으면 만든다 (0044 에서 못 만들었을 수도 있다)
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('submissions', 'submissions', false, 26214400)
    on conflict (id) do nothing;
  end if;
end $$;

-- ─────────── 0048_home_twin.sql ───────────
-- 0048: 등원에서 할 것 · 집에서 할 것이 다른 학습
--
-- 구두테스트는 원장님이 앞에 있어야 한다. 집에서는 할 수가 없어서
-- **셀프녹음테스트**로 낸다. 같은 단계인데 이름도 방법도 다르다.
--
-- 그래서 학습 항목에 "이걸 숙제로 낼 때는 대신 이것" 을 달아둔다.
-- 루틴은 등원 기준 하나만 알면 되고, 숙제로 나갈 때 알아서 바뀐다.
--   구두테스트 → (숙제로 낼 때) → 셀프녹음테스트
--
-- 대부분의 항목은 비어 있다 (집에서든 학원에서든 같은 것이므로).

alter table public.homework_items
  add column if not exists home_item_id uuid references public.homework_items(id) on delete set null;

comment on column public.homework_items.home_item_id is
  '이 학습을 숙제로 낼 때 대신 쓰는 항목. 비면 그대로 나간다';

-- ─────────── 0049_consult_ai.sql ───────────
-- 0049: 상담일지 · 학부모 코멘트 초안
--
-- 1) 재원생 상담일지를 적을 곳이 없었다. 신규 상담 '일정' 만 있었고,
--    정작 무슨 얘기를 했는지 남길 데가 없었다.
--    말한 것을 그대로 받아쓰고, 요약해서 남긴다.
--
-- 2) 학부모께 나가는 코멘트를 매번 직접 쓰느라 시간이 걸린다.
--    조각을 이어 붙이면 붙여넣은 티가 난다. 그래서 **원장님이 예전에 쓰신
--    문장들을 본보기로 주고** AI 가 그 말투로 초안을 쓴다. 원장님은 고친다.

create table if not exists public.student_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  kind       text not null default 'consult',   -- consult(상담) / observe(관찰) / call(통화)
  title      text,
  raw        text,                              -- 받아쓴 것 그대로
  body       text,                              -- 정리한 것 (AI 초안 → 손으로 고침)
  with_whom  text,                              -- 학부모 / 학생 / 둘 다
  minutes    int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_notes_student_idx on public.student_notes (student_id, date desc);

alter table public.student_notes enable row level security;
drop policy if exists staff_all on public.student_notes;
create policy staff_all on public.student_notes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- 학생·학부모는 못 본다. 상담일지는 선생님 기록이다.


-- ------------------------------------------------------------
-- 본보기 문장 — 원장님이 예전에 쓰신 코멘트를 모아둔다.
-- AI 는 이 말투를 따라 쓴다. 많을수록 원장님 글에 가까워진다.
-- ------------------------------------------------------------
create table if not exists public.comment_samples (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  tag        text,                              -- 어떤 상황에 쓰는 문장인지 (선택)
  created_at timestamptz not null default now()
);

alter table public.comment_samples enable row level security;
drop policy if exists staff_all on public.comment_samples;
create policy staff_all on public.comment_samples
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0050_notice_split.sql ───────────
-- 0050: 공지를 나눈다
--
-- 지금은 '공지' 칸이 하나뿐이라, 학생에게 할 말과 학부모께 드릴 말이
-- 같은 데 들어간다. 그래서 학부모용 문장이 학생 화면에 뜨는 일도 있었다.
--
-- 세 갈래로 나눈다.
--   1. 전달사항   — 수업 중에 학생에게 말할 것   (이미 notices 표에 있다)
--   2. 학생공지   — 숙제문자 맨 위               ← 여기만 새로 만든다
--   3. 부모님공지 — 데일리리포트 맨 아래         (기존 daily_reports.notice)

alter table public.daily_reports
  add column if not exists notice_student text;

comment on column public.daily_reports.notice        is '부모님공지 — 데일리리포트 맨 아래';
comment on column public.daily_reports.notice_student is '학생공지 — 숙제문자 맨 위';

-- ─────────── 0051_question_unit.sql ───────────
-- 0051: 단원 아래 문제번호
--
-- 내신 시험범위는 단원 단위가 아니라 **문제 단위**인 경우가 많다.
--   옥련여고 기말 = 2406H1 모의고사 29·30·33·34·36·37번
-- 모의고사는 단원 자체가 없어서 중단원 아래에 바로 문제가 온다.
--
-- 새 구조를 만들지 않는다. 교재 단원은 부모-자식으로 이어진 나무라 깊이
-- 제한이 없다. **문제도 그냥 한 겹 더 내려간 단원**으로 넣으면 된다.
-- 다만 화면에서 "이건 문제다" 를 알아야 하므로 번호만 따로 담아둔다.

alter table public.textbook_units
  add column if not exists question_no text;

comment on column public.textbook_units.question_no is
  '문제번호 (29, 30-1 …). 비면 보통 단원이다';

create index if not exists textbook_units_question_idx
  on public.textbook_units (textbook_id) where question_no is not null;

-- ─────────── 0052_prep_materials.sql ───────────
-- 0052: 내신 대비 자료 관리
--
-- 내신 교재를 따로 관리하지 않는다. 교재도 단원도 문제도 **기존 교재DB**에
-- 그대로 들어간다 (0051 에서 문제번호까지 넣었다).
-- 늘어나는 것은 **자료** 하나뿐이다.
--
--   시험   학교 + 학기 + 시험일          옥련여고 26' 1학기기말 · 7/8
--   범위   그 시험에 나오는 단원·문제들   2406H1 › 어법 › 29,30,33번
--   자료   그 범위에 쓸 자료 한 장        이그잼A (만들 것) · 백발백중 (구입)
--   배정   자료 ↔ 학생                    이그잼A → 김서은, 노주하
--
-- 범위를 지우면 그 아래 자료와 배정도 같이 사라진다 (원장님 판단).
-- 되돌릴 수 없으므로 화면에서 분명히 알린다.

-- ------------------------------------------------------------
-- 1. 시험
-- ------------------------------------------------------------
create table if not exists public.prep_exams (
  id         uuid primary key default gen_random_uuid(),
  school     text not null,
  term       text not null,                     -- "26' 1학기기말"
  grade      text,                              -- 고1 · 중2 (비면 학교 전체)
  exam_date  date,                              -- 영어 시험일 — 급한 순서를 이걸로 잡는다
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists prep_exams_date_idx on public.prep_exams (exam_date);

-- ------------------------------------------------------------
-- 2. 범위 — 교재 단원·문제를 골라 담는다
-- ------------------------------------------------------------
create table if not exists public.prep_scopes (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.prep_exams(id) on delete cascade,
  name       text,                              -- 비면 담긴 단원으로 이름을 만든다
  unit_ids   uuid[] not null default '{}',      -- textbook_units.id (단원이든 문제든)
  note       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists prep_scopes_exam_idx on public.prep_scopes (exam_id, sort);

-- ------------------------------------------------------------
-- 3. 자료
--    단계는 자료마다 다르다. 필요한 것만 켠다.
--    구입 자료는 파는 쪽 업로드가 늦어질 수 있어서 주문일을 따로 둔다.
-- ------------------------------------------------------------
create table if not exists public.prep_materials (
  id          uuid primary key default gen_random_uuid(),
  scope_id    uuid not null references public.prep_scopes(id) on delete cascade,
  name        text not null,
  source      text not null default 'make',     -- make(만든다) / buy(산다)
  ordered_on  date,                             -- 산 것: 주문한 날 (며칠째 안 왔는지)
  arrived_on  date,                             -- 산 것: 받은 날
  -- 필요한 단계만 켠다
  need_make   boolean not null default true,
  need_print  boolean not null default true,
  need_card   boolean not null default false,   -- 클래스카드 업로드
  need_hand   boolean not null default true,    -- 배부
  need_solve  boolean not null default true,    -- 풀이
  need_grade  boolean not null default true,    -- 채점
  -- 학생과 무관한 단계는 여기서 끝난다
  made_at     timestamptz,
  printed_at  timestamptz,
  card_at     timestamptz,
  note        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists prep_materials_scope_idx on public.prep_materials (scope_id, sort);

-- ------------------------------------------------------------
-- 4. 학생 배정 — 자료는 범위로 만들지만 배정은 학생마다 다르다
--    배부·풀이·채점은 학생마다 따로 간다.
-- ------------------------------------------------------------
create table if not exists public.prep_assignments (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.prep_materials(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  handed_at   timestamptz,                      -- 배부
  solved_at   timestamptz,                      -- 풀이 완료
  graded_at   timestamptz,                      -- 채점
  result      text,                             -- done / weak / missing
  score       text,                             -- "18/20" 같은 자유 표기
  note        text,
  created_at  timestamptz not null default now(),
  unique (material_id, student_id)
);
create index if not exists prep_assign_student_idx on public.prep_assignments (student_id);

-- ------------------------------------------------------------
-- 잠금 — 선생님만. 학생은 자기 배정만 읽는다.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['prep_exams','prep_scopes','prep_materials','prep_assignments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

drop policy if exists own_read on public.prep_assignments;
create policy own_read on public.prep_assignments
  for select to authenticated
  using (student_id = public.my_student_id());

-- ─────────── 0053_material_types.sql ───────────
-- 0053: 내신 자료 종류를 미리 등록한다
--
-- 자료 종류가 너무 다양하고, 한 종류 안에 또 갈래가 있다.
--   이그잼   → 변형문제 · 분석지 · 워크북
--   백발백중 → …
-- 자료를 만들 때마다 이름을 손으로 치면 같은 것을 다르게 적게 되고,
-- 나중에 묶어 볼 수가 없다. 그래서 **학습 항목처럼 미리 등록**해 둔다.
--
-- 두 겹이면 충분하다. 큰 것(이그잼) 아래 작은 것(변형문제)까지.
--
-- 그리고 구입·주문일·도착 대기는 뺀다. 파는 쪽 일정까지 여기서 좇으면
-- 관리할 것만 늘고 정작 안 보게 된다.

create table if not exists public.prep_material_types (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.prep_material_types(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  active     boolean not null default true,
  -- 이 종류로 자료를 만들면 단계가 이렇게 켜진 채로 시작한다
  need_make  boolean not null default true,
  need_print boolean not null default true,
  need_card  boolean not null default false,
  need_hand  boolean not null default true,
  need_solve boolean not null default true,
  need_grade boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists prep_types_parent_idx on public.prep_material_types (parent_id, sort);

alter table public.prep_material_types enable row level security;
drop policy if exists staff_all on public.prep_material_types;
create policy staff_all on public.prep_material_types
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- 자료에 종류를 단다
alter table public.prep_materials
  add column if not exists type_id uuid references public.prep_material_types(id) on delete set null;

-- 구입·도착 관련은 쓰지 않는다
alter table public.prep_materials drop column if exists source;
alter table public.prep_materials drop column if exists ordered_on;
alter table public.prep_materials drop column if exists arrived_on;

-- 이름은 종류에서 가져오므로 비어 있어도 된다
alter table public.prep_materials alter column name drop not null;

-- ─────────── 0054_prep_routine.sql ───────────
-- 0054: 내신 자료도 순서대로
--
-- 교재에 루틴이 있듯 내신 자료에도 순서가 있다.
--   이그잼 변형문제 → 분석지 → 워크북
-- 그런데 학생마다 다르다. 어떤 아이는 분석지를 건너뛰고, 어떤 아이는
-- 워크북을 먼저 한다.
--
-- 새 표를 만들지 않는다. 순서는 두 군데에만 있으면 된다.
--   1. 종류에 매긴 순서  = 기본 루틴 (이미 prep_material_types.sort 에 있다)
--   2. 학생 배정에 매긴 순서 = 그 학생만의 순서   ← 여기만 새로
-- 배정에 순서가 없으면 기본 루틴을 따른다.

alter table public.prep_assignments
  add column if not exists sort int;

comment on column public.prep_assignments.sort is
  '이 학생에게 낼 순서. 비면 자료·종류에 매긴 기본 순서를 따른다';

-- 지금 하고 있는 것 / 다음에 낼 것을 빨리 찾기 위해
create index if not exists prep_assign_next_idx
  on public.prep_assignments (student_id, sort) where graded_at is null;

-- ─────────── 0055_payments.sql ───────────
-- 수납
--
-- 앱은 **얼마를 받아야 하는지**를 이미 계산한다 (lib/tuition.js).
-- 여기 저장하는 것은 **받았는가** 하나뿐이다. 금액을 두 곳에 두지 않는다. (원칙1)
--
-- 결제선생 같은 바깥 서비스에서 받은 엑셀을 올리면 이 표가 채워진다.
-- 손으로 체크해도 같은 표에 들어간다 — 들어온 길만 `source` 로 남긴다.

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  ym          text not null,                  -- "2026-09" — 무슨 달 수강료인가
  amount      int,                            -- 실제로 받은 금액 (앱 계산과 다를 수 있다)
  paid_on     date,                           -- 받은 날. 비어 있으면 아직 안 받음
  method      text,                           -- 카드 · 이체 · 현금 …
  source      text not null default 'manual', -- manual | 결제선생
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 한 학생의 한 달은 한 줄이다. 엑셀을 여러 번 올려도 덮어쓴다
create unique index if not exists payments_student_ym_idx
  on public.payments (student_id, ym);
create index if not exists payments_ym_idx on public.payments (ym);

alter table public.payments enable row level security;
drop policy if exists staff_all on public.payments;
create policy staff_all on public.payments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0056_purge_submissions.sql ───────────
-- 0056: 오래된 제출물은 파일만 지운다
--
-- 사진과 녹음은 쌓인다. 한 학생이 하루에 두세 개씩 내면 한 달에 수백 개고,
-- 무료 용량은 금방 찬다.
--
-- 그렇다고 기록까지 지우면 안 된다. 언제 뭘 냈고 뭐라고 봐줬는지는 남아야
-- 나중에 상담할 때 말할 수 있다. 그래서 **파일만** 지우고 줄은 남긴다.
-- 지운 줄에는 지운 시각을 적어, 학생 화면에 "보관 기간이 지나 파일은
-- 지웠습니다" 로 뜨게 한다.

alter table public.homework_submissions
  add column if not exists purged_at timestamptz;

comment on column public.homework_submissions.purged_at is
  '보관 기간이 지나 파일을 지운 시각. 기록(누가·언제·무엇을)은 그대로 남는다';

-- 아직 안 지운 것 중 오래된 것을 빨리 찾기 위해
create index if not exists submissions_purge_idx
  on public.homework_submissions (date)
  where purged_at is null and path is not null;

-- ─────────── 0057_class_roster_lock.sql ───────────
-- 0057: 반 명단은 자기 것만
--
-- 보안 점검에서 나온 것.
--
-- class_students 와 classes 는 "학생·학부모도 자기 반을 알아야 한다" 는 이유로
-- 통째로 열려 있었다 (using true). 그런데 통째로 열면 **학원 전체 명단**이
-- 나간다. 이름까지는 아니지만 어느 반에 몇 명이 있고 누구(어떤 id)인지가 보인다.
--
-- 학생 화면이 실제로 쓰는 것은 **자기가 속한 반** 하나뿐이다 (오늘 몇 시에
-- 끝나는지 보려고 읽는다). 자기 것만 열어주면 충분하다.
--
-- 정책 안에서 잠긴 표를 다시 뒤지면 안 된다 — 그 표의 잠금이 또 걸려서
-- 조용히 거짓이 된다 (0047 에서 이미 한 번 데었다).
-- 그래서 여기서도 **security definer 함수**로 값만 받아 비교한다.

-- ------------------------------------------------------------
-- 지금 나는 어느 학생인가 — 본인 계정이면 자기, 학부모 계정이면 자녀들
-- (my_student_id() 는 본인 하나만 돌려주므로 학부모를 담지 못한다)
-- ------------------------------------------------------------
create or replace function public.my_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.profile_id = auth.uid()
  union
  select ps.student_id from public.parent_student ps where ps.parent_profile_id = auth.uid();
$$;

revoke all on function public.my_student_ids() from public;
grant execute on function public.my_student_ids() to authenticated;

-- 내가(내 아이가) 속한 반
create or replace function public.my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cs.class_id from public.class_students cs
   where cs.student_id in (select public.my_student_ids());
$$;

revoke all on function public.my_class_ids() from public;
grant execute on function public.my_class_ids() to authenticated;

-- ------------------------------------------------------------
-- 내 반 배정만 / 내가 속한 반만
-- ------------------------------------------------------------
drop policy if exists read_class_students on public.class_students;
create policy read_class_students on public.class_students
  for select to authenticated
  using (public.is_staff() or student_id in (select public.my_student_ids()));

drop policy if exists read_classes_all on public.classes;
create policy read_classes_all on public.classes
  for select to authenticated
  using (public.is_staff() or id in (select public.my_class_ids()));

-- ─────────── 0058_send_skip.sql ───────────
-- 0058: 이 문자는 안 보낸다
--
-- 안 보내도 되는 날이 있다. 결석해서 쓸 말이 없거나, 이미 전화로 말씀드렸거나,
-- 형제라 한 집에 두 통이 가거나.
--
-- 지금은 그런 줄이 '보낼 것' 에 계속 남아 있어서, 매일 눈으로 걸러내야 한다.
-- 며칠 지나면 무엇을 일부러 안 보낸 것이고 무엇을 깜빡한 것인지 알 수 없다.
--
-- 그래서 **안 보내기로 한 것도 기록한다.** 보낸 것과 똑같이 남긴다.
--   · 목록에서 빠진다 (처리하면 사라진다 — 앱 전체가 쓰는 원칙)
--   · 되돌릴 수 있다
--   · 나중에 "왜 안 갔지" 를 답할 수 있다
--
-- 문자는 한 리포트에 세 가지가 붙는다 (리포트 · 숙제 · 하원). 어느 것을
-- 안 보낼지 따로 고를 수 있어야 하므로 칸 하나에 목록으로 담는다.

alter table public.daily_reports
  add column if not exists skip_kinds text[] not null default '{}';

comment on column public.daily_reports.skip_kinds is
  '안 보내기로 한 문자 종류 (report · homework · late). 보낸 것과 같이 기록으로 남긴다';

-- ─────────── 0059_neis.sql ───────────
-- 0059: 나이스 학사일정 가져오기
--
-- 학교 시험 · 방학 · 체험학습 날짜를 학교 알림장에서 옮겨 적고 있었다.
-- 학교가 여러 곳이면 그것만으로 일이다. 나이스(NEIS)가 학사일정을 열어두고
-- 있으니 받아온다.
--
--   · 학교는 **표준학교코드**로 잡는다. 이름만으로는 같은 이름 학교가 여럿이다.
--   · 받아온 일정은 tasks 에 넣는다 — 새 화면을 만들지 않는다 (원칙1).
--     원장님은 이미 일정 화면을 보고 있고, 학교 일정도 결국 그 화면에서 본다.
--   · 몇 번을 다시 받아도 같은 줄이 늘어나면 안 된다. 그래서 어디서 온
--     무엇인지(source · source_id)를 적어두고 그것으로 맞춘다.

create table if not exists public.neis_schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 학교 이름 (나이스가 준 그대로)
  atpt_code   text not null,                 -- 시도교육청코드 (예: B10 서울)
  schul_code  text not null,                 -- 표준학교코드
  kind        text,                          -- 초등학교 / 중학교 / 고등학교
  active      boolean not null default true, -- 안 보는 학교는 꺼둔다
  created_at  timestamptz not null default now(),
  unique (atpt_code, schul_code)
);

alter table public.neis_schools enable row level security;
drop policy if exists staff_all on public.neis_schools;
create policy staff_all on public.neis_schools
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------------
-- 어디서 온 일정인지
--
-- 손으로 적은 일정과 받아온 일정을 섞어두면, 다시 받을 때 손으로 적은 것까지
-- 지우게 된다. 그래서 출처를 적어둔다. 다시 받으면 **같은 출처의 같은 줄만**
-- 맞추고, 손으로 적은 것은 건드리지 않는다.
-- ------------------------------------------------------------
alter table public.tasks add column if not exists source    text;
alter table public.tasks add column if not exists source_id text;

comment on column public.tasks.source is
  '어디서 온 일정인가. 비어 있으면 손으로 적은 것 (neis = 나이스에서 받아온 것)';
comment on column public.tasks.source_id is
  '그 출처 안에서의 고유 이름. 다시 받아도 늘어나지 않게 이것으로 맞춘다';

-- 같은 것을 두 번 넣지 않는다 (손으로 적은 것은 source 가 비어 있어 걸리지 않는다)
create unique index if not exists tasks_source_uidx
  on public.tasks (source, source_id)
  where source is not null;

-- ─────────── 0060_exam_hidden.sql ───────────
-- 0060: 필요 없는 시험 일정은 숨긴다
--
-- 나이스에서 학사일정을 받으면 시험 기간이 **다 들어온다.** 우리 학생이
-- 없는 학년의 시험도 있고, 학교가 '고사' 라고만 적어둔 것도 있다.
--
-- 지우게 하면 안 된다 — 다시 받아오면 또 들어오고, 그때마다 다시 지워야 한다.
-- 그래서 **숨긴다.** 숨긴 것은 화면에도 안 나오고 결석 예상도 안 잡히지만
-- 기록은 남아서, 다시 받아도 숨긴 채로 있다.

alter table public.exam_periods
  add column if not exists hidden boolean not null default false;

comment on column public.exam_periods.hidden is
  '필요 없어서 숨긴 시험. 화면·알림·결석 예상에서 빠지지만 기록은 남는다 (다시 받아도 숨긴 채)';

create index if not exists exam_periods_live_idx
  on public.exam_periods (from_date) where not hidden;

-- ─────────── 0061_task_source_index.sql ───────────
-- 0061: 받아온 일정이 안 들어가던 것 고침
--
-- 0059 에서 "같은 것을 두 번 넣지 않는다" 를 **조건부 인덱스**로 만들었다.
--
--   create unique index ... on tasks (source, source_id) where source is not null;
--
-- 그런데 Postgres 는 조건부 유일 인덱스를 ON CONFLICT 에 쓰려면 그 조건까지
-- 함께 적어줘야 한다. 앱이 쓰는 통로(PostgREST)는 조건을 붙이지 않으므로
-- 나이스에서 받아올 때마다 이렇게 났다.
--
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- 조건을 뗀다. **비어 있는 값은 서로 다른 것으로 보기 때문에**, 손으로 적은
-- 일정(source 가 비어 있다)은 몇 개든 그대로 들어간다 — 조건이 있을 때와 같다.
-- (진짜 Postgres 에서 확인함: 손으로 적은 3건 그대로, 받아온 것은 두 번 넣어도 1건)

drop index if exists public.tasks_source_uidx;

create unique index if not exists tasks_source_uidx
  on public.tasks (source, source_id);

-- ------------------------------------------------------------
-- **같은 이유로 숙제 → 내 할일이 조용히 안 되고 있었다.**
--
-- 수업에서 숙제를 배정하면 '내가 준비할 것' 이 할일에 자동으로 생겨야 하는데,
-- 그것도 auto_key 의 조건부 유일 인덱스에 ON CONFLICT 를 걸고 있었다.
-- 실패해도 오류를 보지 않고 넘어가는 자리라 아무 말 없이 안 만들어졌다.
--
-- 여기도 조건을 뗀다. auto_key 가 비어 있는 할일(손으로 적은 것)은
-- 서로 다른 것으로 보므로 몇 개든 그대로 들어간다.
-- ------------------------------------------------------------
drop index if exists public.tasks_auto_key_idx;

create unique index if not exists tasks_auto_key_idx
  on public.tasks (auto_key);

-- ─────────── 0062_check_note.sql ───────────
-- 0062: 검사할 때 한 줄 남기기
--
-- ○△✕ 만으로는 나중에 아무것도 기억나지 않는다. "△ 였다" 는 알겠는데
-- **무엇이 부족했는지**가 없어서, 다음 수업에 같은 말을 또 하거나 아예 못 짚는다.
--
-- 그 자리에서 한 줄만 적을 수 있게 한다.
--   · 리포트에 그대로 나간다 (학부모가 "왜 △ 인가" 를 알 수 있다)
--   · 다음에 그 학생을 열면 지난번에 뭐라고 했는지 보인다
--
-- 짧아야 한다. 길게 쓸 곳은 공지와 상담일지가 따로 있다.

alter table public.daily_report_items
  add column if not exists check_note text;

comment on column public.daily_report_items.check_note is
  '검사하면서 남긴 한 줄. 리포트에 함께 나간다';

-- 검사 대기줄에서 아직 안 본 제출물을 빨리 찾기 위해
create index if not exists submissions_unchecked_idx
  on public.homework_submissions (date)
  where checked_at is null;

-- ─────────── 0063_in_person.sql ───────────
-- 0063: 직접 보고 검사하는 숙제
--
-- 원장님 원칙: **숙제는 다 낸다.** 사진이든 녹음이든 올리게 한다.
-- 그러니 올라온 게 없으면 안 한 것이다 — 미제출로 봐도 된다.
--
-- 다만 몇 가지는 앱에 낼 것이 없다. 공책을 가져오면 그 자리에서 넘겨보는
-- 숙제가 그렇다. 그런 것만 여기에 표시해 두고, 검사 화면에 **「직접검사」**
-- 라고 적는다. 그 숙제는 안 냈다고 미제출로 몰지 않는다.
--
-- 기본값은 false — **내는 것이 기본**이다. 새로 만드는 학습도 그렇다.

alter table public.homework_items
  add column if not exists in_person boolean not null default false;

comment on column public.homework_items.in_person is
  '직접 보고 검사하는 숙제 (공책 등). 앱에 낼 것이 없으므로 미제출로 세지 않는다';

-- ─────────── 0064_notice_photos.sql ───────────
-- 0064: 공지에 사진을 붙인다
--
-- 학교에서 나눠준 종이 — 학사일정, 시험 시간표, 가정통신문 — 를 옮겨 적기는
-- 번거롭고, 옮겨 적다 틀리면 그게 더 큰 일이다. **찍어서 그대로 보내면 된다.**
--
--   결석 일정 · 학교 시험 일정 · 학교 공지 …
--
-- 제목도 같이 둔다. 사진만 덜렁 있으면 무엇인지 모른다.

alter table public.notices
  add column if not exists title  text,
  add column if not exists photos text[] not null default '{}';

comment on column public.notices.photos is
  'notices 버킷 안의 경로들. 규칙: <notice_id>/<파일명>';


-- ------------------------------------------------------------
-- 이 공지를 볼 수 있는 사람인가
--
-- RLS 정책 안에서 다른 RLS 표를 읽으면 서로 물고 늘어진다.
-- 그래서 security definer 로 한 겹 감싼다 (0057 과 같은 이유).
-- ------------------------------------------------------------
create or replace function public.can_read_notice(nid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_staff()
    or exists (
      select 1
        from public.notice_receipts r
        join public.students s on s.id = r.student_id
       where r.notice_id = nid and s.profile_id = auth.uid()
    )
    or exists (
      select 1
        from public.notice_receipts r
        join public.parent_student ps on ps.student_id = r.student_id
       where r.notice_id = nid and ps.parent_profile_id = auth.uid()
    );
$$;
grant execute on function public.can_read_notice(uuid) to authenticated;

-- 경로 맨 앞 칸을 uuid 로 읽는다. 이상한 이름이면 그냥 null (= 못 본다)
create or replace function public.uuid_or_null(t text)
returns uuid
language plpgsql
immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.uuid_or_null(text) to authenticated;


-- 학생·학부모도 자기에게 온 공지는 읽어야 한다 (지금은 선생님만 읽는다)
drop policy if exists notice_read_mine on public.notices;
create policy notice_read_mine on public.notices
  for select to authenticated
  using (public.can_read_notice(id));

-- 자기 앞으로 온 줄만. 남에게 무엇이 갔는지는 볼 수 없다.
drop policy if exists receipt_read_mine on public.notice_receipts;
create policy receipt_read_mine on public.notice_receipts
  for select to authenticated
  using (
    notice_receipts.student_id in (select public.my_student_ids())
  );


-- ------------------------------------------------------------
-- 사진이 들어갈 곳 — 비공개 버킷
--   경로 규칙: <notice_id>/<파일명>
--   맨 앞 칸이 공지 id 라서, 그것만 보고 볼 사람인지 가릴 수 있다.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('notices', 'notices', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    execute $p$drop policy if exists notices_staff on storage.objects$p$;
    execute $p$
      create policy notices_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'notices' and public.is_staff())
        with check (bucket_id = 'notices' and public.is_staff())
    $p$;

    -- 받는 사람은 **읽기만**
    execute $p$drop policy if exists notices_read on storage.objects$p$;
    execute $p$
      create policy notices_read on storage.objects
        for select to authenticated
        using (
          bucket_id = 'notices'
          and public.can_read_notice(public.uuid_or_null((storage.foldername(name))[1]))
        )
    $p$;
  end if;
end $$;

-- ─────────── 0065_videos.sql ───────────
-- 0065: 영상 배정 · 본 기록
--
-- 문법 강의, 쇼츠, 발음 영상. 지금은 링크를 카톡으로 보내고 "봤니?" 하고
-- 물어봐야 안다. 물어보면 다들 봤다고 한다.
--
-- 그래서 **연 시각을 기계가 적는다.** 아이가 화면에서 영상을 열면 그 순간
-- 기록이 남는다. 다 보고 나서 「다 봤어요」를 누르면 끝난 것으로 친다.
--   · 아예 안 연 아이     — 기록이 없다
--   · 열긴 열었는데 안 끝낸 아이 — 연 기록만 있다
--   · 다 본 아이           — 끝낸 시각까지 있다
--
-- 이 셋은 완전히 다른 이야기다. 지금은 셋 다 "봤어요" 로 들어온다.
--
-- 영상 자체는 유튜브에 있고, 우리는 **주소만** 들고 있는다.

create table if not exists public.video_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid references public.video_folders(id) on delete set null,
  title      text not null,
  url        text not null,
  provider   text,                    -- youtube | vimeo | 기타
  vid        text,                    -- 유튜브 영상 id (미리보기 그림에 쓴다)
  note       text,
  active     boolean not null default true,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists videos_folder_idx on public.videos (folder_id, sort);

-- 누구에게 냈나
create table if not exists public.video_assignments (
  video_id    uuid not null references public.videos(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  assigned_on date not null default (now() at time zone 'Asia/Seoul')::date,
  due_on      date,
  primary key (video_id, student_id)
);
create index if not exists video_assign_student_idx
  on public.video_assignments (student_id, assigned_on);

-- 봤나
--   opened_at   처음 연 시각 (기계가 적는다)
--   opens       몇 번 열었나
--   done_at     「다 봤어요」를 누른 시각
create table if not exists public.video_views (
  video_id   uuid not null references public.videos(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  opened_at  timestamptz,
  last_at    timestamptz,
  opens      int not null default 0,
  done_at    timestamptz,
  primary key (video_id, student_id)
);
create index if not exists video_views_student_idx on public.video_views (student_id);


-- ------------------------------------------------------------
-- 누가 무엇을 보나
--   선생님   전부
--   학생·학부모  **자기에게 배정된 것만.** 남이 무엇을 받았는지는 안 보인다
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['video_folders','videos','video_assignments','video_views'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- 배정: 내 것만 읽는다
drop policy if exists assign_read_mine on public.video_assignments;
create policy assign_read_mine on public.video_assignments
  for select to authenticated
  using (video_assignments.student_id in (select public.my_student_ids()));

-- 영상: 나에게 배정된 것만 읽는다
drop policy if exists video_read_mine on public.videos;
create policy video_read_mine on public.videos
  for select to authenticated
  using (
    exists (
      select 1 from public.video_assignments a
       where a.video_id = videos.id
         and a.student_id in (select public.my_student_ids())
    )
  );

drop policy if exists folder_read_mine on public.video_folders;
create policy folder_read_mine on public.video_folders
  for select to authenticated
  using (
    exists (
      select 1
        from public.videos v
        join public.video_assignments a on a.video_id = v.id
       where v.folder_id = video_folders.id
         and a.student_id in (select public.my_student_ids())
    )
  );

-- 본 기록: 자기 것만 쓰고 읽는다.
-- 학부모는 읽기만 — 아이 대신 「다 봤어요」를 눌러주면 기록이 거짓이 된다.
drop policy if exists view_own on public.video_views;
create policy view_own on public.video_views
  for all to authenticated
  using (
    exists (select 1 from public.students s
             where s.id = video_views.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
             where s.id = video_views.student_id and s.profile_id = auth.uid())
  );

drop policy if exists view_parent_read on public.video_views;
create policy view_parent_read on public.video_views
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
             where ps.student_id = video_views.student_id
               and ps.parent_profile_id = auth.uid())
  );

-- ─────────── 0066_calendar_share.sql ───────────
-- 0066: 달력을 학생·학부모와 나눈다
--
-- 학사일정, 휴강, 시험 기간, 특강. 지금은 원장님 화면에만 있고, 아이와
-- 학부모는 카톡으로 물어본다. 물어보게 하지 말고 **그냥 보이게** 한다.
--
-- 다만 전부 보이면 안 된다.
--   · 할일(kind='todo') — 원장님이 처리할 일이다. 절대 나가지 않는다
--   · 일정 중에도 나만 볼 것이 있다 (상담 약속, 원장님 개인 일정)
--
-- 그래서 **일정은 기본으로 보이고, 나만 볼 것만 따로 잠근다.**
-- 반대로 하면(기본 숨김) 매번 공개를 눌러야 하고, 그러면 아무것도 안 보인다.

alter table public.tasks
  add column if not exists private boolean not null default false;

comment on column public.tasks.private is
  '나만 보기. 켜면 학생·학부모 달력에서 빠진다. 할일(kind=todo)은 이것과 무관하게 안 나간다';


-- 학생·학부모는 **일정만, 잠그지 않은 것만** 읽는다
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
  );

-- ─────────── 0067_menu_prefs.sql ───────────
-- 0067: 메뉴를 내 손에 맞게
--
-- 화면이 스물한 개다. 원장님이 매일 여는 것은 그중 대여섯 개고, 나머지는
-- 한 달에 한 번도 안 여는 것도 있다. 그런데 전부 같은 크기로 위에 늘어서
-- 있으면, 매일 쓰는 것을 찾는 데 매번 눈이 간다.
--
-- 그래서 **무엇을 보일지, 어떤 순서로 놓을지**를 정할 수 있게 한다.
-- 숨긴 화면도 주소로는 그대로 열린다 — 메뉴에서만 빠질 뿐이다.
--
-- 사람마다 다르다. 원장님과 조교 선생님이 매일 여는 화면이 같을 리 없다.
-- 그래서 profiles 에 붙인다.

alter table public.profiles
  add column if not exists menu_hidden text[] not null default '{}',
  add column if not exists menu_order  text[] not null default '{}';

comment on column public.profiles.menu_hidden is
  '메뉴에서 뺀 화면들의 key. 주소로는 그대로 열린다';
comment on column public.profiles.menu_order is
  '메뉴에 놓을 순서(key). 여기 없는 것은 원래 순서대로 뒤에 붙는다';

-- ─────────── 0068_request_photos.sql ───────────
-- 0068: 학생·학부모가 사진으로 알린다
--
-- 결석을 알릴 때 "가족 여행" 이라고 적는 것과, 학교에서 나눠준 종이를 찍어
-- 보내는 것은 다르다.
--
--   · 체험학습 신청서 · 학교 행사 안내문   → 결석 사유가 종이에 그대로 있다
--   · 학교 시험 시간표                     → 옮겨 적으면 틀린다. 틀리면 큰일이다
--   · 학교 가정통신문                      → 사진 한 장이면 끝난다
--
-- 옮겨 적게 하지 말고 찍어서 보내게 한다.
--
-- 파일은 비공개 버킷에 넣는다. 경로 맨 앞 칸이 학생 id 라서, 그것만 보고
-- 누구 것인지 가릴 수 있다 (0044 와 같은 규칙).
-- 다만 여기는 **학부모도 올린다.** 결석을 알리는 건 대개 학부모다.

alter table public.requests
  add column if not exists photos text[] not null default '{}';

comment on column public.requests.photos is
  'requests 버킷 안의 경로들. 규칙: <student_id>/<파일명>';


do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('requests', 'requests', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    -- 선생님은 전부 본다
    execute $p$drop policy if exists requests_staff on storage.objects$p$;
    execute $p$
      create policy requests_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'requests' and public.is_staff())
        with check (bucket_id = 'requests' and public.is_staff())
    $p$;

    -- 학생 본인과 그 학부모만, 그 아이 폴더에.
    -- my_student_ids() 가 둘 다를 한 번에 답해준다 (0057).
    execute $p$drop policy if exists requests_own on storage.objects$p$;
    execute $p$
      create policy requests_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'requests'
          and public.uuid_or_null((storage.foldername(name))[1])
              in (select public.my_student_ids())
        )
        with check (
          bucket_id = 'requests'
          and public.uuid_or_null((storage.foldername(name))[1])
              in (select public.my_student_ids())
        )
    $p$;
  end if;
end $$;

-- ─────────── 0069_neis_where.sql ───────────
-- 0069: 어느 지역 학교인지 적어둔다
--
-- 나이스에서 학교 이름으로 찾으면 **부분 일치**로 여러 곳이 나온다.
-- '신송' 하나로 신송초 · 신송중 · 신송고가 같이 나오고, 같은 이름 학교가
-- 다른 지역에 또 있기도 하다.
--
-- 그런데 우리 목록에는 이름과 학교코드만 남겨두었다. 코드를 외우고 다니는
-- 사람은 없으므로, 화면만 봐서는 **어느 학교를 넣은 것인지 알 수가 없다.**
-- 엉뚱한 학교를 넣어도 모르고, 같은 이름을 두 번 넣어도 모른다.
--
-- 지역과 주소를 같이 적어둔다. 고르는 자리에서도, 넣고 나서도 보인다.

alter table public.neis_schools
  add column if not exists atpt_name text,
  add column if not exists address   text;

comment on column public.neis_schools.atpt_name is '시도교육청 이름 (인천광역시교육청 …)';
comment on column public.neis_schools.address   is '도로명 주소 — 같은 이름 학교를 가리는 데 쓴다';

-- ─────────── 0070_word_counts.sql ───────────
-- 0070: 단어가 몇 개인가
--
-- 단어시험을 내려면 **몇 개 중에 몇 개인지**를 알아야 한다. 지금은 그걸
-- 원장님 머릿속과 교재를 번갈아 보며 세고 있다.
--
--   교재  소단원 하나에 단어가 몇 개인가 (day 하나에 30개 …)
--   학생  한 번에 몇 개씩 보는가, 몇 개까지 틀려도 통과인가, 언제 보는가
--
-- 교재마다 규칙이 다르다. 대부분은 소단원마다 같은 개수지만, 어떤 교재는
-- 단원마다 다르다. **다르면 다르다고 적어두고** 단원마다 따로 센다.

-- ---------- 교재 ----------
alter table public.textbooks
  add column if not exists words_irregular boolean not null default false;

comment on column public.textbooks.word_range is
  '소단원 하나당 단어 개수 (규칙적일 때). 불규칙이면 단원마다 따로 적는다';
comment on column public.textbooks.words_irregular is
  '소단원마다 단어 개수가 다르다. 켜면 단원별 개수를 쓰고, 교재 기본값은 참고만 한다';

-- ---------- 단원 ----------
alter table public.textbook_units
  add column if not exists word_count int;

comment on column public.textbook_units.word_count is
  '이 소단원의 단어 개수. 비어 있으면 교재 기본값(word_range)을 쓴다';


-- ---------- 학생 ----------
-- 단어시험은 학생마다 다르게 본다. 지금은 방식(0025)만 있고 **개수와 통과선**이 없다.
--
--   word_test_count  한 번에 몇 개를 보는가 (비면 그날 진도 단원의 단어 수)
--   word_cut_pct     몇 % 맞으면 통과인가 (비면 학원 기본값 — 10% 틀림까지 허용)
--
-- 통과선은 **맞은 비율**로 적는다. 어떤 줄은 높아야 좋고 어떤 줄은 낮아야 좋으면
-- 읽을 때마다 뒤집어 생각해야 한다 (0032 와 같은 이유).
alter table public.students
  add column if not exists word_test_count int,
  add column if not exists word_cut_pct    int;

comment on column public.students.word_test_count is
  '단어시험 한 번에 보는 개수. 비면 그날 범위대로';
comment on column public.students.word_cut_pct is
  '통과선 (맞은 %). 비면 학원 기본값 90 — 10개 중 1개까지 틀려도 통과';

-- ─────────── 0071_family.sql ───────────
-- 0071: 형제자매를 묶는다
--
-- 형제가 둘 다 다니면 학부모는 **계정 하나로 둘 다** 봐야 한다. 지금은 아이마다
-- 따로 연결해야 하고, 연결을 하나 빠뜨리면 그 아이 것만 안 보인다.
-- 그런데 학부모는 안 보이는 게 있다는 것 자체를 모른다.
--
-- 학부모 계정으로 묶으면 될 것 같지만 안 된다 — 등록할 때는 아직 학부모 계정이
-- 없다. 그래서 **학생끼리** 묶는다.
--
--   같은 family_id = 형제자매
--
-- 이렇게 해두면
--   · 학부모를 한 아이에게 연결할 때 **형제도 같이** 연결할 수 있다
--   · 수강료를 형제 합산으로 볼 수 있다
--   · 상담할 때 "형이 뭐 하고 있더라" 를 한 화면에서 본다

alter table public.students
  add column if not exists family_id uuid;

create index if not exists students_family_idx on public.students (family_id);

comment on column public.students.family_id is
  '형제자매 묶음. 같은 값이면 한 집이다. 혼자면 비어 있어도 된다';


-- ------------------------------------------------------------
-- 학부모가 내 아이 **전부**를 보게
--
-- my_student_ids() 는 지금 "내가 연결된 아이" 만 준다. 형제를 묶어두었어도
-- 연결이 하나뿐이면 하나만 본다.
--
-- **형제라고 저절로 열어주지는 않는다.** 이혼·재혼처럼 한쪽 부모만 보아야 하는
-- 경우가 있다. 연결은 아이마다 그대로 하되, 연결하는 자리에서 형제를 같이
-- 고를 수 있게 해준다 (앱에서).
-- 여기서는 **형제를 찾는 함수**만 둔다.
-- ------------------------------------------------------------
create or replace function public.siblings_of(sid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s2.id
    from public.students s1
    join public.students s2 on s2.family_id = s1.family_id
   where s1.id = sid
     and s1.family_id is not null
     and s2.id <> s1.id;
$$;

revoke all on function public.siblings_of(uuid) from public;
grant execute on function public.siblings_of(uuid) to authenticated;

-- ─────────── 0072_scores.sql ───────────
-- 0072: 성적 관리
--
-- 지금 앱이 아는 성적은 **학원 안**의 것뿐이다 — 단어시험, 숙제, 단원평가.
-- 그런데 학부모가 정말 궁금한 것은 **학교 성적**이다. 그게 어디에도 없어서
-- 상담 때마다 물어보고 종이에 적는다.
--
-- 세 가지를 담는다.
--   내신     학교 시험 점수와 등급. 학교마다 등급컷이 다르다
--   모의고사 전국 시험. 원점수 · 등급 · 백분위
--   단원평가 학원에서 보는 문법 단원평가 (이건 이미 monthly 에 일부 있다)
--
-- **틀린 문제까지 남긴다.** 점수만 남기면 "몇 점이었다" 로 끝나고, 다음에
-- 무엇을 다시 볼지는 또 기억에 기댄다.
--
-- 학생이 직접 낸다. 노션 설문지 링크를 걸어두고, 원장님은 들어온 것을 확인만 한다.

-- ---------- 성적 한 건 ----------
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,

  kind        text not null default 'school',   -- school(내신) | mock(모의고사) | unit(단원평가)
  taken_on    date,                             -- 시험 본 날
  year        int,                              -- 학년도 (2026)
  term        text,                             -- 1학기 중간고사 · 3월 학평 · Unit 5 …
  subject     text not null default '영어',

  raw_score   numeric,                          -- 원점수
  full_score  numeric,                          -- 만점 (보통 100)
  grade       int,                              -- 등급 (1~9)
  percentile  numeric,                          -- 백분위 (모의고사)
  rank_in     int,                              -- 석차
  rank_of     int,                              -- 전체 인원

  -- 학교마다 등급컷이 다르다. 그 학교 그 시험의 컷을 같이 적어두면
  -- 다음 시험 때 "몇 점이면 몇 등급인지" 를 알 수 있다.
  school      text,                             -- 어느 학교 시험인가 (학생 학교와 다를 수 있다)
  cuts        numeric[],                        -- 1등급컷부터 순서대로 [90, 84, 77, …]

  note        text,
  source      text,                             -- 어디서 왔나 (form = 학생이 낸 것)
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists scores_student_idx on public.scores (student_id, taken_on desc);
create index if not exists scores_kind_idx    on public.scores (kind, taken_on desc);


-- ---------- 틀린 문제 ----------
-- 점수만 남기면 "몇 점이었다" 로 끝난다. 무엇을 틀렸는지가 남아야
-- 다음에 무엇을 다시 볼지 정할 수 있다.
create table if not exists public.score_wrongs (
  id         uuid primary key default gen_random_uuid(),
  score_id   uuid not null references public.scores(id) on delete cascade,
  question   text,                              -- 문제 번호 (12번)
  topic      text,                              -- 무엇이 문제였나 (관계대명사 · 빈칸추론)
  reason     text,                              -- 왜 틀렸나 (단어를 몰라서 · 시간 부족)
  note       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists score_wrongs_score_idx on public.score_wrongs (score_id, sort);


-- ---------- 학생이 직접 내는 자리 ----------
-- 노션 설문지 링크를 걸어둔다. 앱에서 폼을 새로 만들지 않는다 —
-- 원장님이 이미 노션을 쓰시고, 문항을 바꾸는 일이 잦기 때문이다.
insert into public.integrations (id, enabled, config) values
  ('score_form', true, '{"school":"","mock":"","unit":""}'::jsonb)
on conflict (id) do nothing;


-- ---------- 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['scores','score_wrongs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- 학생·학부모는 **자기 것만** 본다
drop policy if exists score_own on public.scores;
create policy score_own on public.scores
  for select to authenticated
  using (scores.student_id in (select public.my_student_ids()));

-- 학생 본인은 직접 낼 수 있다 (학부모는 읽기만 — 대신 내주면 기록이 거짓이 된다)
drop policy if exists score_own_insert on public.scores;
create policy score_own_insert on public.scores
  for insert to authenticated
  with check (
    exists (select 1 from public.students s
             where s.id = scores.student_id and s.profile_id = auth.uid())
  );

drop policy if exists wrong_own on public.score_wrongs;
create policy wrong_own on public.score_wrongs
  for select to authenticated
  using (
    exists (select 1 from public.scores sc
             where sc.id = score_wrongs.score_id
               and sc.student_id in (select public.my_student_ids()))
  );

drop policy if exists wrong_own_insert on public.score_wrongs;
create policy wrong_own_insert on public.score_wrongs
  for insert to authenticated
  with check (
    exists (select 1 from public.scores sc
             join public.students s on s.id = sc.student_id
            where sc.id = score_wrongs.score_id and s.profile_id = auth.uid())
  );

-- ─────────── 0073_exam_cuts.sql ───────────
-- 등급컷을 **시험 회차**로 옮긴다.
--
-- 왜
--   0072 에서는 컷을 성적 한 줄마다(scores.cuts) 적게 했다. 그런데 컷은
--   학생 것이 아니라 **그 학교 그 회차 시험** 것이다. 신송중 학생이 셋이면
--   같은 값을 세 번 적어야 하고, 한 번 잘못 치면 그 학생만 등급이 다르게 나온다.
--   어느 것이 맞는지 알 방법이 없다.
--
--   학교 정보에 두는 것도 아니다 — 컷은 학교마다가 아니라 **회차마다** 바뀐다.
--   신송중 1학기 중간 90, 2학기 기말 86. 같은 학교인데 다르다.
--
--   우리는 그 회차를 이미 들고 있다: exam_periods (학교 · 학년 · 시험 이름 · 기간).
--   컷이 사는 곳은 여기다.
--
-- scores.cuts 는 **지우지 않는다.**
--   시험 일정에 없는 시험의 피난처로 남긴다 — 전학 오기 전 학교 성적,
--   모의고사(전국이라 학교별 회차가 없다), 우리가 낸 단원평가.
--   회차에 컷이 있으면 그것을 쓰고, 없을 때만 성적 줄의 것을 본다.

alter table public.exam_periods
  add column if not exists cuts numeric[];

comment on column public.exam_periods.cuts is
  '1등급컷부터 순서대로 [90, 84, 77, …]. 이 학교 이 회차를 본 학생 전부에게 쓰인다.';

-- 모의고사는 전국 공통이라 학교가 없다. 학교 칸에 '전국' 을 넣어 한 벌만 둔다.
-- (표를 따로 파면 "회차" 라는 같은 것이 두 군데에 살게 된다)
comment on table public.exam_periods is
  '시험 회차. 내신은 학교별로, 모의고사는 school=''전국'' 으로 한 벌만 둔다.';

-- ─────────── 0074_exams_merged.sql ───────────
-- 시험을 **한 줄**로 합친다.
--
-- 무엇이 문제였나
--   같은 시험이 두 군데에 따로 살고 있었다.
--     exam_periods  학사일정에서 (나이스로 받아옴) — 기간 · 영어시험일 · 등급컷
--     prep_exams    내신 자료에서 (손으로 적음)    — 회차명 · 범위 · 자료
--   신송중 1학기 기말이 두 줄이고 서로를 모른다. 그래서
--     · 시험 날짜가 바뀌면 두 군데를 고쳐야 하고
--     · 등급컷은 이쪽에만, 시험범위는 저쪽에만 있고
--     · 대시보드의 「시험범위 미등록」이 prep_exams 만 보니, 학사일정에서 만든
--       시험은 아예 안 잡혔다
--
-- 어떻게 합치나
--   exam_periods 를 남긴다. 나이스에서 받아오는 쪽이고, 결석 예정·전날 등원·
--   달력이 이미 여기에 걸려 있다. prep_exams 는 여기로 옮기고 없앤다.
--
--   시험 하나를 열면 **범위 · 자료 · 등급컷 · 우리 애들 성적 · 출제 선생님**이
--   한자리에 있게 된다.
--
-- 두 번 돌려도 같아야 한다 (SETUP_ALL 은 여러 번 실행된다).

-- ── 1) 시험이 들고 있어야 할 것 ──────────────────────────
alter table public.exam_periods add column if not exists teacher text;
alter table public.exam_periods add column if not exists source  text;

comment on column public.exam_periods.teacher is '출제 선생님 — 누가 내는지에 따라 대비가 달라진다';
comment on column public.exam_periods.note    is '시험 관련 특이사항 (범위 밖 출제, 서술형 비중 …)';
comment on column public.exam_periods.source  is 'neis(받아옴) | manual(손으로 적음)';

-- ── 2) prep_exams 를 옮긴다 ─────────────────────────────
do $$
declare
  has_prep boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'prep_exams'
  ) into has_prep;
  if not has_prep then return; end if;   -- 이미 옮겼다

  -- 어디로 갈지 미리 정해둔다.
  --   같은 학교 · 같은 학년이고 영어시험일이 시험 기간 안에 들면 **같은 시험**이다.
  --   짝이 없으면 새 회차를 만든다 (기간은 하루짜리로 둔다 — 아는 것이 그것뿐이다).
  create temp table _exam_map on commit drop as
  select
    p.id                                      as prep_id,
    (
      select e.id from public.exam_periods e
      where e.school = p.school
        and coalesce(e.grade, '') = coalesce(p.grade, '')
        and (
          p.exam_date is null
          or (p.exam_date between e.from_date and e.to_date)
          or e.english_on = p.exam_date
        )
      order by e.from_date
      limit 1
    )                                         as exam_id,
    p.school, p.grade, p.term, p.exam_date, p.note
  from public.prep_exams p;

  -- 짝이 없는 것은 새로 만든다
  with made as (
    insert into public.exam_periods (school, grade, name, from_date, to_date, english_on, note, source)
    select m.school, m.grade, m.term,
           coalesce(m.exam_date, current_date),
           coalesce(m.exam_date, current_date),
           m.exam_date, m.note, 'manual'
    from _exam_map m
    where m.exam_id is null
    returning id, school, coalesce(grade,'') as g, name, english_on
  )
  update _exam_map m
     set exam_id = made.id
    from made
   where m.exam_id is null
     and made.school = m.school
     and made.g = coalesce(m.grade, '')
     and made.name is not distinct from m.term
     and made.english_on is not distinct from m.exam_date;

  -- 짝을 찾은 쪽에는 내신 자료 쪽에서만 알던 것을 채워준다.
  -- **덮어쓰지 않는다** — 학사일정에 이미 적힌 것이 더 최근일 수 있다.
  update public.exam_periods e
     set name       = coalesce(e.name, m.term),
         english_on = coalesce(e.english_on, m.exam_date),
         note       = coalesce(e.note, m.note)
    from _exam_map m
   where e.id = m.exam_id;

  -- 범위를 새 시험으로 옮긴다. 단원·자료·배정은 범위에 매달려 있어서 같이 따라온다.
  alter table public.prep_scopes drop constraint if exists prep_scopes_exam_id_fkey;
  update public.prep_scopes s
     set exam_id = m.exam_id
    from _exam_map m
   where s.exam_id = m.prep_id;

  -- 어디로도 못 간 범위가 있으면 여기서 멈춘다 (지우고 나면 되돌릴 수 없다)
  if exists (
    select 1 from public.prep_scopes s
    where not exists (select 1 from public.exam_periods e where e.id = s.exam_id)
  ) then
    raise exception '옮기지 못한 시험범위가 있습니다. prep_exams 를 지우지 않았습니다.';
  end if;

  alter table public.prep_scopes
    add constraint prep_scopes_exam_id_fkey
    foreign key (exam_id) references public.exam_periods(id) on delete cascade;

  drop table public.prep_exams;
end $$;

-- ── 3) 나이스로 받아온 것 표시 ──────────────────────────
-- 손으로 적은 것을 다시 받아올 때 덮어쓰지 않기 위해서다
update public.exam_periods set source = 'neis' where source is null;

create index if not exists exam_periods_school_idx on public.exam_periods (school, grade);

-- ─────────── 0075_exam_owns_neis.sql ───────────
-- 방향을 뒤집는다. **내 시험이 주인이고, 나이스가 거기 붙는다.**
--
-- 지금까지는 거꾸로였다
--   나이스에서 받은 시험 기간을 먼저 만들고, 거기에 내 범위·자료·등급컷을 붙였다.
--   그러면 학교 일정이 내 자료의 주인이 된다. 실제로는 그 반대다 —
--   내가 대비하는 시험이 먼저 있고, 학교가 언제 보는지는 **참고로 붙는 것**이다.
--
-- 무엇이 달라지나
--   1) 다시 받아와도 **내 것은 안 바뀐다.** 나이스가 말하는 기간은 따로 적어두고,
--      내 기간과 다르면 "학교 일정이 바뀌었어요" 라고 알려만 준다. 반영은 내가 누른다.
--   2) 나이스에 없는 시험도 **제대로 된 시험**이다. 학원에서 보는 대비 시험,
--      학교가 아직 안 올린 일정 — 지금까지는 이런 것이 '임시' 처럼 취급됐다.
--   3) 학교가 '1회고사' 라고 부르든 '1차고사' 라고 부르든, **내가 부르는 이름**이
--      따로 있다. 나이스 이름은 옆에 적어둔다.
--
-- 그래서 칸을 나눈다
--   from_date · to_date · name  → **내 것.** 화면과 계산은 전부 이것을 본다
--   neis_*                      → 나이스가 마지막으로 말한 것 (참고)

-- 어느 나이스 일정에 붙어 있나 (tasks.source_id 와 같은 열쇠 — "학교코드:날짜:행사")
alter table public.exam_periods add column if not exists neis_source_id text;
-- 나이스가 말한 것 — 내 것과 견주기 위해 그대로 적어둔다
alter table public.exam_periods add column if not exists neis_from date;
alter table public.exam_periods add column if not exists neis_to   date;
alter table public.exam_periods add column if not exists neis_name text;
alter table public.exam_periods add column if not exists neis_seen_at timestamptz;

comment on column public.exam_periods.neis_source_id is
  '붙여둔 나이스 일정 (tasks.source_id). 비어 있으면 내가 만든 시험이다.';
comment on column public.exam_periods.neis_from is
  '나이스가 마지막으로 말한 시작일. from_date(내 것)와 다르면 화면에서 알려준다.';
comment on column public.exam_periods.neis_name is
  '학교가 부르는 이름 (1회고사 · 1차고사). 내가 부르는 이름은 name 이다.';

create index if not exists exam_periods_neis_idx
  on public.exam_periods (neis_source_id)
  where neis_source_id is not null;

-- 같은 나이스 일정이 두 시험에 붙으면 "바뀌었어요" 가 두 군데로 간다
create unique index if not exists exam_periods_neis_uniq
  on public.exam_periods (neis_source_id)
  where neis_source_id is not null;

-- 0074 의 source 는 뜻이 바뀌었다.
--   예전: 이 줄의 주인이 누구인가 (neis / manual)
--   지금: **모든 줄이 내 것이다.** 나이스가 붙어 있는지는 neis_source_id 가 말한다.
-- 이미 'neis' 로 적힌 것은 "받아와서 만든 것" 이라는 뜻으로만 남긴다.
comment on column public.exam_periods.source is
  '이 줄을 처음 어떻게 만들었나 (neis=받아와서 · manual=손으로). 주인은 언제나 나다.';

-- ─────────── 0076_schools.sql ───────────
-- 학교를 **한 곳**에 모은다. 그리고 출제 선생님은 여러 명일 수 있다.
--
-- 무엇이 문제였나
--   학교 이름이 **글자로** 세 군데에 흩어져 있었다.
--     students.school · exam_periods.school · neis_schools.name
--   「신송중」과 「신송중학교」가 다른 학교가 된다. 그러면
--     · 재원생의 학교와 시험 일정의 학교가 안 이어지고
--     · 같은 학교 시험이 둘로 갈리고
--     · 등급컷을 두 번 적게 된다
--   교재 이름이 갈리던 것과 **똑같은 문제**다.
--
-- 어떻게 고치나
--   1) neis_schools 를 schools 로 넓힌다. 나이스에 없는 학교도 들어갈 수 있게
--      코드 칸을 비울 수 있게 한다 (전학 온 학생의 옛 학교 같은 것).
--   2) 이름을 다듬은 **열쇠**로 같은 학교를 알아본다 (lib/schoolName 과 같은 규칙).
--   3) students · exam_periods 가 school_id 로 학교를 가리킨다.
--   4) school 글자 칸은 **지우지 않는다.** 대신 방아쇠로 school_id 를 따라
--      저절로 채워진다 — 화면 예순 몇 군데가 이 칸을 읽고 있고, 그것을 한꺼번에
--      고치는 것은 지금 할 일이 아니다. 진실은 school_id 하나다.

-- ── 1) 이름 열쇠 (lib/schoolName.js 의 schoolKey 와 같아야 한다) ──
create or replace function public.school_key(name text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(trim(name), '')),
        '여자중학교', '여중'), '여자고등학교', '여고'),
        '남자중학교', '남중'), '남자고등학교', '남고'),
        '초등학교', '초'), '중학교', '중'), '고등학교', '고'),
      '[[:space:]·・.,''"()\[\]{}/\\_-]', '', 'g'
    ), '');
$$;
comment on function public.school_key(text) is
  '학교 이름 비교용 열쇠. 신송중학교 = 신송중. lib/schoolName.js 와 같은 규칙이어야 한다.';

-- ── 2) neis_schools → schools ────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='neis_schools')
     and not exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='schools') then
    alter table public.neis_schools rename to schools;
  end if;
end $$;

create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 나이스에 없는 학교도 들어갈 수 있어야 한다
alter table public.schools alter column atpt_code drop not null;
alter table public.schools alter column schul_code drop not null;
alter table public.schools add column if not exists kind    text;
alter table public.schools add column if not exists aliases text[] not null default '{}';

-- 코드가 둘 다 있을 때만 겹치지 않게 (없는 것끼리는 겹쳐도 된다)
alter table public.schools drop constraint if exists neis_schools_atpt_code_schul_code_key;
create unique index if not exists schools_code_uniq
  on public.schools (atpt_code, schul_code)
  where atpt_code is not null and schul_code is not null;

-- 같은 이름의 학교가 둘이 되지 않게 — **이게 이 마이그레이션의 핵심**이다
create unique index if not exists schools_key_uniq
  on public.schools (public.school_key(name));

alter table public.schools enable row level security;
drop policy if exists staff_all on public.schools;
create policy staff_all on public.schools
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- 학생·학부모도 자기 학교 이름은 봐야 한다 (시험 일정에 붙어 나온다)
drop policy if exists school_read on public.schools;
create policy school_read on public.schools for select to authenticated using (true);

-- ── 3) 지금 쓰이는 학교 이름을 전부 넣는다 ────────────────
--    같은 열쇠는 한 줄로 뭉친다. 이름은 **가장 긴 것**을 남긴다
--    (「신송중」보다 「신송중학교」가 학부모께 보내는 문자에 낫다)
insert into public.schools (name)
select distinct on (public.school_key(n)) n
  from (
    select school as n from public.students     where coalesce(trim(school), '') <> ''
    union all
    select school as n from public.exam_periods where coalesce(trim(school), '') <> ''
  ) t
 where public.school_key(n) is not null
   and not exists (select 1 from public.schools s where public.school_key(s.name) = public.school_key(t.n))
 order by public.school_key(n), length(n) desc
on conflict do nothing;

-- ── 4) 학교를 가리키게 한다 ──────────────────────────────
alter table public.students     add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.exam_periods add column if not exists school_id uuid references public.schools(id) on delete set null;
create index if not exists students_school_idx     on public.students (school_id);
create index if not exists exam_periods_school_idx2 on public.exam_periods (school_id);

update public.students t set school_id = s.id
  from public.schools s
 where t.school_id is null
   and public.school_key(t.school) = public.school_key(s.name);

update public.exam_periods e set school_id = s.id
  from public.schools s
 where e.school_id is null
   and public.school_key(e.school) = public.school_key(s.name);

-- ── 5) 글자 칸은 school_id 를 따라간다 ───────────────────
--    진실은 school_id 하나다. school 은 화면이 읽는 **베낀 값**일 뿐이라
--    사람이 고칠 일이 없다. 학교 이름을 고치면 학생·시험이 저절로 따라온다.
create or replace function public.sync_school_name()
returns trigger language plpgsql as $$
begin
  if new.school_id is not null then
    select name into new.school from public.schools where id = new.school_id;
  end if;
  return new;
end $$;

drop trigger if exists students_school_name on public.students;
create trigger students_school_name before insert or update of school_id on public.students
  for each row execute function public.sync_school_name();

drop trigger if exists exams_school_name on public.exam_periods;
create trigger exams_school_name before insert or update of school_id on public.exam_periods
  for each row execute function public.sync_school_name();

-- 학교 이름을 고치면 그 학교를 가리키는 것들도 따라 바뀐다
create or replace function public.rename_school_cascade()
returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name then
    update public.students     set school = new.name where school_id = new.id;
    update public.exam_periods set school = new.name where school_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists schools_rename on public.schools;
create trigger schools_rename after update of name on public.schools
  for each row execute function public.rename_school_cascade();

-- ── 6) 출제 선생님은 **여러 명**일 수 있다 ────────────────
--    학년별로 나눠 내거나 공동 출제인 경우가 흔하다.
alter table public.exam_periods add column if not exists teachers text[];

update public.exam_periods
   set teachers = array[teacher]
 where teachers is null and coalesce(trim(teacher), '') <> '';

comment on column public.exam_periods.teachers is
  '출제 선생님 — 여러 명일 수 있다. teacher(단수) 는 옛 칸이라 쓰지 않는다.';

-- ─────────── 0077_task_targets.sql ───────────
-- 0077: 일정을 **누구에게** 인가
--
-- 지금은 전달 대상이 전체 · 반 · 학교/학년 셋뿐이고, 학교와 학년은 **글자로**
-- 적는다. 「신송중」이라고 쳐야 하는데 「신송중학교」라고 치면 아무에게도 안 간다.
-- 조용히 안 간다 — 화면에는 저장됐다고 뜬다.
--
-- 두 가지를 고친다.
--   1) 학생을 **골라서** 지목할 수 있게 (한 명이든 여럿이든)
--   2) 학교는 글자가 아니라 **학교 표(0076)를 가리키게**
--
-- 옛 칸(deliver_school 글자)은 **안 지운다.** 이미 적어둔 일정이 있고,
-- school_id 가 비어 있으면 예전처럼 글자로 맞춘다.

alter table public.tasks
  add column if not exists deliver_student_ids uuid[] not null default '{}',
  add column if not exists deliver_school_id   uuid references public.schools(id) on delete set null;

comment on column public.tasks.deliver_student_ids is
  '이 일정을 받을 학생을 직접 고른 것. deliver_scope = student 일 때 쓴다';
comment on column public.tasks.deliver_school_id is
  '학교 표를 가리킨다 (0076). 비어 있으면 옛 deliver_school 글자로 맞춘다';

create index if not exists tasks_deliver_school_idx
  on public.tasks (deliver_school_id) where deliver_school_id is not null;

-- 이미 적어둔 학교 글자를 학교 표에 이어 붙인다.
-- school_key() 로 맞추므로 「신송중」과 「신송중학교」가 같은 곳으로 간다.
update public.tasks t
   set deliver_school_id = s.id
  from public.schools s
 where t.deliver_school_id is null
   and coalesce(t.deliver_school, '') <> ''
   and public.school_key(s.name) = public.school_key(t.deliver_school);

-- ─────────── 0078_calendar_feed.sql ───────────
-- 0078: 구글 캘린더에서 **구독**하기
--
-- 원장님은 원래 구글 캘린더를 쓰고 싶으셨다. 안 돼서 앱에 달력을 만든 것이다.
-- 이제 앱이 달력 파일(.ics)을 내주고, 구글 캘린더에서 그 주소를 구독하면
-- 일정·시험·휴강이 **저절로 따라온다.** 폰 캘린더에도 같이 뜬다.
--
-- 한 방향이다 — 앱에서 넣은 것이 구글로 간다. 구글에서 넣은 것은 안 온다.
-- (양방향은 구글 로그인 연동이 있어야 한다. 그건 따로 한다)
--
-- ── 열쇠를 어떻게 다루나 ────────────────────────────────
-- 구글이 이 주소를 부를 때는 **로그인이 없다.** 그래서 주소에 붙은 긴 열쇠로
-- 확인한다. 열쇠를 아는 사람은 일정을 볼 수 있으므로
--   · 열쇠는 랜덤 32바이트
--   · 「나만 보기」 일정은 안 담는다
--   · 학생 이름은 안 담는다
--   · 언제든 새로 발급하면 옛 주소는 그 자리에서 죽는다

create table if not exists public.calendar_tokens (
  token       text primary key,
  label       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_used   timestamptz
);

alter table public.calendar_tokens enable row level security;
drop policy if exists staff_all on public.calendar_tokens;
create policy staff_all on public.calendar_tokens
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------------
-- 달력에 담을 것 — 일정 · 시험 · 휴강
--
-- security definer 다. 로그인 없이 부르므로 **열쇠가 맞을 때만** 값이 나온다.
-- 열쇠가 틀리면 빈 손이다 (없다고 알려주지도 않는다).
-- ------------------------------------------------------------
create or replace function public.calendar_feed(p_token text)
returns table (
  uid text, title text, from_date date, to_date date, note text, kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with ok as (
    select 1 from public.calendar_tokens t where t.token = p_token
  )
  -- 일정 (「나만 보기」 는 뺀다)
  select
    'task-' || t.id::text,
    t.title,
    t.due_on,
    coalesce(t.end_on, t.due_on),
    t.note,
    coalesce(t.category, '일정')
  from public.tasks t, ok
  where t.kind = 'schedule'
    and coalesce(t.private, false) = false
    and t.due_on >= current_date - 90
    and t.due_on <= current_date + 400

  union all

  -- 시험 (숨긴 것은 뺀다)
  select
    'exam-' || e.id::text,
    coalesce(e.school, '') || ' ' || coalesce(e.grade, '') || ' ' || coalesce(e.name, '시험'),
    e.from_date,
    e.to_date,
    case when e.english_on is null then null else '영어 시험 ' || e.english_on::text end,
    '시험'
  from public.exam_periods e, ok
  where coalesce(e.hidden, false) = false
    and e.to_date >= current_date - 90
    and e.from_date <= current_date + 400

  union all

  -- 휴강
  select
    'hol-' || h.id::text,
    coalesce(h.name, '휴강'),
    h.date,
    h.date,
    null,
    '휴강'
  from public.holidays h, ok
  where h.date >= current_date - 90
    and h.date <= current_date + 400;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- ─────────── 0079_parent_login.sql ───────────
-- 0079: 학부모 계정 · 선생님 권한
--
-- ── 1) 학부모 아이디 ──────────────────────────────────────
-- 학생 계정은 아이디를 `students.login_id` 에 적어뒀다. 학부모는 학생 줄이
-- 없으므로 적을 자리가 없었다 — 만들고 나면 **아이디를 다시 볼 방법이 없다.**
-- 학부모님이 "아이디가 뭐였죠" 하고 물으시면 답할 수가 없다.
alter table public.profiles
  add column if not exists login_id text;

create unique index if not exists profiles_login_id_key
  on public.profiles (login_id) where login_id is not null;

comment on column public.profiles.login_id is
  '학원이 준 아이디. 학생은 students.login_id 와 같고, 학부모는 여기에만 있다';

-- 이미 만들어둔 학생 계정의 아이디를 profiles 에도 채워둔다
update public.profiles p
   set login_id = s.login_id
  from public.students s
 where s.profile_id = p.id
   and p.login_id is null
   and coalesce(s.login_id, '') <> '';


-- ── 2) 선생님 권한 ────────────────────────────────────────
-- 지금은 원장·강사·조교가 **거의 같은 권한**이다. is_staff() 하나로 다 열린다.
-- 수강료도 · 발송 열쇠도 · 학생 계정 만들기도 조교가 할 수 있다.
--
-- 표 단위 RLS 를 한꺼번에 가르는 것은 위험하다 (마흔 개 표를 동시에 건드리게
-- 된다). 그래서 **알아볼 수 있는 함수부터** 만들어 두고, 화면과 서버 동작에서
-- 이것을 쓴다. 표 단위는 그다음이다.
create or replace function public.is_principal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'principal'
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role in ('principal','instructor')
  );
$$;

grant execute on function public.is_principal() to authenticated;
grant execute on function public.is_teacher() to authenticated;

-- 돈은 원장님 것이다. 조교가 볼 이유가 없다.
do $$
begin
  if to_regclass('public.payments') is not null then
    execute 'alter table public.payments enable row level security';
    execute 'drop policy if exists staff_all on public.payments';
    execute 'drop policy if exists principal_all on public.payments';
    execute 'create policy principal_all on public.payments for all to authenticated
             using (public.is_principal()) with check (public.is_principal())';
  end if;
end $$;

-- 발송 열쇠·연동 설정(integrations)은 **이미** 원장님만 볼 수 있다 (0015).
-- 여기서 다시 건드리지 않는다 — 잘 되고 있는 것을 고쳐서 깨뜨릴 이유가 없다.

-- ─────────── 0080_app_icon.sql ───────────
-- 0080: 로고를 원장님이 직접 올린다
--
-- 홈 화면 아이콘을 바꾸려면 지금은 **파일을 코드에 넣고 다시 배포**해야 한다.
-- 로고 하나 바꾸겠다고 개발자를 불러야 하는 것은 이상하다.
--
-- 그래서 올린 그림을 DB 에 담고, 앱이 그것을 아이콘으로 내어준다.
-- 크기별로 한 줄씩 (192 · 512 · 잘리는 판 · 아이폰 판 · 탭 아이콘).
--
-- ── 왜 저장소가 아니라 표인가 ──────────────────────────
-- Supabase 저장소(storage)는 아직 실제로 되는 것을 못 봤다 (docs/미확인).
-- 아이콘은 몇십 KB 짜리 그림 대여섯 장이라 표에 담아도 무겁지 않고,
-- **되는 것이 확인된 길**로 가는 편이 낫다. 나중에 저장소가 확인되면 옮긴다.

create table if not exists public.app_assets (
  key        text primary key,          -- icon-192 · icon-512 · apple · favicon …
  mime       text not null default 'image/png',
  data       text not null,             -- base64
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_assets enable row level security;

-- 읽기는 **누구나.** 홈 화면 아이콘은 로그인 전에도 받아가야 한다
-- (브라우저가 manifest 를 읽을 때는 로그인 정보가 없을 수 있다).
-- 담기는 것은 학원 로고뿐이라 감출 것이 없다.
drop policy if exists read_all on public.app_assets;
create policy read_all on public.app_assets
  for select to anon, authenticated
  using (true);

-- 바꾸는 것은 원장님만
drop policy if exists principal_write on public.app_assets;
create policy principal_write on public.app_assets
  for all to authenticated
  using (public.is_principal()) with check (public.is_principal());

comment on table public.app_assets is
  '원장님이 올린 그림 (홈 화면 아이콘). 크기별로 한 줄';

-- ─────────── 0081_app_assets_grant.sql ───────────
-- 0081: 아이콘을 **로그인 없이도** 받아갈 수 있게
--
-- 0080 에서 「읽기는 누구나」 정책을 걸었는데, 정책만으로는 부족하다.
-- Postgres 는 **정책(RLS) 과 권한(GRANT) 을 따로 본다.** 정책이 열려 있어도
-- 표에 대한 select 권한이 없으면 그냥 막힌다.
--
-- 새로 만든 표가 anon 에게 열려 있는지는 프로젝트 설정에 달려 있어서,
-- **그냥 여기서 못 박아 둔다.** 이게 없으면 로고가 조용히 404 로 떨어지고,
-- 화면에는 「안 바뀐다」 로만 보인다.

grant select on public.app_assets to anon, authenticated;

-- 바꾸는 것은 여전히 원장님만이다 (0080 의 정책이 그대로 판단한다).
grant insert, update, delete on public.app_assets to authenticated;

-- ─────────── 0082_todo_routines.sql ───────────
-- 0082: 주기적으로 되풀이되는 할일
--
-- 원장님 (2026-08-05) — 「주기적으로 할일을 관리하고 싶어, 기본 학습 목록처럼」
--
-- 학습 항목(homework_items)이 「무엇을 내줄 수 있나」 를 한 곳에 모아둔 것처럼,
-- **되풀이되는 할일도 한 곳에** 적어둔다. 매달 수강료 안내, 매주 월요일 교재
-- 점검, 매년 3월 학사일정 받아오기 — 이런 것들이다.
--
-- 설계 (원칙1: 같은 값 두 번 적지 않기)
--   · 되풀이 **규칙**만 여기 적는다. 실제 할일은 tasks 에 그대로 만들어진다.
--   · 만들어진 할일은 auto_key = 'routine:<루틴id>:<날짜>' 를 달고 있어서,
--     화면을 몇 번 열어도 **한 번만** 생긴다 (0028·0061 의 유일 인덱스).
--   · 그래서 체크·미루기·메모는 여느 할일과 똑같이 하면 된다.
--     여기에 「이번 달 했나」 를 따로 적어두지 않는다 — 두 군데가 되면 어긋난다.

create table if not exists public.todo_routines (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- 어떤 주기인가
  --   weekly  : dows 에 적은 요일마다        (예: 월·금)
  --   monthly : 매달 day_of_month 일          (말일은 31 로 적으면 그 달 말일)
  --   yearly  : 매년 month 월 day_of_month 일
  repeat_kind text not null default 'monthly',
  dows        text[] not null default '{}',   -- ['월','금']
  day_of_month int,
  month        int,
  -- 며칠 전부터 할일로 띄울까. 0 이면 그날 아침에 뜬다.
  -- (수강료 안내처럼 미리 준비할 것이 있으면 3~5일 앞이 낫다)
  lead_days   int not null default 0,
  todo_category_id uuid references public.todo_categories(id) on delete set null,
  priority    int not null default 0,
  note        text,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists todo_routines_active_idx on public.todo_routines (active, sort);

comment on table public.todo_routines is
  '되풀이되는 할일의 규칙. 실제 할일은 tasks 에 auto_key=routine:<id>:<날짜> 로 만들어진다.';

-- ------------------------------------------------------------
-- 권한 — 선생님만 본다. 학생·학부모에게 보일 것이 아니다.
-- (정책만 걸고 GRANT 를 빠뜨리면 조용히 막힌다 — 0081 에서 겪었다)
-- ------------------------------------------------------------
alter table public.todo_routines enable row level security;

drop policy if exists todo_routines_staff on public.todo_routines;
create policy todo_routines_staff on public.todo_routines
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('principal', 'instructor', 'assistant')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('principal', 'instructor', 'assistant')
    )
  );

grant select, insert, update, delete on public.todo_routines to authenticated;

-- ─────────── 0083_todo_routine_events.sql ───────────
-- 0083: 되풀이 할일에 **사건**을 더한다
--
-- 원장님 (2026-08-05)
--   「되풀이 할일이 신규 등록 시 할일이면 어떻게 해?」
--   「단어 교재 진도 끝나면 시험지 인쇄랑 클래스카드 플래너 설정 해야 하는데」
--
-- 둘 다 「때가 되면 늘 하는 일」 이다. 다만 그 **때**가 날짜가 아니다.
--   · 신규 학생이 들어오면  → 교재 안내 · 반 배정 · 계정 만들기 …
--   · 교재 진도가 끝나가면  → 시험지 인쇄 · 클래스카드 플래너 설정 …
--
-- 표를 새로 만들지 않는다. 0082 의 todo_routines 가 이미 「규칙을 적어두면
-- 때가 왔을 때 할일이 생긴다」 는 일을 한다. 여기에 **계기**만 늘린다.
-- 그래야 적는 자리도 하나, 고치는 자리도 하나다.
--
-- repeat_kind 에 두 가지가 늘어난다
--   student   신규 학생이 들어오면 그 학생마다 한 번
--   book_end  배정한 교재의 남은 단원이 lead_units 개 이하가 되면 한 번
--
-- 열쇠(tasks.auto_key)
--   routine:<id>:<날짜>                       — 날짜로 되풀이하는 것 (0082)
--   routine:<id>:s:<학생id>                   — 신규 학생
--   routine:<id>:b:<학생id>:<교재id>:<회독>   — 교재 끝나감
-- 회독이 열쇠에 들어간다. 2회독을 돌면 시험지도 다시 뽑아야 하기 때문이다.

-- 교재가 **몇 단원 남았을 때** 띄울까. 0 이면 다 끝난 뒤.
alter table public.todo_routines add column if not exists lead_units int not null default 2;

-- 어떤 교재에만 걸까. 비우면 배정된 교재 전부.
--   area  : 교재 영역 (단어 · 독해 · 문법 …) — 「단어 교재만」 이 실제 쓰임새다
alter table public.todo_routines add column if not exists book_area text;

comment on column public.todo_routines.lead_units is
  'book_end 일 때 — 남은 단원이 이 수 이하가 되면 할일을 만든다. 0이면 다 끝난 뒤.';
comment on column public.todo_routines.book_area is
  'book_end 일 때 — 이 영역의 교재에만 건다. 비우면 배정된 교재 전부.';

-- ─────────── 0084_student_activity.sql ───────────
-- 0084: 지금 이 아이가 **뭘 하고 있나** — 새로고침 없이 바로 보이게
--
-- 원장님 (2026-08-05)
--   「학생들한테 시험 볼 때 얘기하려고 했더니, 다른 학생 설명 중일 때
--    끼어들어서 말해. 시험 중 / 채점 중 / 문제 푸는 중 등 뭘 하고 있는지
--    새로고침 안 해도 실시간으로 반영되는 거 가능할까?」
--
-- 한 반에 여럿이 각자 다른 것을 한다. 지금 누가 시험 중인지 눈으로 세고
-- 있으면 설명하다 말고 고개를 들어야 하고, 그 사이에 아이가 끼어든다.
--
-- 설계
--   · 학생 한 명당 **한 줄**이다. 기록이 아니라 **지금 상태**라서 쌓지 않는다.
--     (몇 시에 무엇을 했는지는 오늘 수업 기록이 따로 남긴다)
--   · 날짜를 같이 둔다. 어제 「시험 중」 이 오늘 아침까지 떠 있으면 안 된다.
--   · 실시간은 Postgres 의 변경 알림(realtime)을 그대로 쓴다. 우리가 몇 초마다
--     물어보는 방식은 쓰지 않는다 — 수업 중에 배터리와 통신을 계속 먹는다.

create table if not exists public.student_activity (
  student_id uuid primary key references public.students(id) on delete cascade,
  date       date not null default current_date,
  -- idle(없음) · test(시험 중) · grading(채점 중) · solving(문제 푸는 중)
  -- · lesson(설명 듣는 중) · break(쉬는 중) · done(끝)
  -- 무엇이 있는지는 앱(lib/activity)에 적어둔다. 여기서는 글자로 받는다 —
  -- 상태 하나 늘릴 때마다 SQL 을 돌리게 하면 안 된다.
  state      text not null default 'idle',
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists student_activity_date_idx on public.student_activity (date);

comment on table public.student_activity is
  '지금 이 학생이 뭘 하고 있나. 기록이 아니라 현재 상태라 학생당 한 줄만 둔다.';

-- ------------------------------------------------------------
-- 권한 — 선생님만. 학생·학부모에게 보일 것이 아니다.
-- (정책만 걸고 GRANT 를 빠뜨리면 조용히 막힌다 — 0081 에서 겪었다)
-- ------------------------------------------------------------
alter table public.student_activity enable row level security;

drop policy if exists student_activity_staff on public.student_activity;
create policy student_activity_staff on public.student_activity
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
    )
  );

grant select, insert, update, delete on public.student_activity to authenticated;

-- ------------------------------------------------------------
-- 실시간 — 이 표의 변경을 브라우저로 흘려보낸다.
--
-- **이게 없으면 조용히 안 온다.** 화면에서는 「안 바뀐다」 로만 보이고,
-- 어디가 막혔는지 알 방법이 없다 (로고가 404 로 떨어지던 것과 같은 종류다).
-- 그래서 여기서 못 박아 둔다.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_activity'
  ) then
    -- 발행이 아직 없는 프로젝트면 만들지 않는다 (수파베이스가 만들어 둔다)
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.student_activity;
    end if;
  end if;
end $$;

-- 지운 줄까지 알려면 이전 값이 필요하다 (기본은 열쇠만 온다)
alter table public.student_activity replica identity full;

-- ─────────── 0085_activity_student.sql ───────────
-- 0085: 학생도 **자기 상태만** 바꿀 수 있게
--
-- 원장님 (2026-08-05) — 「학생 페이지에서 체크하면 그 내용이 현황판에 반영되게」
--
-- 0084 는 선생님만 쓸 수 있었다. 그런데 지금 뭘 하고 있는지 제일 잘 아는 것은
-- 그 아이 자신이고, 선생님은 설명하는 중이라 눌러줄 손이 없다.
--
-- **자기 줄만** 이다. 남의 상태를 바꿀 수 있으면 장난이 사고가 된다.
-- my_student_id() 는 지금 로그인한 사람의 학생 id 를 돌려준다 (0047).
--
-- 읽기도 자기 것만이다. 학생이 반 전체가 뭘 하는지 볼 까닭은 없고,
-- 「누가 시험 중인지」 는 학생끼리 알 일이 아니다.

drop policy if exists student_activity_mine on public.student_activity;
create policy student_activity_mine on public.student_activity
  for all
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

-- 학생이 무엇으로 바꿨는지 선생님이 알아야 한다.
-- 「선생님이 눌렀나 아이가 눌렀나」 는 판단이 달라진다 —
-- 아이가 「도움 필요」 를 누른 것은 지금 가보셔야 한다는 뜻이다.
alter table public.student_activity add column if not exists by_student boolean not null default false;

comment on column public.student_activity.by_student is
  '학생이 자기 화면에서 누른 것인가. 선생님이 눌러둔 것과 구별해서 보여준다.';

-- ─────────── 0086_activity_realtime.sql ───────────
-- 0086: 학생이 **이미 누르고 있는 것**을 실시간으로 흘려보낸다
--
-- 원장님 (2026-08-05)
--   「내가 바꾸는 게 아니고, 학생이 자기가 뭘 다 했는지 누르면 나한테 보이는 걸 원하는 거야」
--
-- 맞다. 상태를 손으로 골라 넣게 하면 그것부터 일이 된다. 아이는 이미 누르고
-- 있다 — 학습을 시작하면 타이머가 돌고(study_sessions), 다 하면 「다 했어요」
-- 를 눌러 student_done_at 이 찍힌다(daily_report_items).
--
-- **새 표를 만들지 않는다.** 그 두 표의 변경을 실시간으로 받기만 하면 된다.
-- 무엇을 몇 개 했는지는 서버가 늘 세던 대로 세고, 알림이 오면 다시 센다.
--
-- 이게 없으면 조용히 안 온다. 화면에서는 「안 바뀐다」 로만 보이고 어디가
-- 막혔는지 알 방법이 없다 (0084 에서 같은 것을 못 박아 뒀다).

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;                       -- 수파베이스가 만들어 두는 것이라, 없으면 건너뛴다
  end if;
  foreach t in array array['daily_report_items', 'study_sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────── 0087_homework_changed.sql ───────────
-- 0087: 숙제가 **바뀐 것**을 학생이 알아볼 수 있게
--
-- 원장님 (2026-08-05)
--   「선생님이 숙제를 추가하거나 변경하면 변경된 부분은 따로 표시해주고
--    학생에게 알림이 가게 해줘」
--
-- 지금은 저장할 때마다 그 날 항목을 통째로 지우고 다시 넣는다. 그래서 아이
-- 화면에서는 **무엇이 새로 생겼는지 알 방법이 없다** — 목록이 통째로 새것이다.
--
-- 그래서 「언제 바뀌었나」 를 줄마다 적어둔다.
--   · 처음 저장할 때는 **비워 둔다.** 그날 처음 받은 숙제는 「바뀐 것」이 아니다.
--   · 나중에 고쳐서 새로 생기거나 범위가 달라진 줄에만 시각을 찍는다.
-- 그러면 아이 화면에서 「비어 있지 않은 것 = 바뀐 것」 으로 그냥 읽힌다.
-- 며칠이 지났는지 따로 셈하지 않아도 된다.

alter table public.daily_report_items
  add column if not exists changed_at timestamptz;

comment on column public.daily_report_items.changed_at is
  '처음 준 숙제가 아니라 나중에 더하거나 고친 것. 학생 화면에서 「바뀜」 으로 표시한다.';

-- ─────────── 0088_parent_login_id.sql ───────────
-- 0088: **학부모도 아이디로 로그인되게**
--
-- 0079 에서 profiles.login_id 를 만들었는데, 로그인할 때 아이디를 이메일로
-- 바꿔주는 함수(0045)는 **students 표만** 보고 있었다. 학부모는 students 에
-- 줄이 없다. 그래서 학부모 계정을 아무리 만들어도 **로그인이 안 된다.**
--
-- 화면에는 「아이디 또는 비밀번호가 맞지 않아요」 로만 뜬다 — 아이디가 틀린
-- 것도 비번이 틀린 것도 아니고 찾을 데를 안 본 것인데, 그걸 알 방법이 없다.
--
-- 그리고 **전화번호를 아이디로 쓴다** (원장님, 2026-08-05).
-- 어머니는 010-1234-5678 처럼 하이픈을 넣어 치실 수 있다. 그때 「맞지 않아요」
-- 가 뜨면 무엇이 틀렸는지 알 수가 없다. 숫자만 남겨서 한 번 더 찾아본다.

create or replace function public.email_for_login_id(p_login_id text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  with q as (
    select lower(btrim(p_login_id)) as raw,
           regexp_replace(btrim(p_login_id), '\D', '', 'g') as digits
  )
  select u.email from q, public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
   where lower(s.login_id) = q.raw
  union all
  -- 학부모·선생님 — students 에 줄이 없다
  select u.email from q, public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.login_id) = q.raw
  union all
  -- 하이픈을 넣어 치셨을 때 (010-1234-5678 → 01012345678)
  select u.email from q, public.profiles p
    join auth.users u on u.id = p.id
   where q.digits <> '' and p.login_id = q.digits
  limit 1;
$$;

revoke all on function public.email_for_login_id(text) from public;
grant execute on function public.email_for_login_id(text) to anon, authenticated;

-- **이 SQL 이 돌았는지 알 수 있어야 한다.**
--
-- 이건 표도 칸도 안 만들고 **함수의 속만** 고친다. 그래서 「무엇이 있나」 를
-- 찔러보는 검사로는 옛것과 새것을 가릴 수가 없고, 검사에 안 걸리면
-- 설정 화면의 「한 번에 실행」 이 이 파일을 아예 건너뛴다.
-- (0081 에서 똑같은 일을 겪었다 — 확인할 방법이 없는 SQL 은 없는 것과 같다)
--
-- 그래서 **표시 하나**를 같이 둔다. 하는 일은 없고, 있는지 없는지가 곧
-- 이 파일이 돌았는지다.
create or replace function public.login_lookup_v2()
returns boolean language sql immutable as $$ select true $$;

grant execute on function public.login_lookup_v2() to anon, authenticated;

-- ─────────── 0089_class_guides.sql ───────────
-- 0089: 수업 가이드 링크
--
-- 원장님 (2026-08-06) — 「수업 가이드 링크를 설정에서 넣고 학생 화면에 띄워줘」
--
-- 무엇인가 — 학원 밖에 있는 안내다. 단어 외우는 방법 영상, 노션에 적어둔
-- 수업 규칙, 교재 사는 곳, 발음 연습 사이트 … 지금은 그걸 카톡으로 보내신다.
-- 카톡으로 보내면 그 링크는 **하루 만에 없어진다** — 대화가 밀려 올라가고,
-- 새로 온 아이에게는 아예 안 간다.
--
-- 왜 integrations 가 아닌가 (여기서 한 번 막혔다)
--   설정값은 원래 integrations 에 담는다. 그런데 그 표는 **원장님만 읽을 수 있다**
--   (0015). 학생 화면은 학생 자기 계정으로 읽으므로, 거기 넣으면 학생에게는
--   빈 목록만 보인다 — 아무 오류도 없이. 그래서 표를 따로 둔다.
--   비밀값이 아니라 **일부러 보여주려고 넣는 것**이라 갈라놓아도 잃는 것이 없다.
--
-- 규칙
--   · 원장님·강사가 넣고 고친다
--   · 학생·학부모는 **켜둔 것만 읽는다** (지운 것 · 꺼둔 것은 안 보인다)
--   · sort 로 순서를 잡는다. 아이가 제일 먼저 봐야 할 것이 위로 온다

create table if not exists public.class_guides (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  url        text not null,
  note       text,                                   -- 한 줄 설명 (없어도 된다)
  sort       integer not null default 100,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_guides_sort_idx on public.class_guides (sort, created_at);

alter table public.class_guides enable row level security;

-- 넣고 고치는 것은 선생님만
drop policy if exists guide_staff on public.class_guides;
create policy guide_staff on public.class_guides
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 켜둔 것만 읽는다.
--   is_staff() 를 또 붙이지 않는다 — 위 정책이 이미 선생님을 열어준다.
drop policy if exists guide_read on public.class_guides;
create policy guide_read on public.class_guides
  for select to authenticated
  using (active);

comment on table public.class_guides is
  '수업 가이드 링크. 설정에서 넣고 학생·학부모 화면에 띄운다 (0089).';

-- ─────────── 0090_parent_reads_reports.sql ───────────
-- 0090: 학부모도 자기 아이 수업 기록을 읽는다
--
-- **학부모 화면이 지금까지 거의 비어 있었다.**
--
-- daily_reports 와 daily_report_items 의 읽기 규칙(0016)이 이렇게 되어 있었다.
--
--   선생님이거나, students.profile_id = auth.uid()  ← **학생 본인만**
--
-- 학부모 계정은 students 에 줄이 없다. parent_student 로 아이와 이어져 있을
-- 뿐이다. 그래서 어머니가 로그인하시면 이번 달 현황도, 최근 수업도, 숙제도
-- 한 줄도 안 나왔다. 오류도 안 났다 — RLS 는 **없는 것처럼** 보여준다.
--
-- 왜 여태 몰랐나: 원장님은 재원생 목록의 「학부모 화면」 으로 확인하신다.
-- 그때는 선생님 계정이라 is_staff() 로 전부 통과한다. **미리보기로는 절대
-- 안 잡히는 종류의 버그다.** 보이는 사람과 못 보는 사람이 다르기 때문이다.
--
-- 규칙을 my_student_ids() 하나로 맞춘다 (0057). 이 함수는 「내 아이 + 나 자신」
-- 을 함께 돌려주므로, 학생·학부모를 두 줄로 나눠 적을 필요가 없다.
-- scores(0072) · notice_receipts(0064) 가 이미 이 방식이다 — 표마다 다른
-- 방식으로 적어두면 언젠가 한 곳을 빠뜨리고, 빠뜨린 그 한 곳이 이렇게 된다.

drop policy if exists student_self_reports on public.daily_reports;
create policy student_self_reports on public.daily_reports
  for select to authenticated
  using (
    public.is_staff()
    or daily_reports.student_id in (select public.my_student_ids())
  );

drop policy if exists student_self_items on public.daily_report_items;
create policy student_self_items on public.daily_report_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.daily_reports r
       where r.id = daily_report_items.daily_report_id
         and r.student_id in (select public.my_student_ids())
    )
  );

-- (아이가 낸 숙제 homework_submissions 는 0044 에서 이미 학부모 읽기를 열어뒀다.
--  그래서 여기서는 건드리지 않는다 — 멀쩡한 규칙을 다시 쓰면 무엇이 언제
--  왜 바뀌었는지가 흐려진다.)


-- ------------------------------------------------------------
-- 이게 들어갔는지 화면에서 확인할 수 있게 표식을 하나 둔다.
--
-- 이 SQL 은 표도 칸도 만들지 않는다 — **읽기 규칙만** 고친다. 설정 화면의
-- 「지금 DB 상태」 는 표와 칸을 보고 판단하므로, 이대로 두면 목록에 아예 안
-- 뜬다. 안 뜨면 안 돌리시고, 안 돌리면 학부모 화면이 계속 비어 있다.
-- (0086 이 그래서 목록에 없고, 그래서 켜졌는지 아무도 모른다)
--
-- 그래서 **있기만 하면 되는 함수**를 하나 만든다. 이 함수가 불리면 0090 이
-- 들어간 것이다. 하는 일은 지금 규칙이 학부모까지 여는지 그대로 답해주는 것뿐.
-- ------------------------------------------------------------
create or replace function public.parent_reads_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'daily_reports'
       and policyname = 'student_self_reports'
       and qual like '%my_student_ids%'
  );
$$;

revoke all on function public.parent_reads_reports() from public;
grant execute on function public.parent_reads_reports() to authenticated;

-- ─────────── 0091_task_audience.sql ───────────
-- 0091: 일정은 **자기 것만** 보인다
--
-- 원장님 (2026-08-06)
--   「일정은 해당 학교 학생이거나 일정에 학생이 연결된 경우에
--    학생·학부모에게 노출시켜」
--
-- 지금까지는 **일정이면 전부 보였다** (0066: 할일이 아니고 나만 보기가 아니면
-- 끝). 그래서 신송중 학사일정이 다른 학교 아이 달력에도 떴고, 한 아이만
-- 해당하는 보강 일정이 온 학원에 보였다. 달력이 남의 일로 가득 차면
-- **자기 것도 안 보게 된다.**
--
-- 규칙은 하나다 — **대상을 적었으면 그 대상에게만, 안 적었으면 모두에게.**
--
--   deliver_student_ids 에 내 아이가 있다      → 보인다
--   deliver_school_id(또는 옛 글자)가 내 학교   → 보인다
--   deliver_class_id 가 내 반                   → 보인다
--   deliver_grade 가 적혀 있으면 학년까지 맞아야 한다
--   넷 다 비어 있다                             → 모두에게 (학원 휴강 · 전국 공통)
--
-- **안 적은 것을 「아무도 아님」 으로 보면 안 된다.** 그렇게 하면 지금까지
-- 적어둔 일정이 하루아침에 전부 사라진다. 안 적은 것은 「모두」 다.

-- ------------------------------------------------------------
-- 내 아이(들)의 학교 · 반 — RLS 안에서 students 를 직접 읽으면 서로 물고
-- 늘어지므로 security definer 로 한 겹 감싼다 (0057 과 같은 이유).
-- ------------------------------------------------------------
create or replace function public.task_for_me(
  p_students uuid[],
  p_school_id uuid,
  p_school text,
  p_grade text,
  p_class uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- 대상을 하나도 안 적었으면 모두에게 (학원 전체 휴강 · [전국] 수능일 …)
    when coalesce(array_length(p_students, 1), 0) = 0
     and p_school_id is null
     and coalesce(p_school, '') = ''
     and coalesce(p_grade, '') = ''
     and p_class is null
    then true

    else
      -- 1) 학생을 콕 집은 것
      exists (
        select 1 from unnest(coalesce(p_students, '{}'::uuid[])) u(id)
         where u.id in (select public.my_student_ids())
      )
      -- 2) 우리 학교 (학년까지 적혀 있으면 학년도 맞아야 한다)
      or exists (
        select 1 from public.students s
         where s.id in (select public.my_student_ids())
           and (
             (p_school_id is not null and s.school_id = p_school_id)
             -- school_id 를 안 붙인 옛 일정은 글자로 맞춘다.
             -- school_key 로 맞추므로 「신송중」과 「신송중학교」가 같은 곳이다
             or (p_school_id is null
                 and coalesce(p_school, '') <> ''
                 and public.school_key(s.school) = public.school_key(p_school))
             -- 학교는 안 적고 **학년만** 적은 것 (「중3 전체」).
             -- 학년이 적혀 있을 때만이다 — 이 조건을 빼먹었다가 학생·반만
             -- 지목한 일정이 전부 새어 나갔다 (학교가 안 적혀 있다는 이유로
             -- 이 줄이 참이 되어버린다). 검사가 잡았다: scripts/check-parent.sh
             or (p_school_id is null and coalesce(p_school, '') = ''
                 and coalesce(p_grade, '') <> '')
           )
           and (coalesce(p_grade, '') = '' or s.grade = p_grade)
      )
      -- 3) 우리 반
      or (p_class is not null and p_class in (select public.my_class_ids()))
    end;
$$;

revoke all on function public.task_for_me(uuid[], uuid, text, text, uuid) from public;
grant execute on function public.task_for_me(uuid[], uuid, text, text, uuid) to authenticated;


-- 학생·학부모는 **일정만, 잠그지 않은 것만, 자기 것만** 읽는다
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
    and public.task_for_me(
      tasks.deliver_student_ids,
      tasks.deliver_school_id,
      tasks.deliver_school,
      tasks.deliver_grade,
      tasks.deliver_class_id
    )
  );


-- ------------------------------------------------------------
-- 이미 받아둔 나이스 학사일정에 **학교를 붙인다.**
--
-- 나이스 일정은 학교마다 받아오는데 학교를 어디에도 안 적어뒀다 — 제목에만
-- 「신송중 개교기념일」 처럼 들어 있었다. 글자는 규칙이 아니라서 그것으로는
-- 가릴 수 없다. source_id 가 `<학교코드>:<날짜>:<이름>` 이라 여기서 뽑아 붙인다.
--
-- 전국 공통 줄은 source_id 가 `common:` 으로 시작한다 — 안 걸리므로 그대로
-- 모두에게 남는다 (수능일은 학교가 정하는 것이 아니다).
-- ------------------------------------------------------------
update public.tasks t
   set deliver_school_id = s.id
  from public.schools s
 where t.source = 'neis'
   and t.deliver_school_id is null
   and coalesce(s.schul_code, '') <> ''
   and t.source_id like s.schul_code || ':%';


-- ------------------------------------------------------------
-- 들어갔는지 화면에서 확인할 표식 (0090 과 같은 까닭).
--
-- 이 SQL 도 표·칸을 안 만들고 읽기 규칙만 고친다. 「지금 DB 상태」 는 표와
-- 칸을 보므로 이대로면 목록에 안 뜨고, 안 뜨면 안 돌리시게 된다.
--
-- task_for_me() 자체를 확인에 쓸 수는 없다 — 값을 다섯 개 받는 함수라
-- 그냥 부르면 「그런 함수 없음」 이 되어, 들어가 있어도 「없음」 으로 뜬다.
-- 그래서 **아무것도 안 받는** 표식 함수를 따로 둔다.
-- ------------------------------------------------------------
create or replace function public.task_audience_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tasks'
       and policyname = 'task_read_shared'
       and qual like '%task_for_me%'
  );
$$;

revoke all on function public.task_audience_on() from public;
grant execute on function public.task_audience_on() to authenticated;

-- ─────────── 0092_task_audience_explicit.sql ───────────
-- 0092: **대상을 안 적으면 안 보인다.** 「전체」 라고 골라야 전체에 보인다
--
-- 원장님 (2026-08-06)
--   「대상을 안 적으면 안 보여야지. 전체라고 설정해야 전체한테 보이게 해줘」
--
-- 0091 에서 나는 반대로 했다 — 「안 적었으면 모두에게」. 이유는 이미 적어둔
-- 일정이 하루아침에 사라지는 것이 무서워서였다. 그런데 그건 **한 번 겪고 마는
-- 일**이고, 안 적은 것이 새어 나가는 것은 **앞으로 계속 겪는 일**이다.
-- 매번 겪는 쪽을 안전하게 두는 것이 맞다.
--
-- 그리고 이쪽이 원래 맞다. 일정을 적을 때 「누가 보나」 를 생각 안 했다면
-- 그건 **아직 안 정한 것**이지 「모두」 가 아니다. 모를 때 열어주는 쪽이 사고다.
--
-- 새 규칙 — deliver_scope 하나로 정한다.
--
--   all      전체 (재원생·학부모 모두)      ← **골라야 보인다**
--   class    그 반
--   grade    그 학교 · 그 학년
--   student  고른 아이들
--   (비움)   **아무에게도 안 보임** — 선생님만 보는 일정
--
-- 「전체」 를 골랐으면 대상 칸이 비어 있어도 보인다. 그게 전체의 뜻이다.

create or replace function public.task_for_me(
  p_scope text,
  p_students uuid[],
  p_school_id uuid,
  p_school text,
  p_grade text,
  p_class uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- **전체라고 고른 것만** 모두에게 간다
    when coalesce(p_scope, '') = 'all' then true

    -- 대상을 하나도 안 적었으면 아무에게도 안 보인다 (선생님만 보는 일정).
    -- 「아직 안 정한 것」 을 「모두」 로 읽으면 안 된다
    when coalesce(array_length(p_students, 1), 0) = 0
     and p_school_id is null
     and coalesce(p_school, '') = ''
     and coalesce(p_grade, '') = ''
     and p_class is null
    then false

    else
      -- 1) 학생을 콕 집은 것
      exists (
        select 1 from unnest(coalesce(p_students, '{}'::uuid[])) u(id)
         where u.id in (select public.my_student_ids())
      )
      -- 2) 우리 학교 (학년까지 적혀 있으면 학년도 맞아야 한다)
      or exists (
        select 1 from public.students s
         where s.id in (select public.my_student_ids())
           and (
             (p_school_id is not null and s.school_id = p_school_id)
             -- school_id 를 안 붙인 옛 일정은 글자로 맞춘다.
             -- school_key 로 맞추므로 「신송중」과 「신송중학교」가 같은 곳이다
             or (p_school_id is null
                 and coalesce(p_school, '') <> ''
                 and public.school_key(s.school) = public.school_key(p_school))
             -- 학교는 안 적고 **학년만** 적은 것 (「중3 전체」).
             -- 학년이 적혀 있을 때만이다 — 이 조건을 빼먹었다가 학생·반만
             -- 지목한 일정이 전부 새어 나갔다 (0091 · check-parent.sh 가 잡았다)
             or (p_school_id is null and coalesce(p_school, '') = ''
                 and coalesce(p_grade, '') <> '')
           )
           and (coalesce(p_grade, '') = '' or s.grade = p_grade)
      )
      -- 3) 우리 반
      or (p_class is not null and p_class in (select public.my_class_ids()))
    end;
$$;

revoke all on function public.task_for_me(text, uuid[], uuid, text, text, uuid) from public;
grant execute on function public.task_for_me(text, uuid[], uuid, text, text, uuid) to authenticated;

-- **규칙을 먼저 갈아끼우고 나서** 옛 함수를 지운다.
--   순서를 거꾸로 했다가 한 번 크게 당했다. 0091 의 규칙이 아직 옛 함수를
--   붙들고 있는데 함수를 먼저 지우면 「딸린 것이 있다」 며 거절당하고,
--   Supabase 는 한 덩어리로 실행하므로 **그 뒤가 통째로 안 들어간다.**
--   그런데 앞부분은 이미 들어간 것처럼 보여서, 규칙만 옛것으로 남는다.
--   검사(scripts/check-parent.sh)가 「대상 안 적은 일정이 보인다」 로 잡았다.
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
    and public.task_for_me(
      tasks.deliver_scope,
      tasks.deliver_student_ids,
      tasks.deliver_school_id,
      tasks.deliver_school,
      tasks.deliver_grade,
      tasks.deliver_class_id
    )
  );


-- 이제 아무도 안 붙들고 있으니 0091 의 다섯 칸짜리를 지운다.
-- 남겨두면 「어느 쪽이 도는 거지」 가 된다
drop function if exists public.task_for_me(uuid[], uuid, text, text, uuid);


-- ------------------------------------------------------------
-- 이미 들어 있는 것 정리
--
-- 규칙이 뒤집혔으므로 **아무것도 안 하면 지금 있는 일정이 전부 안 보이게 된다.**
-- 뜻이 분명한 것만 여기서 살려두고, 나머지는 원장님이 보시면서 정하신다
-- (할일 화면의 일정마다 「누가 보나」 가 뜬다).
-- ------------------------------------------------------------

-- 1) 나이스 **전국 공통** (수능일 · 모의고사 · 공휴일) — **비공개로 둔다.**
--
--    원장님 (2026-08-06)
--      「전국공통은 오히려 나만보기야. 안 그러면 학생 학부모가
--       중요한 일정을 인식을 못 해」
--
--    처음에는 여기서 'all' 로 열어뒀다. 학교가 정하는 것이 아니라 모두에게
--    해당한다는 이유였는데, **해당한다는 것과 알아야 한다는 것은 다르다.**
--
--    수능일·모의고사·공휴일은 아홉 학교에 다 걸려서 한 해에 수십 줄이 된다.
--    중2 아이에게 수능일은 아무 상관이 없다. 그것들이 달력을 채우면 정작
--    봐야 할 우리 학교 시험이 그 사이에 묻힌다. **많이 보여주는 것과 알게
--    하는 것은 다른 일이고, 여기서는 오히려 반대로 간다.**
--
--    정말 알려야 하는 것(고3 수능일 같은)은 원장님이 그 한 줄만 「전체」 로
--    열어주시면 된다. 한 줄이면 묻히지 않는다.
--    앞으로 받아오는 것도 비공개로 들어온다 (app/schedule/neisActions.js) —
--    열어둔 것은 다시 받아와도 열린 채로 남는다.
update public.tasks
   set private = true
 where source = 'neis'
   and source_id like 'common:%'
   and coalesce(deliver_scope, '') = ''
   and coalesce(private, false) = false;

-- 2) 나이스 **학교별** 학사일정. 0091 에서 학교를 붙여뒀으니 뜻을 그대로 적어준다
update public.tasks
   set deliver_scope = 'grade'
 where source = 'neis'
   and deliver_school_id is not null
   and coalesce(deliver_scope, '') = '';

-- 3) 대상을 적어둔 것 (학생·반·학교) 은 scope 만 비어 있으면 채워준다.
--    적어둔 것이 있는데 안 보이면 「적었는데 왜 안 가지」 가 된다
update public.tasks
   set deliver_scope = 'student'
 where coalesce(deliver_scope, '') = ''
   and coalesce(array_length(deliver_student_ids, 1), 0) > 0;

update public.tasks
   set deliver_scope = 'class'
 where coalesce(deliver_scope, '') = ''
   and deliver_class_id is not null;

update public.tasks
   set deliver_scope = 'grade'
 where coalesce(deliver_scope, '') = ''
   and (deliver_school_id is not null
        or coalesce(deliver_school, '') <> ''
        or coalesce(deliver_grade, '') <> '');


-- 표식 — 이 SQL 이 들어갔는지 화면에서 본다 (0090·0091 과 같은 까닭)
create or replace function public.task_audience_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tasks'
       and policyname = 'task_read_shared'
       and qual like '%deliver_scope%'
  );
$$;

revoke all on function public.task_audience_on() from public;
grant execute on function public.task_audience_on() to authenticated;

-- ─────────── 0093_screen_notes.sql ───────────
-- 0093: 화면 안내 문구를 **원장님이 직접 적는다**
--
-- 원장님 (2026-08-06)
--   「메뉴에 대한 안내는 설정페이지에서 내가 직접 적게해줘 특히 학생학부모용」
--
-- 지금 화면의 안내 문구는 전부 내가 코드에 박아 넣은 것이다.
--   「숙제를 누르면 하는 법이 나와요」  「집에서 폰을 못 쓰면 찍어 두세요」
-- 나쁘지 않지만 **내 말투**다. 학원마다 아이들에게 하는 말이 다르고,
-- 한 학원 안에서도 학년마다 다르다. 그리고 고치려면 매번 나를 불러야 한다.
--
-- 그래서 **자리만 코드가 잡고, 말은 원장님이 적는다.**
--   · 안 적으시면 원래 문구가 그대로 나온다 (빈 화면이 되면 안 된다)
--   · 적으시면 그것이 대신 나온다
--
-- 자리 이름(key)은 `me.homework` 처럼 **화면.자리** 로 짓는다.
-- 새 자리가 생기면 lib/screenNotes.js 에 한 줄 적으면 설정 화면에 저절로 뜬다.

create table if not exists public.screen_notes (
  key        text primary key,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.screen_notes is
  '화면에 뜨는 안내 문구. 자리 이름은 lib/screenNotes.js 의 SPOTS 에 있다';

alter table public.screen_notes enable row level security;

-- **학생·학부모도 읽어야 한다.** 그분들 보라고 적는 글이다.
-- 비밀이 담길 자리가 아니다 — 원래도 화면에 그대로 떠 있던 문구다.
drop policy if exists note_read_all on public.screen_notes;
create policy note_read_all on public.screen_notes
  for select to authenticated using (true);

-- 적는 것은 선생님만
drop policy if exists note_write_staff on public.screen_notes;
create policy note_write_staff on public.screen_notes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0095_screen_layouts.sql ───────────
-- 0095: 화면 **구성 순서**를 원장님이 정한다
--
-- 원장님 (2026-08-06)
--   「화면에서 모든 페이지 — 학생 학부모 포함 — 구성 내용 순서를 수정할 수 있게 해줘」
--
-- 지금까지 화면에 무엇이 어떤 차례로 놓이는지는 전부 내가 정했다. 그런데
-- **무엇을 먼저 보여줄지는 학원마다 다르다.** 어떤 학원은 숙제가 먼저고,
-- 어떤 학원은 이번 달 성취도가 먼저다. 학기 중과 방학 중이 다르기도 하다.
--
-- 그리고 이건 코드를 고칠 일이 아니다. 순서 하나 바꾸자고 나를 부르고,
-- 배포를 기다리고, 앱을 새로 받으셔야 하는 것이 이상하다.
--
-- 한 화면에 한 줄로 담는다.
--   order_keys   놓을 차례 (여기 없는 것은 원래 자리에 그대로 남는다)
--   hidden_keys  아예 안 보일 것
--
-- **여기 없는 덩어리가 사라지면 안 된다.** 새 덩어리를 만들었을 때 순서를
-- 다시 안 정했다고 화면에서 없어지면, 만든 사람도 모르는 채로 지나간다.
-- 그래서 order_keys 에 없는 것은 **원래 차례 그대로 뒤에** 붙는다 (0067 과 같은 규칙).

create table if not exists public.screen_layouts (
  page        text primary key,          -- 'me' | 'parent' | …  (lib/screenLayout.js 의 PAGES)
  order_keys  text[] not null default '{}',
  hidden_keys text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.screen_layouts is
  '화면 덩어리의 차례와 숨김. 덩어리 목록은 lib/screenLayout.js 의 PAGES 에 있다';

alter table public.screen_layouts enable row level security;

-- **학생·학부모도 읽어야 한다.** 그분들 화면의 차례를 담은 것이라,
-- 못 읽으면 정해둔 순서가 그분들에게만 안 먹는다. 비밀이 담길 자리가 아니다.
drop policy if exists layout_read_all on public.screen_layouts;
create policy layout_read_all on public.screen_layouts
  for select to authenticated using (true);

-- 정하는 것은 선생님만
drop policy if exists layout_write_staff on public.screen_layouts;
create policy layout_write_staff on public.screen_layouts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────── 0096_holidays_visible.sql ───────────
-- 0096: 휴강과 「보강만 하는 요일」 을 학생·학부모도 읽는다
--
-- 원장님 (2026-08-06)
--   「그냥 정상수업은 굳이 넣지마 정보과잉이야.
--    아니다 몇 회차 수업인지를 표시하면 좋겠어 — 1회차 이렇게」
--
-- 달력에 「수업 17:00」 이 요일마다 찍히는 것은 아무것도 알려주지 않는다.
-- 자기 수업 요일은 아이도 어머니도 이미 안다. 대신 **몇 회차인지**는 모른다 —
-- 그리고 그게 수강료·보강과 이어지는 숫자라서, 그건 알아야 한다.
--
-- 회차를 세려면 두 가지가 필요하다.
--   1. **휴강한 날** — 쉰 날은 회차에서 빠진다
--   2. **보강만 하는 요일** — 정규 회차가 아니다 (설정의 schedule.makeupDays)
-- 둘 다 지금은 선생님만 읽을 수 있어서, 학생 화면에서 세면 숫자가 틀린다.
-- **틀린 회차는 없는 것보다 나쁘다** — 「3회차라며?」 가 된다.

-- 휴강은 감출 것이 아니다. 오히려 **제일 알려야 하는 것**이다
-- (그날 헛걸음하지 않으시라고). 달력에도 같이 띄운다.
drop policy if exists holiday_read_all on public.holidays;
create policy holiday_read_all on public.holidays
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- 설정 중 **딱 한 줄만** 열어준다.
--
-- integrations 는 발송 열쇠가 들어 있는 표라 원장님만 읽는다 (0015).
-- 그 규칙은 그대로 두고, 「보강만 하는 요일」 한 줄만 따로 연다.
-- 여기에는 비밀이 없다 — 금요일은 보강만 한다는 말뿐이다.
--
-- 표 전체를 열면 언젠가 그 표에 열쇠를 하나 더 넣게 되고, 그때
-- 아무도 이 줄을 기억하지 못한다. 그래서 **id 를 못 박아** 둔다.
-- ------------------------------------------------------------
drop policy if exists schedule_read_all on public.integrations;
create policy schedule_read_all on public.integrations
  for select to authenticated
  using (id = 'schedule');


-- 표식 — 이 SQL 이 들어갔는지 화면에서 본다 (0090·0092 와 같은 까닭).
-- 읽기 규칙만 고치는 SQL 은 표·칸으로 확인할 수가 없다.
create or replace function public.holidays_visible()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'holidays'
       and policyname = 'holiday_read_all'
  );
$$;

revoke all on function public.holidays_visible() from public;
grant execute on function public.holidays_visible() to authenticated;

-- ─────────── 0097_exam_questions.sql ───────────
-- 0097: 시험을 **문항까지** 남긴다
--
-- 원장님 (2026-08-06)
--   「내신성적은 아예 여태 정리를 못했어. 통합설계해줘」
--   「학생별 오답 기록해서 이렇게 리포트 만들고 싶어」
--   (앞서) 「내신은 아예 기록을 안 했네. 학생별 틀린 문제를 기록해서 써야 해」
--
-- 지금은 시험 한 번에 **총점 한 줄**만 남는다. 92점이라는 것은 알아도
-- **무엇을 틀렸는지는 안 남는다.** 그래서 「관계사가 약하다」 를 원장님
-- 기억으로만 아시고, 아이가 바뀌면 처음부터 다시 보셔야 한다.
--
-- 노션 자료를 보니 모의고사 오답분석DB 에는 이미 **문항별로** 적고 계셨다
-- (틀린 번호 + 왜 틀렸는지). 그것이 제일 쓸모 있는 자료인데 성적표와 따로
-- 놀고 있었다. 합친다.
--
-- ── 붙이는 곳 ────────────────────────────────────────────
--
-- 새 표를 다섯 개 만들지 않는다. **이미 있는 둘에 하나씩 붙인다.**
--
--   exam_periods (시험 회차)  →  exam_questions  그 시험지의 문항 구성
--   scores       (학생 응시)  →  score_items     그 학생의 문항별 결과
--
-- 시험지 문항표는 **반 전체가 같이 쓴다** — 한 번 적으면 그 시험을 본
-- 아이 전부에게 쓰인다. 학생마다 다시 적으면 열 번을 적게 되고, 하나만
-- 잘못 쳐도 그 아이만 분석이 다르게 나온다 (등급컷에서 이미 겪은 일이다).
--
-- ── 문항표가 없어도 된다 ─────────────────────────────────
--
-- 모의고사 45문항 구성은 **학년·회차와 상관없이 똑같다** (고1·고2·고3 5회분
-- 675문항을 비교했다). 그래서 앱이 표준 문항표를 갖고 있고 (lib/examSpec.js),
-- 모의고사는 문항표를 안 적어도 영역별 정답률이 나온다.
--
-- 반드시 적게 하면 노션에서 옮겨올 11줄이 못 들어온다. **있으면 쓰고
-- 없으면 번호만** 쓴다.
--
-- ── 다만 「거의」 안 바뀐다 ───────────────────────────────
--
-- 원장님 (2026-08-06)
--   「거의 안 바뀌긴 하는데, 18번은 목적 이런 식으로 유형이 정해져 있긴
--    한데 상황에 따라 모의고사 유형은 바뀔 수 있어.
--    기본값을 세팅하되, 수정 가능하게 해줘」
--
-- 그래서 **세 겹**으로 둔다.
--   1. 코드에 박힌 표준표      lib/examSpec.js  — 아무것도 안 하셔도 도는 값
--   2. 학원 기본 문항표        exam_spec_rows   — 한 번 고치면 앞으로 다 바뀜
--   3. 그 회차만의 문항표      exam_questions   — 이번 시험만 다를 때
--
-- 위엣것이 없으면 아래로 내려간다. 3월 학평에서 18번이 「심경」으로 나왔다면
-- 그 회차만 고치고, 아예 출제 체제가 바뀌었으면 기본 문항표를 고친다.
-- 코드를 고치러 오셔야 하는 구조는 결국 안 고쳐진다.

-- ------------------------------------------------------------
-- 1) 시험지의 문항 하나
-- ------------------------------------------------------------
create table if not exists public.exam_questions (
  id       uuid primary key default gen_random_uuid(),
  exam_id  uuid not null references public.exam_periods(id) on delete cascade,
  no       int not null,                    -- 문항 번호

  area     text,                            -- 듣기 · 독해 · 문법 · 어휘 · 서술형
  topic    text,                            -- 분석 영역 (대의파악 · 빈칸추론 …)
  detail   text,                            -- 세부 유형 (글의 제목 · 문장 삽입 …)

  answer   text,                            -- 정답 (①~⑤ 또는 글자)
  points   numeric,                         -- 배점

  -- **여기 둘이 곧 출제분석이다.** 내신은 「어디서 나왔나」 가 다음 시험
  -- 대비를 정한다 — 교과서에서 60% 나오는 학교와 외부지문이 반인 학교는
  -- 시켜야 할 공부가 다르다.
  unit     text,                            -- 교과서 5과 · Lesson 3 · 부교재 p.40
  source   text,                            -- 교과서 | 부교재 | 모의고사 변형 | 외부지문 | 기타

  note     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  unique (exam_id, no)                      -- 한 시험지에 같은 번호는 하나
);
create index if not exists exam_questions_exam_idx on public.exam_questions (exam_id, no);

comment on table  public.exam_questions is '시험지의 문항 구성 — 반 전체가 같이 쓴다';
comment on column public.exam_questions.unit   is '내신 출제분석 — 교과서 몇 과에서 나왔나';
comment on column public.exam_questions.source is '내신 출제분석 — 교과서/부교재/모의고사 변형/외부지문';

-- ------------------------------------------------------------
-- 1-2) **학원 기본 문항표** — 회차마다 안 적으셔도 되게
--
--      모의고사는 45문항 구성이 거의 안 바뀐다. 그래서 한 벌만 두고
--      전 회차가 같이 쓴다. 여기가 비어 있으면 코드에 박힌 표준표를 쓴다
--      (lib/examSpec.js) — **아무것도 안 하셔도 리포트가 나온다.**
--
--      kind 를 둔 것은 내신에도 학교마다 늘 같은 틀이 있기 때문이다
--      (신송중은 늘 서술형 5문항). 지금은 mock 만 쓴다.
-- ------------------------------------------------------------
create table if not exists public.exam_spec_rows (
  id     uuid primary key default gen_random_uuid(),
  kind   text not null default 'mock',      -- mock | school | unit
  no     int  not null,
  area   text,
  topic  text,
  detail text,
  points numeric,
  updated_at timestamptz not null default now(),
  unique (kind, no)
);
create index if not exists exam_spec_rows_kind_idx on public.exam_spec_rows (kind, no);

comment on table public.exam_spec_rows is
  '학원 기본 문항표 — 비어 있으면 코드의 표준표를 쓴다. 회차별로 다르면 exam_questions 가 이긴다';

alter table public.exam_spec_rows enable row level security;

drop policy if exists staff_all on public.exam_spec_rows;
create policy staff_all on public.exam_spec_rows
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생도 읽는다 — 자기 오답이 무슨 유형이었는지 못 보면 번호만 남는다
drop policy if exists read_spec on public.exam_spec_rows;
create policy read_spec on public.exam_spec_rows
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2) 그 학생의 그 문항
--
--    **틀린 것만 넣어도 된다.** 45줄을 다 넣게 하면 아무도 안 쓴다.
--    「14,21,24,32」 만 적으면 나머지는 맞은 것으로 본다 —
--    노션에서도 그렇게 적고 계셨다 (「틀린 문제 번호」 칸).
-- ------------------------------------------------------------
create table if not exists public.score_items (
  id       uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  no       int not null,

  wrong    boolean not null default true,   -- 기본이 「틀림」 이다 (틀린 것만 넣으므로)
  picked   text,                            -- 아이가 고른 답
  reason   text,                            -- 왜 틀렸나 (아래 목록)
  note     text,

  created_at timestamptz not null default now(),
  unique (score_id, no)
);
create index if not exists score_items_score_idx on public.score_items (score_id, no);

comment on table  public.score_items is '학생의 문항별 결과 — 틀린 것만 넣어도 된다';
comment on column public.score_items.reason is
  '단어를 몰랐어요 | 해석을 못했어요 | 어법을 몰랐어요 | 실수했어요 | 발음이 들리지 않았어요 | 다른 문제를 푸느라 놓쳤어요 | 기타';

-- ------------------------------------------------------------
-- 3) 성적이 **어느 회차인지 확실히 안다**
--
--    지금은 날짜와 학교로 **추측**하고 있다 (lib/scores.js findExam).
--    등급컷은 추측해도 크게 안 틀리지만, 문항별 분석을 엉뚱한 시험지로
--    하면 「3번은 어법」 이 통째로 어긋난다. 그래서 못 박을 자리를 만든다.
--    비어 있으면 지금처럼 날짜로 찾는다.
-- ------------------------------------------------------------
alter table public.scores add column if not exists exam_id uuid
  references public.exam_periods(id) on delete set null;
create index if not exists scores_exam_idx on public.scores (exam_id);

-- 아이가 스스로 적은 것 (오답 적기 화면). 노션 폼이 하던 일이다.
alter table public.scores add column if not exists self_note text;   -- 잘한 점 · 부족한 점 · 하고 싶은 말
alter table public.scores add column if not exists filled_at timestamptz;

comment on column public.scores.exam_id   is '어느 회차인가 — 비어 있으면 날짜로 찾는다';
comment on column public.scores.self_note is '아이가 적은 것 — 잘한 점 · 부족했던 점 · 하고 싶은 말';

-- ------------------------------------------------------------
-- 4) 누가 보고 누가 쓰나
--
--    성적(scores)의 규칙을 그대로 따른다 — 선생님은 다, 학생·학부모는
--    **자기 것만.** 문항 결과는 성적보다 더 개인적인 자료다
--    (무엇을 몰랐는지가 그대로 적혀 있다).
--
--    문항표(exam_questions)는 시험지 정보라 학생도 읽는다 — 자기 오답이
--    무슨 유형이었는지 못 보면 오답 화면이 번호만 남는다. 쓰기는 선생님만.
-- ------------------------------------------------------------
alter table public.exam_questions enable row level security;
alter table public.score_items    enable row level security;

drop policy if exists staff_all on public.exam_questions;
create policy staff_all on public.exam_questions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists read_questions on public.exam_questions;
create policy read_questions on public.exam_questions
  for select to authenticated
  using (true);

drop policy if exists staff_all on public.score_items;
create policy staff_all on public.score_items
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 내 것(또는 우리 아이 것)만 읽는다 — my_student_ids() 가 학생 본인과
-- 학부모를 함께 처리한다 (0079)
drop policy if exists mine_read on public.score_items;
create policy mine_read on public.score_items
  for select to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

-- 아이가 **자기 오답만** 적는다. 남의 것에는 못 쓴다.
drop policy if exists mine_write on public.score_items;
create policy mine_write on public.score_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

drop policy if exists mine_update on public.score_items;
create policy mine_update on public.score_items
  for update to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  )
  with check (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

-- ------------------------------------------------------------
-- 5) 이 파일이 실행됐는지 화면이 알 수 있게 (설정 → DB 상태)
-- ------------------------------------------------------------
create or replace function public.exam_questions_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0098_score_items_merged.sql ───────────
-- 0098: 틀린 문제를 **한 표로** 합치고, 아이가 직접 적게 한다
--
-- 원장님 (2026-08-06)
--   「학생용 화면에서 자기 시험 결과를 입력하게 해줘 — 문법, 내신, 모의고사 전부」
--
-- ── 1) 같은 것이 두 표에 있었다 ──────────────────────────
--
--   score_wrongs (0072)  선생님이 손으로 적던 자리. question 이 「12번」 이라는
--                        **글자**이고 topic·reason 도 자유 입력이다
--   score_items  (0097)  방금 만든 자리. no 가 **숫자**라 영역별 정답률이 계산된다
--
-- 둘 다 「무엇을 틀렸나」 다. 두 군데에 두면 반드시 어긋난다 — 선생님이
-- score_wrongs 에 적은 오답은 리포트에 안 잡히고, 아이가 적은 것은 성적
-- 화면에 안 뜬다. 같은 화면을 보면서 서로 「왜 없지」 를 하게 된다.
-- (0074 에서 시험 회차를 합칠 때와 같은 이야기다.)
--
-- score_items 로 합친다. 숫자로 세는 쪽만이 리포트를 만들 수 있다.
--
-- **다만 번호를 모르는 오답이 있다.** 「서술형 2」 처럼 적어두신 것,
-- 번호 없이 「관계대명사」 만 적어두신 것. 버리면 안 되므로 `no` 를 비울 수
-- 있게 하고, 번호가 없는 것은 목록에는 보이되 **영역별 셈에서는 빠진다.**
-- 없는 번호를 지어내면 45문항이 46문항이 된다.
--
-- ── 2) 학부모는 대신 못 적는다 ───────────────────────────
--
-- 0097 의 쓰기 규칙이 `my_student_ids()` 였는데, 그것은 **학부모도 통과한다**
-- (0079 에서 어머니가 아이 것을 읽으라고 만든 함수다). 성적(scores)은 이미
-- 「학생 본인만 낸다」 로 막혀 있었는데(0072) 문항만 뚫려 있었다.
--
-- 어머니가 대신 적어주시면 **기록이 거짓이 된다** — 「해석을 못했어요」 를
-- 고른 것이 아이가 아니게 되고, 그 위에 세운 분석이 전부 어긋난다.
-- 같은 규칙으로 맞춘다.
--
-- ── 3) 아이가 자기가 적은 것을 고칠 수 있어야 한다 ────────
--
-- 넣기만 되고 고치기가 안 되면, 잘못 적은 아이는 두 줄을 만든다.
-- **자기가 낸 것(source='form')만** 고친다 — 선생님이 매긴 성적은 못 건드린다.

-- ------------------------------------------------------------
-- 1) 번호를 모르는 오답도 담을 수 있게
-- ------------------------------------------------------------
alter table public.score_items alter column no drop not null;

-- unique (score_id, no) 는 no 가 null 이면 여러 줄을 허용한다 (Postgres 기본).
-- 그대로 두면 「번호 없는 오답」 을 여러 개 적을 수 있어서 오히려 맞다.

alter table public.score_items add column if not exists label text;
comment on column public.score_items.label is
  '번호로 못 적는 것 — 「서술형 2」 · 「듣기 마지막」. no 가 비었을 때 화면에 이것을 보여준다';

-- ------------------------------------------------------------
-- 2) score_wrongs 를 옮긴다
--
--    「12번」 → 12,  「서술형 2」 → no 는 비우고 label 에 그대로.
--    같은 번호가 두 번 적혀 있으면 앞엣것만 (unique 에 걸린다).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.score_wrongs') is not null then
    insert into public.score_items (score_id, no, wrong, reason, label, note)
    select distinct on (w.score_id, nullif(substring(w.question from '^\s*(\d+)'), '')::int)
           w.score_id,
           nullif(substring(w.question from '^\s*(\d+)'), '')::int,
           true,
           w.reason,
           -- 번호로 안 읽히는 것만 label 에 남긴다 (「12번」 은 no 로 충분하다)
           case when w.question ~ '^\s*\d+' then null else nullif(trim(w.question), '') end,
           -- topic 은 문항표가 갖는 자리다. 손으로 적어두신 것은 메모로 남긴다
           nullif(concat_ws(' · ', nullif(trim(w.topic), ''), nullif(trim(w.note), '')), '')
      from public.score_wrongs w
     where not exists (
       select 1 from public.score_items i
        where i.score_id = w.score_id
          and i.no is not distinct from nullif(substring(w.question from '^\s*(\d+)'), '')::int
     )
     order by w.score_id,
              nullif(substring(w.question from '^\s*(\d+)'), '')::int,
              w.sort;

    drop table public.score_wrongs;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) 누가 쓰나 — **학생 본인만.** 학부모는 읽기만
-- ------------------------------------------------------------
-- SETUP_ALL 은 여러 번 실행된다 — 새 이름도 먼저 지운다
drop policy if exists mine_write  on public.score_items;
drop policy if exists mine_update on public.score_items;
drop policy if exists own_insert  on public.score_items;
drop policy if exists own_update  on public.score_items;
drop policy if exists own_delete  on public.score_items;

create policy own_insert on public.score_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

create policy own_update on public.score_items
  for update to authenticated
  using (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

-- 잘못 적은 것을 지울 수 있어야 한다 — 못 지우면 틀린 오답이 영영 남는다
create policy own_delete on public.score_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4) 아이가 **자기가 낸 성적만** 고친다
--
--    선생님이 매긴 성적(source 가 form 이 아닌 것)은 못 건드린다.
--    아이가 자기 점수를 고칠 수 있으면 그 기록은 더 이상 성적이 아니다.
-- ------------------------------------------------------------
drop policy if exists score_own_update on public.scores;
create policy score_own_update on public.scores
  for update to authenticated
  using (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  )
  with check (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  );

-- 잘못 낸 것을 물릴 수 있게 (자기가 낸 것만)
drop policy if exists score_own_delete on public.scores;
create policy score_own_delete on public.scores
  for delete to authenticated
  using (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 5) 화면이 이 파일이 돌았는지 알 수 있게
-- ------------------------------------------------------------
create or replace function public.score_items_merged()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0099_unit_test_in_class.sql ───────────
-- 0099: 단원평가는 **오늘 수업에서 적는 그것**이다
--
-- 원장님 (2026-08-06)
--   「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 걸 말하는 거야」
--
-- 학생용 화면에 「문법 단원평가」 칸을 만들려다 멈췄다. **이미 적고 계신다** —
-- 오늘 수업 → 테스트 → 「문장」 이 그것이다 (daily_reports.sent_correct/total).
-- 아이에게 또 적게 하면 같은 시험이 두 줄이 되고, 숫자가 다르면 어느 쪽이
-- 맞는지 아무도 모른다.
--
-- 그래서 **학생 화면에서는 뺐고**, 대신 이미 적고 계신 곳을 성적과 잇는다.
--
-- ── 지금 빠져 있는 것 둘 ─────────────────────────────────
--
-- 노션 단원평가DB 에는 있는데 오늘 수업에는 없는 것이 둘이다.
--
--   **단원명**       「관계대명사」 · 「문장의 형식」
--   **통과/재시험**  이것이 핵심이다. 원장님이 보시는 것은 점수가 아니라
--                    **몇 번 만에 통과했나** 다 (왕희연은 문장의 형식을
--                    다섯 번 봤다)
--
-- 이 둘을 daily_reports 에 붙인다. 새 표를 만들지 않는다 — 선생님은 수업
-- 중에 한 화면에서만 치셔야 한다.
--
-- ── 그리고 성적으로 흘려보낸다 ───────────────────────────
--
-- 리포트(scores, kind='unit')는 노션에서 옮겨온 122줄이 사는 곳이다.
-- 오늘 수업에서 적은 것이 거기로 안 가면, 이관한 옛 기록과 앞으로 쌓일
-- 기록이 갈라진다.
--
-- **daily_reports 가 원본이고 scores 는 사본이다.** 오늘 수업을 저장할 때마다
-- (학생·날짜) 를 열쇠로 덮어쓴다 — 같은 날 두 번 저장해도 한 줄이고,
-- 점수를 고치면 사본도 따라 고쳐진다. 사본이 스스로 달라질 길이 없다.
--
-- (원본을 scores 로 옮기고 daily_reports 에서 빼는 쪽이 더 깨끗하지만,
--  이번 달 현황·학부모 화면·월간 리포트가 전부 sent_* 를 읽고 있다.
--  그것을 한꺼번에 갈아엎는 것은 지금 할 일이 아니다.)

alter table public.daily_reports add column if not exists sent_unit   text;
alter table public.daily_reports add column if not exists sent_passed boolean;

comment on column public.daily_reports.sent_unit is
  '단원평가 단원명 — 관계대명사 · 문장의 형식. 비어 있으면 그냥 문장 테스트';
comment on column public.daily_reports.sent_passed is
  '통과했나 — 원장님이 보시는 것은 점수가 아니라 몇 번 만에 통과했나다';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.unit_test_in_class()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0100_unit_volume.sql ───────────
-- 0100: 단원의 **실제 내용과 분량**
--
-- 원장님 (2026-08-06)
--   「주로 쓰는 교재들을 올려볼게. 단원 엑셀을 어떻게 구성하는 게 좋을지
--    개선해줘. 나는 단원의 실제 내용과 분량을 오늘 수업에서 확인하고
--    숙제를 주고 싶은 거야」
--
-- ── 교재 세 권을 열어보고 알게 된 것 ─────────────────────
--
-- 「분량」 을 말하는 방식이 교재마다 다르다.
--
--   중2 문법 워크북 (Unit 01~67)   Unit 02 = **딱 한 쪽**인데 문제가 25개다
--   수능 어법 교재                  Testing Point 01 = pp.014~017 (네 쪽)
--   교과서 워크북 (동아 이병민)      Lesson 5 가주어 it = Practice 4문항
--
-- 지금 표에는 **페이지**와 **단어 수**만 있다 (page_start/end, word_count).
-- 그래서 중2 워크북은 어느 단원이든 「1쪽」 이라 분량을 알 수가 없다 —
-- 25문항짜리와 8문항짜리가 화면에 똑같이 보인다.
--
-- **문항 수가 빠져 있었다.** 문법 교재에서 숙제 분량을 정하는 것은 쪽수가
-- 아니라 문항 수다.
--
-- ── 그리고 「무엇을 하는 단원인지」 ───────────────────────
--
-- 단원명이 「Unit 02」 이면 화면에서 아무것도 알 수 없다. 「1형식 문장과
-- 2형식 문장」 까지는 이름에 들어가지만, 실제로 시키는 것은
-- **「보어 자리에 형용사가 오는지 부사가 오는지 고르기」** 다.
-- 오늘 수업에서 숙제를 정하실 때 보셔야 하는 것이 그것이다.
--
-- 교재를 펴보지 않고도 정하실 수 있어야 한다. 펴봐야 하면 결국 안 쓴다.

alter table public.textbook_units
  add column if not exists question_count int,     -- 이 단원의 문항 수 (25)
  add column if not exists question_range text,    -- 문항 범위 (01-06 · 16-25)
  add column if not exists summary        text,    -- 무엇을 하는 단원인가 (한 줄)
  add column if not exists minutes        int;     -- 예상 소요 시간 (분)

comment on column public.textbook_units.question_count is
  '문항 수 — 문법 교재는 쪽수가 아니라 이것이 분량이다 (중2 워크북은 어느 단원이든 한 쪽이다)';
comment on column public.textbook_units.question_range is
  '문항 범위 — 01-06 처럼. 한 단원을 나눠서 낼 때 쓴다';
comment on column public.textbook_units.summary is
  '무엇을 하는 단원인가 한 줄 — 「보어 자리 형용사/부사 고르기」. 교재를 펴보지 않고 정하시라고';
comment on column public.textbook_units.minutes is
  '예상 소요 시간(분). 비어 있으면 문항 수·쪽수·단어 수로 짐작한다';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.unit_volume_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0101_score_share.sql ───────────
-- 0101: 성적을 **누구에게 보여줄지** 아이마다 정한다
--
-- 원장님 (2026-08-06) — 다른 학원 화면을 보여주시며
--   「성장 공개 대상 — 비공개 / 학생만 / 학부모만 / 둘다」
--   「다른 학원 거라 그대로 따를 필요 없이 장점만 취해」
--
-- ── 왜 필요한가 ──────────────────────────────────────────
--
-- 성적은 **보여주는 것이 늘 좋은 자료가 아니다.**
--
--   · 점수가 무너진 달에 어머니가 먼저 보시면, 원장님이 설명하실 기회가
--     없이 전화가 온다. 같은 숫자라도 **누가 먼저 말하느냐**로 상담이 달라진다
--   · 반대로 아이에게는 보여줘야 하는데 어머니께는 아직인 경우가 있다
--     (본인 의지로 올라오는 중인 아이)
--   · 형제가 있으면 성적 이야기가 집에서 견주는 이야기가 되기도 한다
--
-- 그래서 아이마다 넷 중 하나를 고른다. **기본은 「둘 다」** — 지금까지
-- 학생·학부모 모두 성적을 보고 있었으므로, SQL 을 실행하는 순간 누군가의
-- 화면에서 자료가 사라지면 안 된다.
--
-- ── 화면에서 감추는 것과 자료를 막는 것은 다르다 ─────────
--
-- 블록만 감추면 **막힌 것이 아니다.** 그래서 읽기 규칙(RLS)에서 막는다.
--
-- 다만 **아이가 스스로 낸 것(source='form')은 늘 자기에게 보인다.**
-- 안 그러면 방금 적어 낸 오답이 화면에서 사라져서, 아이는 저장이 안 된 줄
-- 알고 또 적는다. 자기가 적은 것을 자기가 못 보는 것은 규칙이 아니라 고장이다.

alter table public.students
  add column if not exists score_share text not null default 'both';

comment on column public.students.score_share is
  '성적·리포트를 누구에게 보여줄까 — none(비공개) | student(학생만) | parent(학부모만) | both(둘 다). 기본 both';

-- 잘못된 값이 들어가면 조용히 아무에게도 안 보이게 된다 → 아예 막는다
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_score_share_chk'
  ) then
    alter table public.students
      add constraint students_score_share_chk
      check (score_share in ('none', 'student', 'parent', 'both'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 읽기 규칙 — 학생 본인인지 학부모인지를 **갈라서** 본다
--
--   my_student_ids() 는 둘을 구분하지 않는다 (0079 에서 어머니가 아이 것을
--   읽으라고 만든 함수다). 여기서는 구분해야 하므로 직접 본다.
-- ------------------------------------------------------------
create or replace function public.score_visible(p_student uuid, p_source text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
     where s.id = p_student
       and (
         -- 학생 본인
         (s.profile_id = auth.uid()
          and (coalesce(s.score_share, 'both') in ('student', 'both')
               -- **자기가 적어 낸 것은 늘 보인다.** 안 보이면 저장이 안 된 줄
               -- 알고 또 적는다 — 규칙이 아니라 고장이다
               or coalesce(p_source, '') = 'form'))
         -- 학부모
         or (exists (
               select 1 from public.parent_student ps
                where ps.student_id = s.id
                  and ps.parent_profile_id = auth.uid())
             and coalesce(s.score_share, 'both') in ('parent', 'both'))
       )
  )
$$;

comment on function public.score_visible(uuid, text) is
  '이 성적을 지금 보는 사람에게 보여줘도 되나 (0101). 선생님은 이 함수를 안 탄다';

drop policy if exists score_own on public.scores;
create policy score_own on public.scores
  for select to authenticated
  using (public.score_visible(scores.student_id, scores.source));

-- 문항별 오답도 같은 규칙. 성적은 감췄는데 오답은 보이면 감춘 것이 아니다
drop policy if exists mine_read on public.score_items;
create policy mine_read on public.score_items
  for select to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and public.score_visible(s.student_id, s.source)
    )
  );

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.score_share_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0102_apply_form.sql ───────────
-- ============================================================
-- 0102. 신규 상담 양식 — 희망 시간표 · 글로 적는 희망 시간 · 개인정보 동의
--
-- 원장님 (2026-08-06)
--   「학생 레벨테스트와 방문상담 원하는 시간은 텍스트로 입력하게 해줘.
--    구체적으로 적으면 맞춰줄 수가 없어」
--   「희망요일 말고 6가지 중에 희망시간표를 선택하게 해. 중복 가능이야」
--   「개인정보수집동의 ... 체크박스 만들어줘」
--
-- 왜 칸을 새로 파나
--   `test_want_on` · `visit_on` 은 **날짜 칸(date)** 이다. 「평일 오후 아무때나」
--   를 넣을 수가 없다. 억지로 날짜로 받으면 학부모는 하루를 찍어야 하고,
--   원장님은 그 하루에 못 맞춰서 다시 전화하시게 된다 — 양식을 받은 보람이 없다.
--
--   날짜 칸은 **지우지 않는다.** 원장님이 상담 목록에서 **확정한 날**을 적는
--   자리로 그대로 쓴다. 희망(글)과 확정(날짜)은 다른 것이다.
-- ============================================================

-- 학부모가 고른 시간표 (여러 개). 글자 열쇠는 lib/applySlots 의 SLOTS.key
alter table public.inquiries add column if not exists want_slots text[] not null default '{}';

-- 희망 시간을 **글로** — 「평일 오전이면 아무때나」 「토요일 빼고」
alter table public.inquiries add column if not exists test_want_text text;
alter table public.inquiries add column if not exists visit_want_text text;

-- 개인정보 수집·이용에 동의한 때. **언제 동의했는지가 곧 증거다** —
-- true/false 로 두면 나중에 「언제 동의했나」 에 답할 수 없다
alter table public.inquiries add column if not exists privacy_agreed_at timestamptz;

comment on column public.inquiries.want_slots       is '학부모가 고른 희망 시간표 (lib/applySlots 의 key)';
comment on column public.inquiries.test_want_text   is '레벨테스트 희망 시간 — 글로 적은 것';
comment on column public.inquiries.visit_want_text  is '방문상담 희망 시간 — 글로 적은 것';
comment on column public.inquiries.privacy_agreed_at is '개인정보 수집·이용에 동의한 때 (개인정보 보호법 제15조)';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.apply_form_v2()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0103_makeup_waived.sql ───────────
-- ============================================================
-- 0103. 보강 없음 — 결석했지만 보강을 안 하기로 한 것
--
-- 원장님 (2026-08-06)
--   「Dashboard 에 보강일정 잡으라는데 아직 결석 안 했고 사전연락 없는데
--    뭐지. 대시보드에서 보강 없음 버튼도 만들어줘」
--
-- ── 왜 필요한가 ──────────────────────────────────────────
--
-- 「보강 잡을 것」 은 **결석 줄이 있는데 보강 줄이 없으면** 뜬다. 그래서
-- 보강을 안 하기로 한 결석은 **영원히 목록에 남는다.** 치우는 길이
-- 「없는 보강을 억지로 잡기」 밖에 없었다 — 그러면 출결 기록이 거짓이 된다.
--
-- 결석은 결석대로 남기고, **보강은 안 한다**는 것만 따로 적는다.
-- 지우지 않는 이유는 늘 같다: 회차·수강료가 그 결석을 세고 있다.
--
-- 흔한 경우
--   · 당일 결석 (원장님 규칙상 보강 없음)
--   · 시험 기간 결석 예정을 한꺼번에 넣었는데 실제로는 안 빠진 아이
--   · 노션에서 옮겨온 옛 결석 — 이미 지난 일이라 보강할 것이 없다
-- ============================================================

alter table public.attendance add column if not exists makeup_waived boolean not null default false;

comment on column public.attendance.makeup_waived is
  '보강을 안 하기로 한 결석 (0103). 결석 기록은 그대로 두고 「보강 잡을 것」 에서만 내린다';

-- 「보강 잡을 것」 을 셀 때 쓰는 길
create index if not exists attendance_makeup_waived_idx
  on public.attendance (status, makeup_waived) where status = 'absent';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.makeup_waived_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0104_staff_push.sql ───────────
-- ============================================================
-- 0104. 학생이 부르면 선생님 폰에 알림이 뜨게
--
-- 원장님 (2026-08-06) — 「학생이 도움을 요청해도 알림이 안 와」
--
-- ── 왜 안 왔나 ──────────────────────────────────────────
--
-- 코드는 멀쩡했다. 학생이 「도와주세요」 를 누르면 `pushToStaff` 를 부른다.
-- 그런데 그 함수가 **학생의 자격으로** DB 를 읽는다 (서버에서 도는 코드라도
-- 로그인한 사람의 권한으로 읽는다). 그래서 —
--
--   · `integrations` 의 알림 열쇠 → **원장님만** 읽을 수 있다 (0015)
--   · 선생님들의 `push_subscriptions` → 본인 것이나 선생님만 (0016)
--
-- 둘 다 학생에게는 **빈 값**으로 온다. 오류가 아니다 — 그냥 없는 것처럼 온다.
-- 그러면 `pushToStaff` 는 「알림을 안 쓰시는구나」 하고 **조용히 넘어간다.**
--
-- 이 앱에서 여러 번 겪은 바로 그 모양이다. 읽기 규칙은 막을 때 오류를 내지
-- 않고 **아무것도 없는 것처럼** 굴어서, 화면도 로그도 멀쩡해 보인다.
--
-- ── 어떻게 고치나 ────────────────────────────────────────
--
-- 보내야 할 곳을 **표 주인 자격으로** 찾아주는 함수를 하나 둔다
-- (`security definer` — 부른 사람이 아니라 표 주인의 권한으로 돈다).
--
-- **아무나 부르면 안 된다.** 우리 학원 사람인지 확인한다 —
-- 학생 본인이거나, 학부모이거나, 선생님일 때만 답한다.
--
-- 다만 이 함수는 알림 열쇠(개인키)를 돌려준다. 학생 계정을 가진 사람이
-- 이 함수를 직접 불러 **선생님 폰에 가짜 알림을 보낼 수는 있다.**
-- 자료가 새는 것은 아니고(구독 주소는 그 자체로 쓸모가 없다), 학원 안 사람만
-- 부를 수 있다. 더 단단히 하려면 보내는 일을 아예 우리 서버 바깥으로
-- 빼야 하는데(웹훅), 그건 설정이 늘어난다. 지금은 이쪽을 고른다.
-- ============================================================

create or replace function public.staff_push_targets()
returns table (
  endpoint text,
  p256dh text,
  auth text,
  public_key text,
  private_key text,
  contact text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  -- **우리 학원 사람인가** — 학생 본인 · 학부모 · 선생님만
  if not exists (select 1 from public.students s where s.profile_id = auth.uid())
     and not exists (select 1 from public.parent_student ps where ps.parent_profile_id = auth.uid())
     and not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
     )
  then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;                                  -- 알림을 아직 안 켜신 상태
  end if;

  return query
    select ps.endpoint, ps.p256dh, ps.auth,
           cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact'
      from public.push_subscriptions ps
      join public.profiles p on p.id = ps.profile_id
     where p.role in ('principal', 'instructor', 'assistant');
end;
$$;

comment on function public.staff_push_targets() is
  '학생·학부모가 선생님께 알림을 보낼 때 쓸 대상 (0104). 읽기 규칙을 넘어야 해서 security definer';

revoke all on function public.staff_push_targets() from public, anon;
grant execute on function public.staff_push_targets() to authenticated;

-- ------------------------------------------------------------
-- **같은 병이 하나 더 있었다** — 선생님이 보내실 때도.
--
-- 알림 열쇠는 **원장님만** 읽는다 (0015). 그러니 강사·조교가 리포트를
-- 올리거나 댓글을 다시면, 보낼 열쇠를 못 찾아 **조용히 안 보내진다.**
-- 지금은 원장님 혼자 쓰셔서 안 드러났을 뿐, 선생님이 한 분 늘면 바로
-- 「저는 올렸는데 알림이 안 갔대요」 가 된다.
--
-- 열쇠 자체는 여전히 잠가 둔다 — 이 함수는 **선생님에게만** 답한다
-- (학생·학부모는 위의 staff_push_targets 로만 닿는다).
-- ------------------------------------------------------------
create or replace function public.push_keys()
returns table (public_key text, private_key text, contact text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
  ) then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;
  end if;

  return query select cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact';
end;
$$;

comment on function public.push_keys() is
  '선생님이 알림을 보낼 때 쓸 열쇠 (0104). integrations 는 원장님만 읽을 수 있어서';

revoke all on function public.push_keys() from public, anon;
grant execute on function public.push_keys() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.staff_push_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0105_push_prefs_receipts.sql ───────────
-- ============================================================
-- 0105. 방해금지 시간 · 알림이 닿았는지
--
-- 원장님 (2026-08-07)
--   「학부모 어플에서는 알림 켜기 끄기 방해금지 시간 설정을 할 수 있도록」
--   「알림이 간 경우는 이게 확인이 됐는지 안 됐는지 몇 시에 확인했는지까지
--    기록해 주고, 그걸 알 수 있다는 것에 대해서 학부모와 학생은 모르게」
--
-- ── 1) 방해금지 ─────────────────────────────────────────
--
-- 알림을 아예 끄시면 급한 것까지 안 간다. 대부분은 **밤에 안 울리기를**
-- 바라시는 것이다. 아예 끄는 것 말고 **시간만 비켜가는** 길을 둔다.
--
-- ── 2) 닿았는지 ─────────────────────────────────────────
--
-- 지금은 보내고 나면 끝이다. 그래서 「안 봤다」 와 「안 갔다」 를 구별할
-- 수가 없다. 그 둘은 다음에 할 일이 완전히 다르다 — 앞은 전화를 드려야
-- 하고, 뒤는 알림 설정을 봐드려야 한다.
--
-- 그래서 한 통마다 한 줄을 남긴다. 보낸 때 · 폰에 닿은 때 · 누른 때.
--
-- **화면에는 안 보인다.** 학생·학부모 화면 어디에도 이 표를 읽는 곳이
-- 없고, 읽기 규칙으로도 못 읽게 막는다 (아래 정책). 본인은 자기 줄을
-- **쓸 수만** 있다 — 그것도 표를 직접 만지는 것이 아니라 아래 함수로만.
--
-- 서비스 이용 기록이므로 개인정보 보관 기간(재원 기간 + 1년)을 따른다.
-- ============================================================

-- ── 방해금지 시간 ────────────────────────────────────────
create table if not exists public.push_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  quiet_from time,                            -- 이 시각부터
  quiet_to   time,                            -- 이 시각까지 안 울린다
  updated_at timestamptz not null default now()
);

alter table public.push_prefs enable row level security;

-- 본인 것만 보고 고친다
drop policy if exists prefs_own on public.push_prefs;
create policy prefs_own on public.push_prefs
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 보낼 때 봐야 하므로 선생님은 읽는다
drop policy if exists prefs_staff on public.push_prefs;
create policy prefs_staff on public.push_prefs
  for select to authenticated using (public.is_staff());


-- ── 알림 한 통의 자취 ────────────────────────────────────
create table if not exists public.push_receipts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid references public.students(id) on delete set null,
  title        text,
  kind         text,                          -- notice · homework · report …
  sent_at      timestamptz not null default now(),
  delivered_at timestamptz,                   -- 폰까지 닿은 때
  opened_at    timestamptz                    -- 눌러서 연 때
);

create index if not exists push_receipts_sent_idx on public.push_receipts (sent_at desc);
create index if not exists push_receipts_who_idx  on public.push_receipts (profile_id, sent_at desc);

alter table public.push_receipts enable row level security;

/**
 * **선생님만 읽는다.**
 *
 * 본인이 자기 줄을 읽을 수 있게 하면, 언젠가 화면 어딘가에 「읽음」 이
 * 딸려 나온다. 아예 못 읽게 둔다 — 쓰는 것은 아래 함수로만 한다.
 */
drop policy if exists receipts_staff on public.push_receipts;
create policy receipts_staff on public.push_receipts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

/**
 * 폰이 「받았다 · 눌렀다」 를 알려올 때 쓰는 문.
 *
 * 표에는 손을 못 대게 하고 이 함수만 열어둔다. 그래서 —
 *   · **자기 줄만** 고칠 수 있다 (남의 알림 기록을 못 건드린다)
 *   · **시각 두 칸만** 고칠 수 있다 (제목·대상은 못 바꾼다)
 *   · 돌려주는 것이 없다 (여기로 남의 것을 엿볼 수 없다)
 *
 * 이미 적힌 시각은 **덮어쓰지 않는다** — 처음 본 때가 알고 싶은 것이다.
 */
create or replace function public.mark_push_seen(p_id uuid, p_opened boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_opened then
    update public.push_receipts
       set opened_at = coalesce(opened_at, now()),
           delivered_at = coalesce(delivered_at, now())
     where id = p_id and profile_id = auth.uid();
  else
    update public.push_receipts
       set delivered_at = coalesce(delivered_at, now())
     where id = p_id and profile_id = auth.uid();
  end if;
end;
$$;

comment on function public.mark_push_seen(uuid, boolean) is
  '폰이 알림을 받았거나 눌렀을 때 (0105). 표는 잠겨 있고 이 문으로만 적는다';

revoke all on function public.mark_push_seen(uuid, boolean) from public, anon;
grant execute on function public.mark_push_seen(uuid, boolean) to authenticated;

/**
 * **못 보낸 것도 남긴다** (원장님, 2026-08-07 — 「전송이 아예 안 된 경우
 * 오류 표시 하고 안보내졌다는 게 대시보드에 뜨게 해 줘」).
 *
 * 보내기 전에 줄을 만들어 두므로, 보내다 거절당한 통은 **아무 표시 없이**
 * 「미확인」 으로 남았다. 안 본 것과 아예 못 간 것은 다음에 할 일이 다르다.
 *
 * (표를 만들 때부터 이 칸이 있게 두면 좋지만, 이미 돌리신 분도 있을 수
 *  있어 따로 붙인다 — 두 번 돌려도 탈 없다)
 */
alter table public.push_receipts add column if not exists failed_at timestamptz;
alter table public.push_receipts add column if not exists fail_why text;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.push_prefs_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0106_breaks_unit_test.sql ───────────
-- ============================================================
-- 0106. 쉬는 시간 · 단원평가 결과 내기
--
-- 원장님 (2026-08-07)
--   「등원학습 아래에 쉬는 시간 버튼 - 개별진도라 가끔 쉬는 시간이 제각각임.
--    몇분 쉬었는지 기록하고 특이사항 있을때만 선생님 대시보드에 알림
--    (반복적으로 5분이상이거나, 1회 10분이상일때)」
--   「숙제에서 단원평가를 내가 미리 배정 함 - 다음 시간에 등원 해서
--    학생이 결과만 제출 함」
--
-- ── 1) 쉬는 시간 ────────────────────────────────────────
--
-- 개별 진도라 쉬는 때가 아이마다 다르다. 지금은 아이가 자리를 비워도
-- **아무 데도 안 남는다.** 5분 다녀온 것과 20분 사라진 것이 똑같아 보인다.
--
-- **다 알릴 수는 없다.** 한 반에 열 명이 하루에 두 번씩 쉬면 스무 번이
-- 울린다. 그러면 알림을 꺼버리시게 되고, 정작 봐야 할 것까지 같이 죽는다.
-- 그래서 **눈에 띄는 것만** 올린다 (규칙은 lib/breaks.js 한 곳에).
--
-- ── 2) 단원평가 ─────────────────────────────────────────
--
-- 단원평가는 원장님이 **미리 숙제로 배정**하신다. 아이는 다음 시간에 와서
-- **결과만** 낸다. 그러니 아이가 단원 이름을 적을 일이 없다 — 배정에 이미
-- 붙어 있다. 적게 하면 제각각 적어서 같은 단원이 여러 이름으로 쌓인다.
--
-- 학습 항목에 표시 한 칸만 둔다. 그 항목으로 배정된 숙제는 아이 화면에서
-- 「결과 내기」 가 열린다.
-- ============================================================

create table if not exists public.study_breaks (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  -- 끝낼 때 셈해서 넣는다. 나중에 세면 화면마다 다르게 셀 수 있다
  minutes    int,
  created_at timestamptz not null default now()
);

create index if not exists study_breaks_day_idx on public.study_breaks (date, student_id);

alter table public.study_breaks enable row level security;

-- 아이는 **자기 것만** — 남의 쉬는 시간을 만들거나 고칠 수 없다
drop policy if exists breaks_own on public.study_breaks;
create policy breaks_own on public.study_breaks
  for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

-- 선생님은 다 본다 (현황판·대시보드가 이걸 읽는다)
drop policy if exists breaks_staff on public.study_breaks;
create policy breaks_staff on public.study_breaks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

/**
 * **어머니께는 안 보인다** (원장님, 2026-08-07 — 「학부모페이지에 쉬는시간은
 * 넣지마. 오히려 넣으면 문제의 소지를 만드는거야」).
 *
 * 처음에는 「근거가 있어야 이야기가 된다」 고 열어뒀는데, 그건 이쪽 사정이다.
 * 어머니 화면에 「오늘 3번 · 24분」 이 뜨면 그 숫자가 **혼자 걸어다닌다** —
 * 다른 집 아이와 견주게 되고, 화장실 두 번 간 날이 성실성 문제가 된다.
 * 정작 우리가 보려던 것(수업 중에 자꾸 사라지는 아이)과는 상관없는 일로
 * 번진다.
 *
 * 필요한 이야기는 선생님이 **말로** 하시면 된다. 숫자를 그대로 내보이는
 * 것과 필요할 때 짚어드리는 것은 다르다.
 *
 * (한 번 열었다가 닫는 것이라 drop 을 남겨둔다 — 먼저 돌리신 분의 DB 에
 *  이미 들어가 있을 수 있다)
 */
drop policy if exists breaks_parent on public.study_breaks;


-- ── 단원평가로 쓰는 학습 항목 ────────────────────────────
--
-- 이 표시가 붙은 항목으로 배정하면, 아이 화면에 「결과 내기」 가 열린다.
alter table public.homework_items
  add column if not exists unit_test boolean not null default false;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.breaks_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0107_makeup_confirm.sql ───────────
-- ============================================================
-- 0107. 보강 일정을 어머니가 확정하시게
--
-- 원장님 (2026-08-07) — 「보강 일정이 안내되었을 때 학부모가 확정 버튼까지
-- 누르게 만들어. 어려운 경우 일정 변경 요청을 클릭하게 해. 둘 중 하나라도
-- 누르지 않으면 계속 어플 사용할 때마다 첫 화면에서 경고메세지를 줘」
--
-- ── 왜 필요한가 ─────────────────────────────────────────
--
-- 지금은 보강 날짜를 잡아 알림을 보내면 그것으로 끝이다. 그런데 그날
-- 안 오시면 **누구 잘못인지 알 수가 없다** — 못 보신 것인지, 보시고도
-- 안 된다고 생각만 하신 것인지, 우리가 잘못 적은 것인지.
--
-- 그 하루는 아이 자리를 비워두고 선생님 시간을 뺀 것이라, 그냥 넘어가면
-- 다음에 또 같은 일이 생긴다.
--
-- 그래서 **둘 중 하나를 반드시 누르시게** 한다.
--   확정        그날 갑니다
--   변경 요청   그날은 어렵습니다 (언제가 되는지 적어주신다)
--
-- 안 누르시면 앱을 열 때마다 첫 화면에 걸린다. 성가시게 하는 것이 맞다 —
-- 지나가면 아무도 모르는 일이기 때문이다.
--
-- ── 어디에 남기나 ───────────────────────────────────────
--
-- 보강은 attendance 한 줄이다 (status='makeup'). 따로 표를 만들면 그 줄과
-- 어긋날 수 있으므로 **같은 줄에** 칸을 붙인다.
-- ============================================================

alter table public.attendance
  add column if not exists makeup_confirmed_at timestamptz,   -- 어머니가 확정하신 때
  add column if not exists makeup_change_req   text,          -- 「그날은 어렵습니다」 + 사정
  add column if not exists makeup_req_at       timestamptz;

/**
 * **어머니가 자기 아이 보강 줄의 이 세 칸만 고칠 수 있게.**
 *
 * attendance 전체를 열 수는 없다 — 출결을 학부모가 고치면 회차와 수강료가
 * 흔들린다. 그래서 표는 그대로 잠가두고 이 문 하나만 낸다.
 *
 * 여기서 고칠 수 있는 것은 **확정 여부와 요청 글**뿐이다. 날짜·상태·사유는
 * 못 건드린다.
 */
create or replace function public.confirm_makeup(
  p_student uuid,
  p_date date,
  p_ok boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- **내 아이인가** — 학부모이거나 학생 본인이거나 선생님일 때만
  if not exists (
        select 1 from public.parent_student ps
         where ps.student_id = p_student and ps.parent_profile_id = auth.uid())
     and not exists (
        select 1 from public.students s
         where s.id = p_student and s.profile_id = auth.uid())
     and not public.is_staff()
  then
    return;
  end if;

  if p_ok then
    update public.attendance
       set makeup_confirmed_at = now(),
           makeup_change_req = null,
           makeup_req_at = null
     where student_id = p_student and date = p_date and status = 'makeup';
  else
    update public.attendance
       set makeup_confirmed_at = null,
           makeup_change_req = coalesce(nullif(btrim(p_note), ''), '일정 변경 요청'),
           makeup_req_at = now()
     where student_id = p_student and date = p_date and status = 'makeup';
  end if;
end;
$$;

comment on function public.confirm_makeup(uuid, date, boolean, text) is
  '보강 일정 확정 / 변경 요청 (0107). attendance 는 잠가두고 이 문으로만 적는다';

revoke all on function public.confirm_makeup(uuid, date, boolean, text) from public, anon;
grant execute on function public.confirm_makeup(uuid, date, boolean, text) to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.makeup_confirm_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0108_request_thread.sql ───────────
-- ============================================================
-- 0108. 전달사항 — 답장을 여러 번, 그리고 보낸 쪽에서 무를 수 있게
--
-- 원장님 (2026-08-07)
--   「학부모/학생 전달사항에 대한 답장을 반복적으로 할 수 있게」
--   「학부모, 학생 화면에서 전달 취소가 가능하게 해줘.
--    제출 후에 나한테는 다 보이게 해줘」
--
-- ── 1) 답장이 한 번뿐이었다 ──────────────────────────────
--
-- `reply` 칸 하나에 덮어썼다. 그래서 「금요일 5시에 오세요」 라고 답한 뒤
-- 「아 그날 시험이네요, 월요일로 하죠」 를 적으면 **앞의 말이 사라진다.**
-- 어머니 화면에서도 마지막 한 줄만 보여서, 무슨 이야기가 오갔는지 아무도
-- 모르게 된다.
--
-- 오간 말을 **줄줄이 쌓는다.** 누가 언제 뭐라고 했는지 그대로 남는다.
--
-- ── 2) 잘못 보낸 것을 무를 수가 없었다 ────────────────────
--
-- 날짜를 잘못 골라 보내신 결석 알림이 그대로 남아, 원장님이 그걸 받아
-- 결석 예정을 깔게 된다. 어머니는 다시 문자를 보내시고, 그러면 두 군데에
-- 말이 남는다.
--
-- 보낸 쪽에서 무를 수 있게 한다. **지우지는 않는다** — 취소한 것도
-- 원장님께는 보인다 (「이 얘기가 왜 사라졌지」 가 없어야 한다).
--
-- ── 3) 처리한 것도 원장님께는 보인다 ─────────────────────
--
-- 지금까지 대시보드에는 `status='new'` 만 떴다. 「확인」 을 누르는 순간
-- 사라져서, 무슨 말을 했는지 다시 볼 수가 없었다. 화면 쪽에서 고친다.
-- ============================================================

alter table public.requests
  -- 오간 말 — [{ at, who, role, text }] 를 시간순으로
  add column if not exists thread     jsonb not null default '[]'::jsonb,
  -- 보낸 쪽에서 무른 때 (지우지 않는다)
  add column if not exists canceled_at timestamptz,
  -- 누가 보냈나 — 답장 문구를 학생용·학부모용으로 가르는 데 쓴다
  add column if not exists author_role text;

/**
 * **보낸 사람이 무른다.**
 *
 * requests 표는 학생·학부모에게 **읽기와 넣기만** 열려 있다 (0019).
 * 고치기를 통째로 열면 status 나 reply 도 고칠 수 있게 되어, 어머니가
 * 「확인함」 으로 바꿔놓을 수 있다. 그래서 이 문 하나만 낸다 —
 * **취소한 때 한 칸**만 적는다.
 *
 * 이미 선생님이 처리한 것은 못 무른다. 결석 예정이 이미 깔렸는데 요청만
 * 사라지면, 왜 깔렸는지 아무도 모르는 결석이 남는다.
 */
create or replace function public.cancel_request(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare r public.requests%rowtype;
begin
  select * into r from public.requests where id = p_id;
  if r.id is null then return 'not_found'; end if;

  -- 내 아이 것인가
  if not exists (select 1 from public.students s
                  where s.id = r.student_id and s.profile_id = auth.uid())
     and not exists (select 1 from public.parent_student ps
                      where ps.student_id = r.student_id and ps.parent_profile_id = auth.uid())
     and not public.is_staff()
  then
    return 'not_mine';
  end if;

  if r.handled_at is not null and not public.is_staff() then
    return 'handled';
  end if;

  update public.requests
     set canceled_at = now(), status = 'canceled'
   where id = p_id;
  return 'ok';
end;
$$;

comment on function public.cancel_request(uuid) is
  '보낸 사람이 전달사항을 무른다 (0108). 표는 잠가두고 이 문으로만';

revoke all on function public.cancel_request(uuid) from public, anon;
grant execute on function public.cancel_request(uuid) to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.request_thread_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0109_inquiry_sms.sql ───────────
-- ============================================================
-- 0109. 신규 문의 — 전화 받고 나서 나가는 문자 두 통
--
-- 원장님 (2026-08-07)
--   「하나 빠진게 있었어 신규생문의시
--     1. 전화옴
--     2. 문자로 설문지 제출할 링크 보내줌
--     3. 레시간, 상담시간 및 오는 길 안내 문자 보내줘야함
--    이거 어떻게 하지」
--
-- ── 지금은 어떻게 하고 계셨나 ─────────────────────────────
--
-- 2번은 화면에 **링크 복사**만 있었다. 복사 → 문자앱 열기 → 그 번호 찾기
-- → 붙여넣기 → 앞에 인사말 적기. 전화를 끊고 다섯 걸음이다. 그 사이에
-- 다른 전화가 오면 그 집은 링크를 못 받는다.
--
-- 3번은 **아무 자리도 없었다.** 레벨테스트 시간과 상담 시간을 상담 화면에
-- 적어두고, 문자는 손으로 다시 쓰셨다. 주소도 매번 다시 쓰신다.
--
-- ── 무엇을 넣나 ──────────────────────────────────────────
--
-- 문구 두 개. **문구는 원장님이 고치신다** — 여기서는 자리만 만든다.
--
--   apply_link   설문지 링크 (문의 접수 직후)
--   visit_info   레벨테스트 · 상담 시간 · 오는 길 (일정을 잡은 뒤)
--
-- 「오는 길」 은 설정에 이미 있는 학원 주소·전화를 쓴다. 문구에 두 번
-- 적어두면 이사했을 때 한쪽만 고치게 된다.
--
-- ── 보낸 것을 기억한다 ───────────────────────────────────
--
-- 보냈는지를 기억에 맡기면 안 된다. 「보냈던가」 싶어 한 번 더 보내면
-- 어머니께는 같은 문자가 두 번 가고, 안 보냈는데 보낸 줄 알면 그 집은
-- 아무 연락도 못 받는다.
-- ============================================================

alter table public.inquiries
  -- 설문지 링크를 문자로 보낸 때
  add column if not exists link_sent_at  timestamptz,
  -- 일정·오는 길 안내를 보낸 때
  add column if not exists guide_sent_at timestamptz;

comment on column public.inquiries.link_sent_at  is '설문지 링크 문자를 보낸 때 (0109)';
comment on column public.inquiries.guide_sent_at is '레벨테스트·상담 시간·오는 길 안내를 보낸 때 (0109)';

/**
 * 문구 두 개.
 *
 * **이미 있으면 안 건드린다.** 원장님이 고쳐 쓰고 계실 수 있는데, 이 파일을
 * 다시 돌렸다고 원래 문구로 돌아가면 그건 남의 글을 지우는 일이다.
 */
insert into public.message_templates (name, kind, body, sort) values
  ('신규 문의 — 설문지 링크', 'apply_link',
   '[{{학원명}}] 안녕하세요, 문의 주셔서 감사합니다.

아래 링크에서 몇 가지만 적어주시면 상담 준비에 큰 도움이 됩니다.
{{링크}}

빈칸이 있어도 접수되니 아시는 것만 적어주세요.', 40),

  ('신규 문의 — 일정 · 오시는 길', 'visit_info',
   '[{{학원명}}] {{학생명}} 학생 일정 안내드립니다.

레벨테스트: {{레테일시}}
부모님 방문상담: {{상담일시}}

오시는 길: {{주소}}
문의: {{전화}}

레벨테스트는 40~60분 정도 걸립니다. 시간 변경이 필요하시면 편하게 연락 주세요.', 41)
on conflict (name) where active do nothing;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.inquiry_sms_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0110_push_public_key.sql ───────────
-- ============================================================
-- 0110. 알림 공개키를 학생·학부모도 읽을 수 있게
--
-- 원장님 (2026-08-07) — 「허용 눌렀는데 이래」
--   → 「알림 준비가 아직 안 됐어요. 선생님께 말씀해주세요.」
--
-- ── 무슨 일이었나 ────────────────────────────────────────
--
-- 알림을 켜려면 브라우저에게 **공개키**를 줘야 한다. 그 키는
-- `integrations` 표의 `push` 줄에 들어 있는데, 이 표는 0015 에서
-- **원장님만** 읽을 수 있게 잠가두었다 (솔라피 비밀키가 같이 들어 있어서).
--
-- 그래서 —
--   원장님 폰   키가 읽힌다 → 알림 켜짐 ✅
--   학생·학부모  RLS 가 막는다 → 키가 null → 「준비가 안 됐어요」 ❌
--
-- 오류는 아무 데도 안 났다. 표가 「없다」 고 답할 뿐이라, 화면은 그것을
-- 「원장님이 아직 키를 안 만드셨다」 로 읽었다. 그래서 원장님은 설정에서
-- 「알림 준비됨」 을 보시면서도 아이들은 못 켜는 상태가 이어졌다.
--
-- (같은 날 sw.js 도 고쳤다 — 그건 서비스워커가 아예 등록이 안 되던 것이고,
--  이건 등록된 뒤 구독을 만들 때 막히는 것이다. **두 곳이 막혀 있었다.**)
--
-- ── 왜 열어도 되나 ──────────────────────────────────────
--
-- **공개키는 감출 것이 아니다.** 이름 그대로다 — 브라우저가 구독을 만들 때
-- 쓰는 값이고, 이것만으로는 아무에게도 알림을 보낼 수 없다. 보내려면
-- **비밀키**가 있어야 하고, 그건 여전히 원장님과 선생님만 읽는다 (0104).
--
-- 표를 여는 것이 아니라 **문 하나만** 낸다. 이 문은 `push` 줄의
-- publicKey 한 칸만 내어준다 — 솔라피 키도, 나이스 키도, AI 키도
-- 이 문으로는 안 나온다.
-- ============================================================

create or replace function public.push_public_key()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(i.config->>'publicKey', '')
    from public.integrations i
   where i.id = 'push'
$$;

comment on function public.push_public_key() is
  '알림을 켤 때 브라우저에 줄 공개키 (0110). integrations 는 원장님만 읽을 수 있어서, 이 한 칸만 내주는 문';

-- 로그인한 사람이면 누구나 — 학생도 학부모도 자기 폰에 알림을 켤 수 있어야 한다.
-- 로그인 안 한 사람에게는 안 준다 (줄 이유가 없다).
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.push_public_key_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0111_self_push.sql ───────────
-- ============================================================
-- 0111. 학생·학부모도 **자기 폰에** 테스트 알림을 보낼 수 있게
--
-- 원장님 (2026-08-07)
--   「1. 학생이 부르는 중 눌러도 알림이 안 와」
--   「2. 안드로이드폰에서 알림이 안 켜져」
--
-- ── 왜 몇 주째 같은 자리에서 막히나 ──────────────────────
--
-- 알림이 안 오는 이유는 **일곱 군데**쯤 된다 — SQL 을 안 돌렸거나,
-- 공개키를 못 읽거나, 서비스워커가 없거나, 폰이 차단했거나, 방해금지
-- 시간이거나, 보낼 곳이 없거나, 열쇠가 없거나. 그런데 화면에는 전부
-- 똑같이 **아무 일도 안 일어난 것**으로 보인다.
--
-- 그래서 「안 와요」 를 들으면 저도 원장님도 추측만 하게 된다. 추측을
-- 없애려면 **그 폰에서 직접 눌러보고 어디서 막혔는지 읽을 수 있어야**
-- 한다. 그런데 지금 테스트 단추는 **선생님만** 쓸 수 있다 —
-- 보낼 열쇠(`integrations`)를 원장님만 읽기 때문이다 (0015).
--
-- 즉 정작 안 되는 사람(학생·안드로이드 어머니)이 확인할 길이 없었다.
--
-- ── 무엇을 여나 ──────────────────────────────────────────
--
-- **자기 폰으로만** 보낼 수 있는 문을 낸다. 돌려주는 기기는 부른 사람
-- 본인의 것뿐이다 (`profile_id = auth.uid()`).
--
-- 열쇠가 같이 나가는 것은 0104 에서 이미 그렇게 하고 있다 (학생이
-- 선생님을 부를 때). 여기서 늘어나는 위험은 없고, 대신 「내 폰에
-- 오는지」 를 본인이 1초 만에 확인할 수 있게 된다.
-- ============================================================

create or replace function public.self_push_targets()
returns table (
  endpoint text,
  p256dh text,
  auth text,
  public_key text,
  private_key text,
  contact text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  if auth.uid() is null then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;                                  -- 알림 열쇠를 아직 안 만드셨다
  end if;

  -- **내 기기만.** 남의 profile_id 를 넣을 자리가 아예 없다
  return query
    select ps.endpoint, ps.p256dh, ps.auth,
           cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact'
      from public.push_subscriptions ps
     where ps.profile_id = auth.uid();
end;
$$;

comment on function public.self_push_targets() is
  '자기 폰에 테스트 알림을 보낼 때 쓸 대상 (0111). 열쇠가 원장님만 읽히므로 security definer';

revoke all on function public.self_push_targets() from public, anon;
grant execute on function public.self_push_targets() to authenticated;

-- ------------------------------------------------------------
-- **알림 열쇠가 아예 있기는 한가.**
--
-- 학생·학부모 화면에서 「아직 준비가 안 됐어요」 가 뜰 때, 그것이
--   · 원장님이 열쇠를 안 만드신 것인지
--   · 만들었는데 내가 못 읽는 것인지
-- 를 가를 수가 없었다. 있다/없다 한 글자만 답하는 문을 따로 낸다
-- (열쇠 자체는 안 나간다).
-- ------------------------------------------------------------
create or replace function public.push_keys_ready()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select coalesce(i.config->>'privateKey', '') <> ''
       from public.integrations i where i.id = 'push'),
    false)
$$;

comment on function public.push_keys_ready() is
  '알림 열쇠가 만들어져 있나 — 있다/없다만 (0111)';

revoke all on function public.push_keys_ready() from public, anon;
grant execute on function public.push_keys_ready() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.self_push_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0112_exam_skips.sql ───────────
-- ============================================================
-- 0112. 「이 아이는 이 시험을 안 봤다」
--
-- 원장님 (2026-08-08) — 「시험없음 체크박스도 추가해줘. 없을때가 있어」
--
-- ── 왜 필요한가 ─────────────────────────────────────────
--
-- 「성적 미입력」 은 **그 학교 · 그 학년 아이는 그 시험을 봤을 것**이라는
-- 짐작으로 센다. 대개 맞지만 안 맞는 때가 있다 —
--   · 그날 아파서 못 봤다
--   · 시험 전에 전학 왔다 (그 학교 시험을 안 봤다)
--   · 그 과목을 안 듣는다
--
-- 이런 아이는 성적이 영영 안 들어온다. 그러면 배지가 **영영 안 꺼진다.**
-- 안 꺼지는 배지는 며칠 안에 배경이 되고, 그때부터는 진짜 빠진 성적도
-- 안 보이게 된다. 재촉은 끌 수 있어야 재촉이다.
--
-- ── 성적 줄로 하지 않는 까닭 ─────────────────────────────
--
-- 「0점짜리 성적」 을 넣어 치울 수도 있다. 그러면 안 된다 —
--   · 평균과 추이에 0점이 섞여 아이 성적이 실제보다 나쁘게 보인다
--   · 리포트에도 「0점」 이 적혀 나간다
-- 안 본 것은 **없는 것**이지 0점이 아니다. 그래서 따로 적어둔다.
--
-- 여러 번 돌려도 같다.
-- ============================================================

create table if not exists public.exam_skips (
  student_id uuid not null references public.students(id) on delete cascade,
  exam_id    uuid not null references public.exam_periods(id) on delete cascade,
  note       text,                                   -- 왜 안 봤는지 (병결 · 전학 …)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, exam_id)
);

comment on table public.exam_skips is
  '이 아이는 이 회차를 안 봤다 (0112). 성적 미입력 재촉에서 빠진다 — 0점이 아니라 없는 것이다';

alter table public.exam_skips enable row level security;

-- 선생님만 — 아이의 성적과 같은 성격이라 학생·학부모에게는 안 연다.
-- (아이 화면에는 애초에 「성적 미입력」 이라는 것이 없다)
drop policy if exists exam_skips_staff on public.exam_skips;
create policy exam_skips_staff on public.exam_skips
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant select, insert, update, delete on public.exam_skips to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.exam_skips_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0113_task_started.sql ───────────
-- ============================================================
-- 0113. 「지금 붙잡고 있는 일」 — 할일 칸반의 가운데 칸
--
-- 원장님 (2026-08-09) — academy-video 벤치마킹
--   「할일 / 진행중 / 완료 3컬럼 드래그」
--
-- ── 왜 status 값을 안 늘리는가 ───────────────────────────
--
-- 곧이곧대로 하면 status 에 'doing' 을 하나 더 넣으면 된다. 그러면 안 된다.
--
-- tasks 는 할일만 쓰는 표가 아니다 — 학사일정 · 수업 · 보강이 같이 산다.
-- 그리고 앱 곳곳이 **`status = 'open'` 이면 남은 일**이라고 읽는다:
-- 메뉴 배지, 대시보드 「남은 일」, 달력, 필터 — 아홉 파일 쉰세 군데다.
--
-- 'doing' 을 넣으면 그 줄들은 open 도 done 도 아니게 된다. 그러면
-- **진행중으로 옮긴 할일이 배지에서도 달력에서도 통째로 사라진다.**
-- 오류는 안 난다. 원장님은 「어? 아까 그거 어디 갔지」 하시게 된다.
-- 이 앱에서 제일 자주 물린 함정이 바로 이 「조용히 안 세짐」 이다.
--
-- ── 그래서 칸 하나 ──────────────────────────────────────
--
-- 진행중은 **끝난 것이 아니라 손댄 것**이다. 그러니 status 는 'open' 그대로
-- 두고, 손댄 때만 따로 적는다.
--
--   할일   = status open · started_at 없음
--   진행중 = status open · started_at 있음      ← 여전히 open 이다
--   완료   = status done
--
-- 쉰세 군데는 한 줄도 안 건드린다. 배지도 달력도 진행중을 그대로 센다 —
-- 그게 맞다. 시작했다고 일이 없어지지는 않으니까.
--
-- 언제 손댔는지도 같이 남는다 — 「사흘째 붙잡고 있는 일」 을 나중에 볼 수 있다.
--
-- 여러 번 돌려도 같다.
-- ============================================================

alter table public.tasks
  add column if not exists started_at timestamptz;

comment on column public.tasks.started_at is
  '손대기 시작한 때 (0113). 진행중 = status open + started_at 있음 — status 는 그대로 open 이라 배지·달력이 계속 센다';

-- 진행중만 빨리 찾기 (칸반 가운데 칸)
create index if not exists tasks_started_idx
  on public.tasks (started_at)
  where started_at is not null;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.task_started_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0114_school_names.sql ───────────
-- ============================================================
-- 0114. 학교 이름을 **로그인 안 한 학부모도** 골라 넣을 수 있게
--
-- 원장님 (2026-08-09) — 「db가 있어서 선택하면 되는 것을 텍스트로 적게
-- 되어 있는 거 없는지 전 페이지 전수검사해. 지금 신규 입력 시 학교 학년이
-- 그래」
--
-- ── 왜 손으로 적으면 안 되는가 ───────────────────────────
--
-- 학교 이름은 표(0076 schools)에 있는데 다섯 군데에서 손으로 적고 있었다.
-- 손으로 적으면 같은 학교가 여러 이름으로 갈라진다 —
--
--   신정중 · 신정중학교 · 인천신정중 · 인천신정중학교
--
-- 그러면 그 학교의 시험 일정도, 시험범위도, 성적도 **서로 다른 학교의
-- 것**이 된다. 오류는 안 난다. 아이 하나가 조용히 빠질 뿐이다.
--
-- ── 왜 표를 그냥 열지 않는가 ─────────────────────────────
--
-- schools 는 선생님만 읽는다 (0076). 그런데 **상담 신청 설문지(/apply)는
-- 로그인 없이** 학부모가 여는 화면이다. 거기서도 골라 넣을 수 있어야
-- 「인천신정중학교」 와 「신정중」 이 갈라지는 것을 첫 자리에서 막는다.
--
-- 그래서 표를 열지 않고 **이름만 내주는 좁은 문**을 낸다. 학교 이름은
-- 원래 공개된 것이라 내줘도 잃을 것이 없고, id·별칭·그 밖의 칸은 그대로
-- 잠겨 있다.
--
-- 여러 번 돌려도 같다.
-- ============================================================

create or replace function public.school_names()
returns table (name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name from public.schools s order by s.name
$$;

comment on function public.school_names() is
  '학교 이름만 (0114). 로그인 없는 상담 신청 설문지에서도 골라 넣을 수 있게 — 표 자체는 그대로 잠겨 있다';

grant execute on function public.school_names() to anon, authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.school_names_on()
returns boolean language sql immutable as $$ select true $$;

-- ─────────── 0115_school_homepage.sql ───────────
-- ============================================================
-- 0115. 학교 홈페이지 주소 — 나이스에 없는 일정을 거기서 가져오려고
--
-- 원장님 (2026-08-10) — 「나이스 말고 학교 홈페이지에 등록된 내용으로
-- 기록할 수 없을까? 학교 홈페이지랑 다르다 나이스가」
-- 「학교 홈페이지를 넣어놓고 확인해서 긁어오게 할 수는 없어?」
--
-- ── 왜 두 곳을 다 봐야 하는가 ───────────────────────────
--
-- 학교는 일정을 **두 군데에 따로 적는다** —
--   나이스(교육행정정보시스템)  우리 앱이 받아오는 곳
--   학교 홈페이지(icems 등)     학부모가 보는 곳
--
-- 두 곳을 같은 사람이 같은 날 채우지 않는다. 그래서 시험 날짜가 홈페이지엔
-- 있는데 나이스엔 없는 일이 실제로 생겼다 (박문중, 2026-08-10).
-- 나이스에 없으면 우리 앱에는 회차가 안 생기고, 그 학교 아이들은 대비
-- 자료도 · 결석 예상도 · 성적 자리도 없이 시험을 본다.
--
-- 그래서 학교마다 **홈페이지 학사일정 주소**를 적어둘 자리를 만든다.
-- 주소가 있으면 앱이 그 페이지를 받아 읽어 「나이스엔 없는데 홈페이지엔
-- 있는 시험」 을 짚어준다.
--
-- **자동으로 넣지는 않는다.** 남의 홈페이지 모양은 언제든 바뀌고, 잘못
-- 읽은 것을 조용히 회차로 만들면 그게 더 나쁘다. 읽은 것을 보여드리고
-- 원장님이 고르신 것만 넣는다.
-- ============================================================

alter table public.schools
  add column if not exists homepage text;

comment on column public.schools.homepage is
  '학교 홈페이지 학사일정 주소. 나이스에 없는 일정을 여기서 찾아본다 (0115)';

-- 옛 이름(0076 전)으로 남아 있는 곳도 같이
do $$
begin
  if to_regclass('public.neis_schools') is not null then
    execute 'alter table public.neis_schools add column if not exists homepage text';
  end if;
end $$;

-- 이 SQL 이 돌았는지 화면이 알아보게 (다른 마커들과 같은 모양)
create or replace function public.school_homepage_on()
returns boolean language sql stable as $$ select true $$;

grant execute on function public.school_homepage_on() to authenticated;

-- ─────────── 0116_homework_tool.sql ───────────
-- 0116: 학습 항목의 준비물 — 아이가 「무엇으로」 하는지
--
-- 원장님 (2026-08-11) — 「툴이 교재인지 클래스카드인지, 노트인지 표시해줄 수
-- 있지. 물론 아이에게 말이야」
--
-- 영역(단어·독해·문법)은 분류 칸이 말해주고, 어느 책 몇 쪽인지는 단원이
-- 말해준다. 그런데 **무엇을 펴야 하는지** — 교재인지, 클래스카드 앱인지,
-- 노트인지 — 는 어디에도 없어서 아이가 매번 물어봤다.
--
-- 항목에 한 번만 적어두면 그 숙제가 나갈 때마다 아이 화면에 따라붙는다
-- (같은 값을 두 번 입력하지 않는다 — 원칙 1).

alter table public.homework_items
  add column if not exists tool text;

comment on column public.homework_items.tool is
  '준비물 — 아이가 무엇으로 하는 숙제인가. 교재 · 클래스카드 · 노트 · 프린트 …';

-- 들어갔는지 화면이 물어보는 표식 (설정 → Supabase 의 「지금 DB 상태」)
create or replace function public.homework_tool_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.homework_tool_on() to authenticated;

-- ─────────── 0117_task_checklist.sql ───────────
-- 0117: 할일 하위목록 (체크리스트형)
--
-- 원장님 (2026-08-11) — 「할일의 하위목록을 만들 수 있어? 되풀이 할일 포함」
-- → 「체크리스트형 (추천)」 을 고르심: 목록을 적고 하나씩 체크만, 마감일·
-- 담당자는 따로 없음, 되풀이 할일에도 그대로 적용.
--
-- 숙제 항목의 체크리스트(homework_items.checklist)와 같은 모양이다 —
-- 한 줄에 하나씩 적고, 체크는 그 줄의 글자로 표시한다.
--
-- tasks.parent_id 라는 칸이 이미 있지만(0020) 화면이 한 번도 쓴 적이
-- 없다 — 「진짜 하위 할일」(담당자·마감일 따로) 로 가는 자리였는데,
-- 이번엔 그 방식을 안 쓴다. 다음에 진짜 하위 할일이 필요해지면 그때 쓴다.

alter table public.tasks
  add column if not exists checklist text,
  add column if not exists checklist_done text[] not null default '{}';

comment on column public.tasks.checklist is
  '하위목록 — 한 줄에 하나. 담당자·마감일은 따로 없다 (숙제 체크리스트와 같은 모양)';
comment on column public.tasks.checklist_done is
  '체크된 줄의 글자 그대로. checklist 의 줄과 내용으로 맞춘다 (순서 말고)';

-- 되풀이 할일 규칙에도 같은 칸 — 여기 적어두면 매번 생기는 할일마다
-- 같은 목록이 복사되어 들어간다 (그 뒤로는 각자 따로 체크된다)
alter table public.todo_routines
  add column if not exists checklist text;

create or replace function public.task_checklist_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.task_checklist_on() to authenticated;

-- ─────────── 0118_understanding.sql ───────────
-- 0118: 이해도 — 집중도(옛 「태도」) 옆에 나란히
--
-- 원장님 (2026-08-11) — 「태도를 집중도로 고치고 이해도 추가해줘.
-- 둘 다 선택하지 않으면 출력되지 않게 해줘」
--
-- 「태도」 는 말이 넓다 — 떠들었는지, 못 알아들었는지, 졸았는지가 다
-- 한 칸에 뭉개진다. 어머니가 궁금한 것은 두 가지다: **집중해서 들었는가**
-- (집중도), **알아들었는가** (이해도).
--
-- 집중도는 새 칸을 만들지 않는다 — 기존 attitude 칸을 그대로 쓰고 화면의
-- 이름만 바꾼다 (지금까지 적어온 별점이 그대로 집중도가 된다). 이해도만
-- 새 칸이다. 별점 갈래(Excellent~Area of Concern)도 같은 것을 쓴다.

alter table public.daily_reports
  add column if not exists understanding text;

comment on column public.daily_reports.attitude is
  '집중도 (화면 이름은 2026-08-11 에 태도→집중도로 바뀜). Excellent~Area of Concern';
comment on column public.daily_reports.understanding is
  '이해도. Excellent~Area of Concern — attitude 와 같은 갈래';

create or replace function public.understanding_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.understanding_on() to authenticated;

-- ─────────── 0119_unit_note.sql ───────────
-- 단원 메모 (0119)
--
-- student_unit_progress.note 는 0010 부터 있었는데 화면에서 적을 길이 없었다.
-- 적으려고 보니 status 가 not null default 'done' 이라 두 가지가 조용히 틀린다:
--   1) 메모만 적어도 새 줄의 status 가 'done' 이 되어 **그 단원이 완료로 보인다**
--   2) 완료를 취소하면 줄을 지우는데, 그러면 **메모도 같이 사라진다**
--
-- status 를 비울 수 있게 한다 — 줄은 있는데 status 가 null 이면
-- 「아직 안 했지만 메모는 있다」 는 뜻이다.
alter table public.student_unit_progress alter column status drop not null;
alter table public.student_unit_progress alter column status drop default;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다).
-- 제약만 바꾸는 마이그레이션이라 표·칸으로는 확인할 수가 없다.
create or replace function public.unit_note_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.unit_note_on() to authenticated;

-- ─────────── 0120_routine_step_id.sql ───────────
-- 루틴 단계를 **번호가 아니라 단계 자체(id)로** 기억한다 (0120)
--
-- 원장님 (2026-08-14): 「중간에 특정 학생에 대한 학습 루틴을 바꾸게 되면
-- 그 경우 복잡해지는 거 없을까?」 — 있었다.
--
-- 지금까지 학생은 「몇 번째 단계인지」(routine_step 번호)만 기억했다.
-- 그래서 루틴 **중간에 단계를 끼우거나 지우거나 순서를 바꾸면**, 그 교재를
-- 쓰는 모든 학생의 번호가 다른 단계를 가리키게 됐다 — 오류는 안 나고
-- 아이가 조용히 엉뚱한 단계를 하게 되는 종류의 사고다.
--
-- 이제 단계의 id 를 기억한다. 끼우거나 순서를 바꿔도 id 는 그대로라
-- 아이는 하던 단계에 그대로 서 있다. 단계를 지울 때만 앱이 그 단계에
-- 서 있던 학생을 다음 단계로 옮겨준다 (routineActions.deleteStep).
--
-- **과거 기록은 이 일과 무관하게 보존된다** — 그날 무엇을 배정하고
-- 검사했는지는 리포트(daily_reports · daily_report_items)에 이미 박제되어
-- 있어서, 루틴을 어떻게 고쳐도 지난 기록은 한 글자도 안 변한다.
--
-- 옛 칸(routine_step 번호)은 지우지 않는다 — 아직 id 가 없는 줄의
-- 폴백으로만 읽고, 다음 「루틴 다음」 때 id 가 채워진다.
alter table public.student_textbooks
  add column if not exists routine_step_id uuid;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다)
create or replace function public.routine_step_id_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_step_id_on() to authenticated;

-- ─────────── 0121_notice_edit.sql ───────────
-- 공지 수정 (0121)
--
-- 원장님 (2026-08-14): 「확인했어도 수정 후 재공지 필요할 수가 있어서」.
--
-- 지금까지 공지는 지우고 다시 쓰는 수밖에 없었다. 이제 제자리에서 고치고,
-- 고친 시각(edited_at)을 새긴다 — 학생·학부모 길목(NoticeGate)은 공지를
-- 「id + 고친 시각」 으로 기억하므로, 고치는 순간 **확인했던 사람에게도
-- 새 공지처럼 다시 뜬다.** 그게 재공지다.
alter table public.notices add column if not exists edited_at timestamptz;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다)
create or replace function public.notice_edit_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.notice_edit_on() to authenticated;

-- ─────────── 0122_inquiry_books.sql ───────────
-- 신규 상담에 교재 배정 (0122)
--
-- 원장님 (2026-08-15): 「신규 상담 정보에 교재 배정이 없음. 아직 등록 안 해도.」
--
-- 레벨테스트 뒤 등록 전에 교재 안내(구매)를 먼저 보내는 흐름이 실제로 있다.
-- 지금은 안내 문자만 나가고 상담 정보에는 아무것도 안 남았다. 이제 상담에
-- 교재를 골라두면 ① 상담 화면에 보이고 ② 교재 안내를 보낼 때 자동으로
-- 적히고 ③ 등록(재원생 전환)하는 순간 그 교재가 배정으로 이어진다 —
-- 같은 값을 두 번 입력하지 않는다 (원칙 1).
alter table public.inquiries add column if not exists book_ids uuid[];

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면 · 관리자 배지가 부른다)
create or replace function public.inquiry_books_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inquiry_books_on() to authenticated;

-- ─────────── 0123_month_confirm.sql ───────────
-- 다음 달 일정 확정 (0123) — 회차 확정 워크플로
--
-- 원장님 (2026-08-14~15):
--   「매달 25일까지 학부모 어플 통해서 다음달 결석일정 확인하고, 공휴일·
--    시험기간 등 전체 확인 후 학생별 회차 일정을 확정해야 함. 안 하면 알림.」
--   「학부모가 일정 제출 후 1차 확인 버튼 눌러서 일정을 확정하는 과정」
--
-- 결석 제출은 이미 requests 로 들어온다. 여기는 **확인 도장 두 개**만 적는다:
--   parent_at    학부모가 「다음 달 일정 1차 확인」 을 누른 시각
--                (결석이 없어도 누른다 — 「없음」 도 확인이다)
--   principal_at 원장님이 겹침(공휴일·시험)까지 보고 회차를 확정한 시각
-- 수납 안내는 앱 밖 일이라 여기서는 상태만 보인다.
create table if not exists public.month_confirms (
  student_id   uuid not null references public.students(id) on delete cascade,
  ym           text not null,                       -- '2026-09'
  parent_at    timestamptz,
  parent_by    uuid references public.profiles(id) on delete set null,
  principal_at timestamptz,
  primary key (student_id, ym)
);

alter table public.month_confirms enable row level security;

-- 선생님은 전부
drop policy if exists staff_all on public.month_confirms;
create policy staff_all on public.month_confirms
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학부모·학생은 자기 아이 것만 보고, 학부모 확인 도장만 찍는다
drop policy if exists own_month_confirms on public.month_confirms;
create policy own_month_confirms on public.month_confirms
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_month_confirms_write on public.month_confirms;
create policy own_month_confirms_write on public.month_confirms
  for insert to authenticated
  with check (
    exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_month_confirms_update on public.month_confirms;
create policy own_month_confirms_update on public.month_confirms
  for update to authenticated
  using (
    exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면 · 관리자 배지가 부른다)
create or replace function public.month_confirm_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.month_confirm_on() to authenticated;

-- ─────────── 0124_word_units_per.sql ───────────
-- 단어 교재 — 한 번에 몇 단원씩 (0124)
--
-- 원장님 (2026-08-15): 「몇 단원씩 외우는지랑 몇 회독째인지도 체크하게
-- 해줘. 이미 체크했으면 자동 체크되고.」
--
-- 몇 회독째는 이미 있다 (student_textbooks.round). 「몇 단원씩」 을 적을
-- 자리가 없어서 매번 손으로 골랐고, 「지난번과 같게」 도 한 단원만 이어
-- 갔다. 시험 방식과 같은 결(학생·교재·회독)이라 word_test_settings 에 둔다.
alter table public.word_test_settings add column if not exists units_per int;

-- 돌았는지 확인하는 손잡이
create or replace function public.word_units_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.word_units_on() to authenticated;

-- ─────────── 0125_book_notified.sql ───────────
-- 교재 안내가 **나갔는지**를 배정 줄에 새긴다 (원장님, 2026-08-15 —
-- 「교재안내는 놓치면 안되는 중요한 부분」 · 「발송목록에 추가해서 확인후
-- 보내야지」).
--
-- 사용 예정 배정은 두 길로 생긴다: ① 발송 화면의 교재 안내(보내면서 배정)
-- ② 상담 등록·재원생 직접 추가(안내 없이 배정). ②로 생긴 것은 문자가
-- 안 나갔는데 아무도 모른다. 안내가 나간 날을 배정 줄에 적어두면
-- 「사용 예정인데 notified_on 이 빈 것」 = 안내 안 나간 것 — 발송 화면이
-- 이걸 확인 목록으로 보여준다.

alter table public.student_textbooks
  add column if not exists notified_on date;

create or replace function public.book_notified_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.book_notified_on() to authenticated;

-- ─────────── 0126_scheduled_sends.sql ───────────
-- 예약 발송 (원장님, 2026-08-16 — 「체크박스로 선택해서 보내는 기능,
-- 예약기능 만들어줘」).
--
-- 발송 「보낼 것」 화면에서 고른 것을 지금 보내거나, 시각을 정해 예약한다.
-- 서버에 시계가 따로 없으므로, 예약된 것은 **시각이 지난 뒤 원장님(직원)이
-- 앱을 열 때** 나간다 — 대시보드·발송 화면이 열릴 때마다 밀린 예약을
-- 확인해서 보낸다. 몇 분 늦을 수는 있어도 잊히지는 않는다.

create table if not exists public.scheduled_sends (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                -- report | book
  due_at     timestamptz not null,         -- 이 시각 이후에 나간다
  payload    jsonb not null,               -- 보낼 것 (kind 마다 모양이 다르다)
  note       text,                         -- 화면에 보여줄 한 줄 (누구 · 무엇)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,                  -- 나간 시각 (실패해도 적는다 — 되풀이 방지)
  result     jsonb                         -- 결과 (실패 사유 포함)
);
create index if not exists scheduled_sends_due_idx on public.scheduled_sends (sent_at, due_at);

alter table public.scheduled_sends enable row level security;
drop policy if exists staff_all on public.scheduled_sends;
create policy staff_all on public.scheduled_sends
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.scheduled_sends_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.scheduled_sends_on() to authenticated;

-- ─────────── 0127_merge_start_on.sql ───────────
-- 시작일 두 칸을 하나로 (전수검사 A18, 원장님 2026-08-16 「합쳐줘」).
--
-- enrolled_on(0003, 등원시작일 — 화면·등록·엑셀이 쓰던 칸)과
-- started_on(0018, 수강료 일할이 보던 칸)이 같은 뜻으로 둘 있었다.
-- 등록 경로마다 어느 칸을 채우는지가 달라서, 일할이 틀리거나 화면에
-- 시작일이 비어 보이는 일이 생긴다. **enrolled_on 하나로 합친다** —
-- 코드는 이제 enrolled_on 만 읽고 쓴다. started_on 은 값을 옮긴 뒤
-- 버려둔다 (지우지는 않는다 — 옛 코드가 도는 동안 깨지지 않게).

update public.students
   set enrolled_on = coalesce(enrolled_on, started_on)
 where enrolled_on is null and started_on is not null;

create or replace function public.start_on_merged()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.start_on_merged() to authenticated;

-- ─────────── 0128_inquiry_book_start.sql ───────────
-- 상담자에게 안내한 교재의 **사용 예정일 보존** (전수검사 A13, 원장님
-- 2026-08-16 「남겨줘」).
--
-- 발송 화면에서 상담자(아직 학생 아님)에게 교재 안내를 보내면 교재
-- 목록(book_ids, 0122)은 남는데 「언제부터 쓴다」 는 버려졌다. 등록
-- 전환이 시작일을 등록한 오늘로 잡아버려서, 안내 문자에 적은 날짜와
-- 어긋날 수 있었다. 안내 때의 예정일을 상담에 같이 적어두고, 등록
-- 전환이 그 날짜(아직 안 왔으면)로 배정한다.

alter table public.inquiries add column if not exists book_start_on date;

create or replace function public.inquiry_book_start_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inquiry_book_start_on() to authenticated;

-- ─────────── 0129_notice_read.sql ───────────
-- 확인한 공지는 **더 안 보이게** (원장님, 2026-08-16 — 「공지는 항상
-- 확인 누르면 안 보이게. 누르면 더 보이지 않게 해줘」).
--
-- 지금까지 「확인했어요」 는 기기(localStorage)에만 남아서, 길목에는 다시
-- 안 떠도 화면의 알림 덩어리에는 2~3주 내내 그대로 있었다. 확인을 DB 에
-- 남기고, 화면이 그 공지를 아예 안 보여준다. 원장님이 공지를 **고치면**
-- (edited_at 변경 = 재공지) 도장이 안 맞아 다시 보인다.

alter table public.notice_receipts add column if not exists read_at    timestamptz;
alter table public.notice_receipts add column if not exists read_stamp text;

-- 학생·학부모가 **자기 줄에만** 확인 도장을 찍을 수 있게
drop policy if exists receipt_mark_read on public.notice_receipts;
create policy receipt_mark_read on public.notice_receipts
  for update to authenticated
  using (notice_receipts.student_id in (select public.my_student_ids()))
  with check (notice_receipts.student_id in (select public.my_student_ids()));

create or replace function public.notice_read_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.notice_read_on() to authenticated;

-- ─────────── 0131_classcard.sql ───────────
-- 클래스카드 연동 저장소 (docs/클래스카드-연동-설계.md, 원장님 2026-08-16).
--
-- 크롬 확장이 원장님 세션으로 클카 플래너를 읽어 앱으로 보낸다. 앱은
-- 「오늘 마감 세트의 완료 여부」 와 「마감일 달력」 만 저장한다 — 세트
-- 내용 미러링은 안 한다 (플래너가 원본, 원칙 1).

-- 클카 학생 명단 (확장이 보내주는 것). login_id 로 앱 학생과 잇는다.
create table if not exists public.classcard_students (
  user_idx   text primary key,          -- 클카 내부 학생 번호
  login_id   text,                      -- 클카 아이디 (대부분 앱 아이디와 같다)
  user_name  text,
  seen_at    timestamptz not null default now()
);

-- 학생×날짜 — 그날 마감 세트들과 완료 여부 (배열 그대로, 판정은 lib 한 곳)
create table if not exists public.classcard_day (
  user_idx   text not null,
  date       date not null,
  sets       jsonb not null default '[]',   -- [{name, complete, status, cards}]
  fetched_at timestamptz not null default now(),
  primary key (user_idx, date)
);

-- 학생×달 — 마감일 달력 (감시②: 플래너 소진)
create table if not exists public.classcard_planner (
  user_idx   text not null,
  month      text not null,              -- 'YYYY-MM'
  days       jsonb not null default '[]',   -- ['YYYY-MM-DD', ...]
  fetched_at timestamptz not null default now(),
  primary key (user_idx, month)
);

-- 학교에서 이미 만든 계정이라 **아이디가 다른 학생** (원장님 2026-08-16)
-- — 재원생 정보에 클카 아이디를 적으면 그걸로 잇는다. 비면 앱 아이디로.
alter table public.students add column if not exists classcard_login text;

do $$ declare t text;
begin
  foreach t in array array['classcard_students','classcard_day','classcard_planner'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated
      using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

create or replace function public.classcard_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.classcard_on() to authenticated;

-- ─────────── 0132_classcard_shadow.sql ───────────
-- 클카 자동 판정 **그림자 기록** (원장님, 2026-08-17 — 「오류 가능성이
-- 높아. 다시 검토하고 시뮬레이션 한 달간 돌려봐」).
--
-- 자동 판정은 화면에 보여주기만 하고 검사를 채우지 않는다. 대신 원장님이
-- 실제로 찍은 것과 나란히 적어둔다 — 한 달 뒤 일치율을 보고 자동 채움을
-- 켤지 결정한다. 판정을 믿을 수 없으면 없는 것보다 나쁘다.

create table if not exists public.classcard_shadow (
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null,
  item_id    uuid not null references public.homework_items(id) on delete cascade,
  auto_status   text,          -- 자동 판정 (done/weak/missing)
  actual_status text,          -- 원장님이 실제로 찍은 것
  note       text,             -- 자동이 본 「미달」 상세 (그때의 근거)
  created_at timestamptz not null default now(),
  primary key (student_id, date, item_id)
);

alter table public.classcard_shadow enable row level security;
drop policy if exists staff_all on public.classcard_shadow;
create policy staff_all on public.classcard_shadow
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.classcard_shadow_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.classcard_shadow_on() to authenticated;

-- ─────────── 0133_skip_activities.sql ───────────
-- 학생별 「빼는 활동」 (원장님, 2026-08-19 — 「대부분은 본 교재와 워크북을
-- 둘 다 시도하다가, 도저히 안 되겠다 싶으면 워크북은 빼고 하게 된단
-- 말이야. 그때까지 진도 기록은 유지된 상태에서 앞으로의 숙제 배정에는
-- 워크북이 빠지게 할 수 있어?」).
--
-- 학생×교재 배정 줄에 활동 이름을 쉼표로 적는다 (예: '워크북').
-- 여기 적힌 활동의 단원은 그 학생의 **앞으로**에서만 빠진다 —
-- 숙제 배정(지난번과 같게)·진도율 분모·전체완료/여기까지.
-- 이미 찍힌 진도 기록은 그대로 남고, 판에서 흐리게 보인다.

alter table public.student_textbooks
  add column if not exists skip_acts text;

create or replace function public.skip_acts_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.skip_acts_on() to authenticated;

-- ─────────── 0134_progress_marked_on.sql ───────────
-- 진도에 「마지막으로 만진 날」 (원장님, 2026-08-19 — 「오늘 수업 진도에서
-- 오늘 수업 한 부분과 오늘 숙제로 나갈 부분을 따로 표시해서 그걸 각각
-- 숙제와 데일리 리포트에 반영하고 싶어」).
--
-- 완료(○)는 done_on 이 남지만 하는 중(◐)은 날짜가 없어서, 「오늘 수업에서
-- 하다 만 것」 과 「지난주부터 하는 중」 을 구별할 수 없었다. 찍을 때마다
-- 날짜를 남긴다 — 「오늘 수업한 부분」 = marked_on 이 오늘인 ○·◐.
-- 지난 기록은 소급되지 않는다 (오늘부터 쌓인다).

alter table public.student_unit_progress
  add column if not exists marked_on date;

create or replace function public.progress_marked_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.progress_marked_on() to authenticated;

-- ─────────── 0135_routine_round.sql ───────────
-- 루틴에 **회독 분기** (원장님, 2026-08-19 — 저절로리딩 브릿지1:
-- 「1회독때 Step3 기호표시·Step4 한글뜻쓰기 / 2회독때 Step5 영작 /
-- 3회독때 테스트북 영작」 — 한 유닛 = 한 수업이고, 수업마다 단계가
-- 바뀌는 게 아니라 **회독에 따라** 하는 일이 바뀐다. 「맞아!」).
--
-- round 가 비면(null) 모든 회독에 적용. n 이면 **n회독부터** 적용하되,
-- 더 높은(가까운) 회독 정의가 있으면 그것이 이긴다 — 「2회독부터」 줄과
-- 「3회독부터」 줄이 같이 있으면 3회독 학생에겐 3회독 줄만 보인다.
-- 고르는 규칙은 lib 아닌 nextRoutine 한 곳에 산다.

alter table public.routine_steps
  add column if not exists round int;

create or replace function public.routine_round_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_round_on() to authenticated;

-- ─────────── 0136_routine_home_next.sql ───────────
-- 루틴 숙제의 **선행/후행** (원장님, 2026-08-19 — 「주의할 게, 숙제가
-- 선행인지 후행인지인데 어떻게 표시해?」).
--
-- 후행(복습) 숙제는 오늘 한 단원(첫 미완료 단원)이 맞고 — 지금 home_items
-- 가 그렇게 돈다. 선행(예습) 숙제는 **다음 단원**이 잡혀야 한다
-- (브릿지1: 「집에서 예습숙제 — 새로운 유닛 …」). 예습 숙제를 딴 칸에
-- 담아, 루틴이 채울 때 다음 단원을 붙인다.

alter table public.routine_steps
  add column if not exists home_next uuid[] not null default '{}';

create or replace function public.routine_home_next_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_home_next_on() to authenticated;

-- ─────────── 0137_routine_area.sql ───────────
-- 영역별 루틴 (원장님, 2026-08-19 — 「교재에 학습항목 연결하는 건 교재별
-- 루틴으로 하고, 교재 상관없는 건 영역별 루틴으로. 교재별 설정하면 그걸
-- 우선으로」).
--
-- 루틴 줄이 교재(textbook_id)에 붙거나 **영역(area — 문법/독해/단어…)**에
-- 붙는다. 고르는 규칙은 nextRoutine 한 곳: 그 교재의 루틴이 한 줄이라도
-- 있으면 그것만, 없으면 그 교재 영역의 루틴을 따른다.

alter table public.routine_steps alter column textbook_id drop not null;
alter table public.routine_steps add column if not exists area text;
create index if not exists routine_steps_area_idx on public.routine_steps (area, sort);

create or replace function public.routine_area_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_area_on() to authenticated;

-- ─────────── 0138_act_items.sql ───────────
-- 활동 → 학습항목 연결 (원장님, 2026-08-19 — 「교재에서는 개념설명 문제풀이
-- 복습이 8단원 있다를 간단히 표시하고, 개념설명에 학습 배정, 문제풀이에
-- 학습 배정 이렇게는 안 될까?」).
--
-- 단원마다 활동(개념설명·문제풀이·복습·워크북 …)이 붙어 있다. 교재에
-- {활동: 학습항목 id} 지도를 담아두면 — 진도 판에서 단원을 숙제로 담을 때
-- 그 단원의 활동에 연결된 항목으로 들어간다. 진도 판 표시는 안 바뀐다
-- (진도는 다 보여야 표시를 하니까).

alter table public.textbooks
  add column if not exists act_items jsonb not null default '{}'::jsonb;

create or replace function public.act_items_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.act_items_on() to authenticated;

-- ─────────── 0139_routine_item_notes.sql ───────────
-- 루틴 항목별 주의사항 (원장님, 2026-08-19 — 「숙제 항목이 다른 건 아닌데
-- 주의사항이 혼재되어 쓸 수밖에 없는데, 학습항목의 설명에 넣어야 하나?」).
--
-- 학습항목 설명은 어디서나 같은 「하는 법」 자리다. 교재·루틴마다 다른
-- 주의(스크램블 6000점↑, 3번 녹음 인증 …)를 거기 넣으면 혼재가 된다.
-- 루틴 단계에 {항목 id: 주의} 를 담고, 루틴이 숙제를 채울 때 그 항목의
-- 배정 메모로 붙인다 — 학생 화면에 그대로 뜬다.
-- 엑셀 표기: 항목 이름 뒤 대괄호 — 클카 스크램블[6000점 이상]

alter table public.routine_steps
  add column if not exists item_notes jsonb not null default '{}'::jsonb;

create or replace function public.routine_item_notes_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_item_notes_on() to authenticated;

-- ─────────── 0140_inclass_order.sql ───────────
-- 오늘 학원 학습의 **순서와 이월** (원장님, 2026-08-20 — 「그날 공부할
-- 순서를 설정하는 게 필요해. 수업 시간이 끝나서 다 못 하는 경우 다음
-- 수업시간에 하기 또는 남은 건 숙제로, 이런 선택지가 필요해」).
--
-- inclass_sort: 오늘 학원에서 할 것의 차례 — 학생 화면이 이 순서대로
--   하나씩 보여준다. 원장님이 ↑↓ 로 조정한다.
-- carry_next: 오늘 못 끝내서 「다음 수업에 계속」 을 누른 것 —
--   다음 수업의 오늘 학원 목록에 자동으로 다시 선다.

alter table public.daily_report_items
  add column if not exists inclass_sort int;
alter table public.daily_report_items
  add column if not exists carry_next boolean not null default false;

create or replace function public.inclass_order_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inclass_order_on() to authenticated;

-- ─────────── 0141_redo_default.sql ───────────
-- 안 해온 숙제의 기본 처분 (원장님, 2026-08-20 — 「b 좋아」).
-- 항목마다 미제출·미흡일 때 어디로 보내는 게 보통인지 적어둔다:
--   inclass = 오늘수업으로 · homework = 숙제 다시 · 비면 = 매번 고름.
-- 자동 실행이 아니라 그 버튼을 눈에 띄게 할 뿐이다 (오터치 방지).

alter table public.homework_items
  add column if not exists redo_default text;

create or replace function public.redo_default_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.redo_default_on() to authenticated;

-- ─────────── 0142_request_done.sql ───────────
-- 전달사항의 「처리 완료」 (원장님, 2026-08-20 — 「확인했다고 알림도
-- 보냈으면 그다음에는 내가 업무에 반영을 해야 되잖아. 반영이 다 끝나면
-- 더 이상 상시 떠 있을 필요가 없으니까 처리 완료가 되어야 해」).
--
-- 확인/조정(handled_at·알림)과 반영 끝(done_at)은 다른 단계다.
-- done_at 이 찍혀야 대시보드 목록에서 접힌다.

alter table public.requests
  add column if not exists done_at timestamptz;

create or replace function public.request_done_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.request_done_on() to authenticated;

-- ─────────── 0143_task_date_tbd.sql ───────────
-- 날짜 미정 일정 (원장님 2026-08-21 — 「일정이 정확히 나오지 않았지만
-- 공지가 나온 일정」 · 「아무거나 날짜 미정을 붙이게 해줘」).
-- 켜져 있으면 due_on 은 대략 시기일 뿐이다 — 달력에 안 박히고
-- 「날짜 안 나온 일정」 목록에 선다. 날짜가 확정되면 due_on 을 채우고
-- 이 표시를 끈다 — 같은 줄이라 두 번 입력이 없다.
alter table tasks add column if not exists date_tbd boolean not null default false;

-- ─────────── 0144_inquiry_books_notified.sql ───────────
-- 상담 때 교재 안내가 나간 날 (2026-08-21 감사) — 등록 전환 때
-- student_textbooks.notified_on 으로 이어져서, 상담 때 이미 안내한 교재를
-- 「안내 안 나간 교재」 로 또 재촉하지 않는다.
alter table inquiries add column if not exists books_notified_on date;

-- ─────────── 0145_word_pass_90.sql ───────────
-- 단어시험 통과선 90 확정 (원장님 2026-08-21 「90%」).
-- 코드 기본값이 80/90 으로 갈라져 있던 것을 90 으로 통일하면서,
-- 이미 저장된 설정이 옛 기본값 80 그대로면 90 으로 올린다
-- (원장님이 일부러 80 이 아닌 다른 값을 적으셨다면 안 건드린다).
update integrations
set config = jsonb_set(config, '{wordPassPct}', '90')
where id = 'warning'
  and (config->>'wordPassPct')::numeric = 80;

-- 실행 확인용 표식 (설정 → SQL 배지가 이 함수 유무로 실행 여부를 안다)
create or replace function word_pass_90() returns boolean
language sql stable as $$ select true $$;

-- ─────────── 0146_report_keywords.sql ───────────
-- **월간용 키워드 메모** (원장님, 2026-08-21 — 「키워드메모칸 필요해」).
--
-- 「키워드는 하루하루 학부모에게 안 나가고 월간에서만 종합」 이 원래
-- 의도였는데(11-4), 리포트 댓글은 다는 즉시 학부모에게 나가서 그 자리로
-- 쓸 수 없었다. 학부모·학생이 읽는 daily_reports 에 칸을 더하면 새 나가므로
-- **원장만 읽는 별도 표**로 둔다. 월간 AI 브리핑만 이걸 종합한다.

create table if not exists public.report_keywords (
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null,
  body       text,
  created_at timestamptz not null default now(),
  primary key (student_id, date)
);

alter table public.report_keywords enable row level security;
drop policy if exists staff_all on public.report_keywords;
create policy staff_all on public.report_keywords
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.report_keywords_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.report_keywords_on() to authenticated;

-- ─────────── 0147_task_photos.sql ───────────
-- 0147: 빠른 메모에 사진·파일을 붙인다
--
-- 원장님 (2026-08-22) — 「어제 만든 퀵메모에 클립보드에 저장된 사진 올리기,
-- 파일, 사진 추가 가능하게 해주라」.
--
-- 수업 중 떠오른 것은 글자만이 아니다 — 칠판 사진, 받아둔 파일, 화면 캡처.
-- 빠른 메모는 오늘 할일(tasks, kind='todo')로 들어가므로, 첨부도 그 줄에 둔다.
-- 공지(0064)·알림(0068)과 같은 규칙 — 비공개 버킷, 볼 때마다 짧은 링크.
-- 다만 여기는 **선생님만** 쓰는 자리라 버킷도 staff 전용이다.

alter table public.tasks
  add column if not exists photos text[] not null default '{}';

comment on column public.tasks.photos is
  'tasks 버킷 안의 경로들. 규칙: <날짜>/<시각>-<무작위>-<원래 이름>';


-- ------------------------------------------------------------
-- 첨부가 들어갈 곳 — 비공개 버킷 (선생님 전용)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('tasks', 'tasks', false, 26214400)   -- 25MB (0064·0068 과 같은 상한)
    on conflict (id) do nothing;

    execute $p$drop policy if exists tasks_staff on storage.objects$p$;
    execute $p$
      create policy tasks_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'tasks' and public.is_staff())
        with check (bucket_id = 'tasks' and public.is_staff())
    $p$;
  end if;
end $$;

-- ─────────── 0148_answer_files.sql ───────────
-- 0148: 파일형 답지 — 원장이 제출을 확인해야 학생에게 열린다
--
-- 원장님 (2026-08-22) — 「답지가 DB화되지 않았을 때 업로드도 가능해야 해」
-- 「답지 없으면 그냥 제출까지, 답지 있으면 채점하라는 메시지까지 나오기」
--
-- 수업 없는 날 학생이 숙제를 내면 원장이 원격으로 「확인」 을 누르고, 그
-- 순간 답지가 열려 학생이 미리 채점해 온다 (내신 프린트가 주 용도다).
--
-- **배정 줄(daily_report_items)에 두면 안 된다** — 그 줄은 저장할 때마다
-- 통째로 지우고 다시 넣는다(saveStudentDay). 답지를 거기 붙이면 저장 한 번에
-- 날아간다. 그래서 (학생 · 학습항목 · 배정일)을 열쇠로 하는 별도 표다.

create table if not exists public.answer_files (
  student_id       uuid not null references public.students(id) on delete cascade,
  homework_item_id uuid not null references public.homework_items(id) on delete cascade,
  date             date not null,                 -- 숙제를 배정한 날
  paths            text[] not null default '{}',  -- answers 버킷 안의 경로들
  opened_at        timestamptz,                   -- 원장 확인으로 답지가 열린 시각
  created_at       timestamptz not null default now(),
  primary key (student_id, homework_item_id, date)
);

comment on table public.answer_files is
  '숙제에 붙인 파일형 답지. 원장이 제출을 확인(opened_at)해야 학생에게 열린다';
comment on column public.answer_files.paths is
  'answers 버킷 안의 경로들. 규칙: <student_id>/<homework_item_id>/<date>/<시각>-<무작위>-<원래 이름>';

alter table public.answer_files enable row level security;

drop policy if exists staff_all on public.answer_files;
create policy staff_all on public.answer_files
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 줄, 열린 것만** 읽는다. 열리기 전에는 줄 자체가 안 보인다 —
-- 「있다」 는 것만 아래 my_answer_flags 가 알려준다 (경로는 새지 않는다).
-- 학부모 정책은 일부러 없다 — 답지는 학생에게만 열린다.
drop policy if exists answers_student_read on public.answer_files;
create policy answers_student_read on public.answer_files
  for select to authenticated
  using (student_id = public.my_student_id() and opened_at is not null);

-- 「제출하면 선생님 확인 후 답지가 열려요」 힌트는 열리기 **전**에도 보여야
-- 한다. 줄을 통째로 열어주는 대신, 있고 없음·열림만 내주는 함수를 둔다
-- (0047·0064 처럼 security definer — 정책 잠금을 안 탄다).
create or replace function public.my_answer_flags(d date)
returns table(homework_item_id uuid, opened boolean)
language sql
stable
security definer
set search_path = public
as $$
  select af.homework_item_id, (af.opened_at is not null)
    from public.answer_files af
   where af.student_id = public.my_student_id()
     and af.date = d;
$$;
revoke all on function public.my_answer_flags(date) from public;
grant execute on function public.my_answer_flags(date) to authenticated;

-- 저장소 읽기 판정 — 정책 안에서 RLS 걸린 표를 직접 읽으면 조용히 거짓이
-- 된다 (0047 에서 실제로 그랬다). security definer 함수 하나로 감싼다.
create or replace function public.can_read_answer(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.answer_files af
     where af.student_id = public.my_student_id()
       and af.opened_at is not null
       and p = any(af.paths)
  );
$$;
revoke all on function public.can_read_answer(text) from public;
grant execute on function public.can_read_answer(text) to authenticated;

-- ------------------------------------------------------------
-- 답지가 들어갈 곳 — 비공개 버킷
--   쓰기는 선생님만. 학생은 **열린 자기 답지만** 읽는다 (볼 때마다 짧은 링크).
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('answers', 'answers', false, 26214400)   -- 25MB (0064·0147 과 같은 상한)
    on conflict (id) do nothing;

    execute $p$drop policy if exists answers_staff on storage.objects$p$;
    execute $p$
      create policy answers_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'answers' and public.is_staff())
        with check (bucket_id = 'answers' and public.is_staff())
    $p$;

    execute $p$drop policy if exists answers_read on storage.objects$p$;
    execute $p$
      create policy answers_read on storage.objects
        for select to authenticated
        using (bucket_id = 'answers' and public.can_read_answer(name))
    $p$;
  end if;
end $$;

-- ─────────── 0149_book_pause.sql ───────────
-- 교재멈춤 · 숙제멈춤 (원장님, 2026-08-22 — 「숙제검사 후 자동 숙제 배정할
-- 때와 진도 체크에 교재멈춤·숙제멈춤 버튼. 교재멈춤은 내신 대비할 때 아예
-- 진도 스탑, 숙제멈춤은 숙제만 안 나감. 버튼이나 체크박스 해제해야 정상
-- 수업 숙제 나가기」).
--
-- 학생×교재 배정 줄에 멈춤 상태 하나를 적는다.
--   null    정상 — 여느 때처럼 자동 차림·숙제가 나간다
--   'all'   교재멈춤 — 내신 대비 기간처럼 이 교재 진도를 아예 세운다.
--           루틴 자동 차림(등원·숙제·다음 수업 미리 담기) 전부에서 빠진다
--   'home'  숙제멈춤 — 수업(등원 학습)은 그대로 하되 숙제만 안 나간다
--
-- 0133 의 skip_acts(활동 빼기)와는 다르다 — 그건 「이 학생은 워크북을 영영
-- 뺀다」 이고, 이건 「이 교재를 잠시 세운다 (해제하면 그대로 재개)」 다.
-- 판단은 app/today/routineActions.js nextRoutine 한 곳이 읽는다.

alter table public.student_textbooks
  add column if not exists pause text;

create or replace function public.book_pause_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.book_pause_on() to authenticated;

-- ─────────── 0150_arrival_leave.sql ───────────
-- 0150: 하원 — 아이가 「하원할게요」 를 누른 시각
--
-- 원장님 (2026-08-23) — 「학생이 핸드폰 냈어요 누르면 바로 출석 처리하게
-- 해줘. 그러면 엄마한테도 등원했다고 알림 가게 해줘. 그리고 하원 누르면
-- 자동 로그아웃되고, 엄마에게 하원했다고 알림 가게 해줘」.
--
-- 하원은 지금까지 **시각으로 짐작**했다 (반 끝나는 시간이 지나면 하원으로 봄).
-- 짐작은 보강·조퇴·늦게 남은 날에 어긋난다. 아이가 직접 누르면 그 시각이
-- 사실이 된다 — 등원(phone_at)과 같은 자리에 같은 방식으로 적는다.
--
-- 학생 앱은 **등원하면 학원 공용 기기**로 보고, 집에서는 제 폰으로 본다.
-- 그래서 하원 단추는 학원 안에서만 뜨고, 공용 기기로 표시해 둔 기기에서만
-- 로그아웃까지 한다 (제 폰이면 로그아웃하면 집에서 숙제를 못 본다).

alter table public.arrival_checks
  add column if not exists leave_at timestamptz;

comment on column public.arrival_checks.leave_at is
  '아이가 「하원할게요」 를 누른 시각 (학부모 알림도 이때 나간다)';

create or replace function public.arrival_leave_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.arrival_leave_on() to authenticated;
