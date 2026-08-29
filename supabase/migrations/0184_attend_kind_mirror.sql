-- 0184: 출결을 어디서 찍든 **그날 판(daily_reports)** 에 같이 적힌다
--
-- 원장님 확정 2026-08-29 — 「판을 안 열고 출결만 빠르게 찍은 날도
-- 월간리포트 수업일수에 **센다**」.
--
-- 이것은 2026-08-27 확정(「출결 찍힌 판만 수업으로 센다」 — 0잔여-A #16,
-- lib/monthly.js 의 그 주석)을 **원장님이 8/29 에 바꾸신 것**이다.
-- 옛 확정 문구는 그때의 판단이라 지우지 않고 그대로 둔다. 세는 규칙
-- (attendance_kind 가 있는 판만 수업)은 그대로다 — 대신 **출결을 찍으면
-- 그 판이 생기게** 한다.
--
-- ── 왜 필요한가 ────────────────────────────────────────────
--
-- 같은 「오늘 왔나」 가 두 곳에 따로 산다:
--   · public.attendance             — 하루 한 줄, 여덟 갈래가 여기에 쓴다
--   · daily_reports.attendance_kind — 월간 수업일수·지각 경고·학부모 3줄·
--                                     마감 판정이 **이것만** 읽는다
-- 맞춰 주는 것이 없어서, 판을 열어 저장한 날만 세어졌다. 같은 학원의
-- 같은 달인데 「어떤 날은 세고 어떤 날은 안 세는」 상태였다.
--
-- ── 왜 트리거가 아니라 함수인가 ────────────────────────────
--
-- attendance 에 트리거를 걸면 한 줄도 안 놓친다 — 그쪽이 더 튼튼하다.
-- 그런데 씨앗(scripts/live-month.mjs · scripts/e2e/seed.sql · supabase/seed)
-- 들이 **attendance 를 먼저 넣고 daily_reports 를 제 id 로 넣는다.**
-- 트리거가 먼저 판을 만들어 버리면 그 insert 가 통째로 튕기고
-- (`on conflict do nothing` + 그 id 를 참조하는 daily_report_items),
-- 「한 달 살아보기」 검사가 무엇을 재는지 알 수 없게 된다.
-- 그래서 **부르는 자리를 한 벌로 묶는 함수**로 둔다 — 부르는 쪽은
-- lib/attendKind.js 하나이고, 그 하나를 여덟 갈래가 지난다
-- (scripts/check-links.mjs ⑦ 절이 갈래마다 지키고 있다).
--
-- ── 왜 SQL 함수까지 필요한가 (그냥 upsert 하면 안 되나) ─────
--
-- 갈래 하나가 **학생 자신**이다 (app/me/arrivalActions.js — 아이가 폰을
-- 내면 그 자리에서 등원으로 잡힌다). 아이 권한에는 daily_reports 에
-- 쓰는 정책이 없다 (0169 student_self_reports 는 select 전용). 그대로면
-- 아이가 스스로 찍은 등원만 조용히 안 세어진다 — 오류도 안 난다.
-- 그래서 security definer 로 두고, 아이일 때는 0040 own_arrival_insert
-- 와 **똑같은 조건**(내 아이 · 오늘 · present)만 허용한다.
--
-- 소급 없음 — 이미 어긋난 과거는 안 건드린다 (아래 확인 select 참고).
--
-- 되돌리기:
--   drop function if exists public.mirror_attendance_kind(jsonb);
--   drop function if exists public.attend_mirror_on();

create or replace function public.mirror_attendance_kind(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r      jsonb;
  sid    uuid;
  d      date;
  k      text;
  staff  boolean := public.is_staff();
  n      int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    sid := (r->>'s')::uuid;
    d   := (r->>'d')::date;
    k   := nullif(r->>'k', '');
    if sid is null or d is null then continue; end if;

    -- 아이가 부를 수 있는 것은 **제 오늘 등원** 하나뿐 (0040 과 같은 조건)
    if not staff then
      if sid not in (select public.my_student_ids())
         or d <> (now() at time zone 'Asia/Seoul')::date
         or k is distinct from 'present' then
        raise exception '자기 오늘 등원만 적을 수 있어요.' using errcode = '42501';
      end if;
    end if;

    if k is null then
      -- **지우는 쪽** — 판을 새로 만들지는 않는다. 있는 판의 출결만 지운다
      -- (그 판에 붙은 숙제 검사·배정까지 없앨 일이 아니다).
      update public.daily_reports
         set attendance_kind = null
       where student_id = sid and date = d
         and archived_at is null
         and attendance_kind is not null;
    else
      -- 숨긴 판(0168)은 안 건드린다 — 건드리면 dr_unarchive 가 되살린다
      insert into public.daily_reports (student_id, date, attendance_kind)
      values (sid, d, k)
      on conflict (student_id, date) do update
         set attendance_kind = excluded.attendance_kind
       where daily_reports.archived_at is null
         and daily_reports.attendance_kind is distinct from excluded.attendance_kind;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.mirror_attendance_kind(jsonb) from public, anon;
grant execute on function public.mirror_attendance_kind(jsonb) to authenticated;

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다)
create or replace function public.attend_mirror_on()
returns boolean language sql stable as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mirror_attendance_kind'
  )
$$;
grant execute on function public.attend_mirror_on() to authenticated;

-- ── 원장님이 눈으로 볼 확인 숫자 ───────────────────────────
--
-- ① 이 SQL 이 들어갔나 (재실행해도 같은 답 — true 하나)
--     select public.attend_mirror_on();
--
-- ② **소급 안 한 과거가 며칠인가** — 「빠른 출결만 찍혀 월간에 안 잡힌 날」.
--    이 숫자는 이 SQL 을 다시 돌려도 안 줄어든다 (소급을 안 하므로).
--    오늘 이후로 새로 생기지 않는 것이 이번 공사의 목표다.
--     select count(*) as 안잡힌날
--       from public.attendance a
--       left join public.daily_reports r
--         on r.student_id = a.student_id and r.date = a.date
--      where a.date >= '2026-08-01'
--        and (r.id is null or r.attendance_kind is null);
--
-- ③ 반대 방향 — 「판에는 출결이 있는데 attendance 줄이 없는 날」
--     select count(*) as 판만있는날
--       from public.daily_reports r
--       left join public.attendance a
--         on a.student_id = r.student_id and a.date = r.date
--      where r.attendance_kind is not null and a.student_id is null;
