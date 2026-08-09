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
