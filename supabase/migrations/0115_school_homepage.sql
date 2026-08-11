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
