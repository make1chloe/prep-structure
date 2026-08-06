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
