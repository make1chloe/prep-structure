-- ============================================================
-- 클로이영어 앱 — 이 파일 하나만 실행하면 됩니다
--
-- 쓰는 법
--   1. https://supabase.com/dashboard → 프로젝트 선택
--   2. 왼쪽 메뉴 SQL Editor → + → Create a new snippet
--   3. 이 파일 내용을 전부 붙여넣기
--   4. 오른쪽 아래 Run (또는 Cmd/Ctrl + Enter)
--   5. "Success. No rows returned" 이 나오면 끝
--
-- 여러 번 실행해도 안전합니다. 이미 있는 것은 건너뜁니다.
-- 어디까지 실행했는지 기억 안 나면 그냥 처음부터 다시 붙여넣고 Run 하면 됩니다.
--
-- ★ 이 파일은 **0008 ~ 0023** 을 하나로 합친 것입니다.
--   (2026-07-26 기준 · 시험 일정 · 2026 시험 21건 · 댓글까지 들어 있음)
--
-- ※ 완전히 새 Supabase 프로젝트에 처음 까는 거라면 이 파일이 아니라
--   `SETUP_ALL.sql` 을 쓰세요. 그건 0001 부터 전부 들어 있습니다.
--   지금 쓰고 있는 프로젝트라면 이 파일이 맞습니다.
--
-- 제대로 됐는지 확인하는 법
--   · 오늘 수업 맨 위에 "공지 · 전달사항" 입력칸이 보이면      → 0009 까지 OK
--   · 수업 스케줄 · 시험 화면에 시험 일정이 21건 보이면        → 0022 까지 OK
--   · 학생용 페이지 숙제 아래 💬 댓글 버튼이 보이면            → 0023 까지 OK
-- ============================================================


-- ------------------------------------------------------------
-- 1. 교재 · 단원 기본 항목
-- ------------------------------------------------------------
alter table public.textbooks     add column if not exists pub_year    int;
alter table public.textbooks     add column if not exists status      text default 'active';
alter table public.textbook_units add column if not exists total_pages int;


-- ------------------------------------------------------------
-- 2. 숙제 배정에 교재 단원 연결
--    숙제 하나에 단원 여러 개를 붙일 수 있다
-- ------------------------------------------------------------
alter table public.daily_report_items
  add column if not exists textbook_unit_id uuid references public.textbook_units(id) on delete set null;
alter table public.daily_report_items add column if not exists textbook_unit_ids uuid[];
alter table public.daily_report_items add column if not exists range_note text;
create index if not exists daily_report_items_unit_idx
  on public.daily_report_items (textbook_unit_id);


-- ------------------------------------------------------------
-- 3. 학습 항목별 학습 방법 (학생용 페이지에서 보여줄 설명)
-- ------------------------------------------------------------
alter table public.homework_items add column if not exists method text;


-- ------------------------------------------------------------
-- 4. 공지 · 전달사항
--    한 번 써서 전체 / 반별 / 학교·학년별 / 개인별로 뿌린다
-- ------------------------------------------------------------
create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  kind         text not null default 'deliver',   -- deliver(수업 중 전달) | notice(학부모 공지)
  scope        text not null default 'all',       -- all | class | grade | student
  class_id     uuid references public.classes(id) on delete set null,
  school       text,
  grade        text,
  body         text not null,
  task_id      uuid,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists notices_date_idx on public.notices (date);

-- 대상 학생을 만들 때 확정해서 한 줄씩 깔아둔다
create table if not exists public.notice_receipts (
  notice_id    uuid not null references public.notices(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  delivered_at timestamptz,
  primary key (notice_id, student_id)
);
create index if not exists notice_receipts_student_idx
  on public.notice_receipts (student_id);


-- ------------------------------------------------------------
-- 5. 학생별 교재 배정 · 단원 진도
--    끝낸 단원만 기록한다 → 순서와 상관없이 체크할 수 있다
-- ------------------------------------------------------------
create table if not exists public.student_textbooks (
  student_id   uuid not null references public.students(id) on delete cascade,
  textbook_id  uuid not null references public.textbooks(id) on delete cascade,
  assigned_on  date not null default current_date,
  status       text not null default 'active',   -- active | done | dropped
  current_page int,                               -- 단원이 없는 교재는 페이지로 진도 기록
  primary key (student_id, textbook_id)
);
create index if not exists student_textbooks_book_idx
  on public.student_textbooks (textbook_id);

create table if not exists public.student_unit_progress (
  student_id       uuid not null references public.students(id) on delete cascade,
  textbook_unit_id uuid not null references public.textbook_units(id) on delete cascade,
  status           text not null default 'done',
  done_on          date default current_date,
  note             text,
  primary key (student_id, textbook_unit_id)
);
create index if not exists student_unit_progress_unit_idx
  on public.student_unit_progress (textbook_unit_id);

-- 이미 만들어 둔 경우를 위해
alter table public.student_textbooks add column if not exists current_page int;


-- ------------------------------------------------------------
-- 6. 데일리리포트 발송 · 재발송
-- ------------------------------------------------------------
alter table public.daily_reports add column if not exists sent_at          timestamptz;
alter table public.daily_reports add column if not exists report_text      text;  -- 고친 리포트 문구
alter table public.daily_reports add column if not exists homework_text    text;  -- 고친 숙제 문자
alter table public.daily_reports add column if not exists homework_sent_at timestamptz;
create index if not exists daily_reports_sent_idx on public.daily_reports (date, sent_at);

-- 보낸 이력 (몇 번, 언제, 무엇을, 성공했는지)
create table if not exists public.report_sends (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  kind            text not null default 'report',   -- report | homework
  body            text not null,
  sent_at         timestamptz not null default now(),
  sent_by         uuid references public.profiles(id) on delete set null,
  channel         text,                             -- copy | sms | webhook
  ok              boolean,
  detail          text,
  to_phone        text
);
create index if not exists report_sends_report_idx
  on public.report_sends (daily_report_id, kind);

alter table public.report_sends add column if not exists channel  text;
alter table public.report_sends add column if not exists ok       boolean;
alter table public.report_sends add column if not exists detail   text;
alter table public.report_sends add column if not exists to_phone text;


-- ------------------------------------------------------------
-- 7. 할일 · 일정
--    일정에 "학생에게 전달할 내용"을 적어두면 그날 전달사항으로 깔린다
-- ------------------------------------------------------------
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
  deliver_body      text,
  deliver_scope     text,
  deliver_class_id  uuid references public.classes(id) on delete set null,
  deliver_school    text,
  deliver_grade     text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_due_idx on public.tasks (due_on, status);

-- 만든 전달사항을 원래 일정과 연결
alter table public.notices
  add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists notices_task_idx on public.notices (task_id);


-- ------------------------------------------------------------
-- 8. 연동 설정 (문자 발송 · 웹훅 · 알림 키)
--    환경변수 대신 앱 설정 화면에서 바꾼다. 원장만 접근할 수 있다.
-- ------------------------------------------------------------
create table if not exists public.integrations (
  id         text primary key,          -- academy | solapi | webhook | push
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.integrations (id, enabled, config) values
  ('academy', true, '{"name":"클로이영어"}'::jsonb)
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 9. 앱 알림 (웹 푸시) — 요금 없는 알림
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 10. 권한 (RLS)
-- ------------------------------------------------------------

-- 선생님(직원)은 전부 볼 수 있는 표
do $$
declare t text;
begin
  foreach t in array array[
    'notices','notice_receipts',
    'student_textbooks','student_unit_progress',
    'report_sends','tasks'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- 연동 설정: 원장만
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

-- 알림 기기: 본인 기기는 본인이, 선생님은 전체
alter table public.push_subscriptions enable row level security;
drop policy if exists own_or_staff on public.push_subscriptions;
create policy own_or_staff on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid() or public.is_staff())
  with check (profile_id = auth.uid() or public.is_staff());

-- 학생은 자기 기록만 볼 수 있다
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

-- 숙제 항목 · 교재 · 단원은 학생도 읽을 수 있어야 한다 (학습 방법, 단원명)
drop policy if exists read_all_staff_or_student on public.homework_items;
create policy read_all_staff_or_student on public.homework_items
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbook_units;
create policy read_all_staff_or_student on public.textbook_units
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbooks;
create policy read_all_staff_or_student on public.textbooks
  for select to authenticated using (true);


-- ============================================================
-- 끝. 실행 후 앱에서 할 것
--   1) 설정 → 알림 키 만들기 (한 번만)
--   2) 반 → 반 선택 → 교재 배정
--   3) 학습 항목 → 학습 방법 채우기
-- ============================================================


-- ============================================================
-- 11. 결석 예정 · 신규 상담 · 안내 문자 템플릿 (0017)
-- ============================================================

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
on conflict do nothing;


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


-- ============================================================
-- 0018: 수강료 계산 · 학부모 신청 양식
-- ============================================================

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


-- ============================================================
-- 0019: 일정 연결 · 학생/학부모 요청 · 교재 사용 기록
-- ============================================================

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


-- ============================================================
-- 0020: 할일 / 일정 분리
-- ============================================================

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
on conflict do nothing;

alter table public.todo_categories enable row level security;
drop policy if exists staff_all on public.todo_categories;
create policy staff_all on public.todo_categories
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- ============================================================
-- 0021: 학교 시험 일정
-- ============================================================

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

