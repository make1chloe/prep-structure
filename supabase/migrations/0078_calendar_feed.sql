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
