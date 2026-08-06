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
