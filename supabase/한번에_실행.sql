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
-- (0008 ~ 0016 을 하나로 합친 것입니다)
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
