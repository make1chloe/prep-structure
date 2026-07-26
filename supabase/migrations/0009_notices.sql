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
