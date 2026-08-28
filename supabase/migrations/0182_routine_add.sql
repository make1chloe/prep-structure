-- 0182: 루틴에 **이 학생에게만** 학습 항목을 더한다
-- (원장님 2026-08-28 — 「재원생에서 루틴에 학습항목 추가할 수 있게 해줘」).
--
-- ── 여태 없던 칸이다 ──────────────────────────────────────────────
-- 루틴은 교재별(routine_steps.textbook_id) · 영역별(0137, textbook_id
-- is null) 로 **한 벌** 적어두고, 학생 쪽은 두 칸으로 **빼기와 차례만**
-- 쥐고 있었다:
--     routine_skip  (0153)  이 학생이 안 하는 항목
--     routine_order (0154)  이 학생의 차례
-- 그래서 「이 아이한테만 하나 더」 를 담을 데가 없었다. 교재 루틴에 더하면
-- **그 교재를 쓰는 다른 학생 전부**가 바뀌고, 영역 루틴이면 **그 영역에서
-- 제 루틴이 없는 교재 전부 · 학생 전부**가 바뀐다 — 말없이 바뀌면 사고다.
-- 원장님이 (가) 「이 학생에게만」 으로 정하셨다 (2026-08-28).
--
-- ── 담는 모양 ────────────────────────────────────────────────────
--   {"inclass": [항목id…], "home": [항목id…], "next": [항목id…]}
-- 셋은 routine_steps 의 inclass_items · home_items · home_next 와 **같은
-- 뜻**이다 (등원 / 집 숙제 / 예습). 등원과 숙제 양쪽에 같은 항목을 넣는
-- 것도 그대로 된다 — 루틴이 원래 그것을 허용한다.
--
-- ── 뜻: 「이 교재 루틴의 **모든 회차**에 더한다」 ─────────────────
-- routine_skip · routine_order 가 회차를 안 가리고 교재 전체에 걸리는 것과
-- 같은 결이다. 차림(nextRoutine)은 그 학생의 **지금 회차 한 단계**만
-- 내보내므로, 회차별로 담으려면 「어느 회차에」 를 매번 물어야 한다.
-- **한계**: 「3회차에만」 은 안 된다 — 그건 교재 루틴을 고쳐야 한다.
-- 원장님이 이 한계를 아시고 고르셨다.
--
-- ── 왜 uuid[] 셋이 아니라 jsonb 하나인가 ─────────────────────────
-- 셋은 따로 노는 값이 아니라 **한 덩어리**(이 학생이 더한 것)라, 칸을 셋으로
-- 쪼개면 읽는 자리마다 폴백 사다리가 셋이 된다. 한 칸이면 사다리도 하나다.
--
-- 되돌리기:
--   alter table public.student_textbooks drop column if exists routine_add;

alter table public.student_textbooks
  add column if not exists routine_add jsonb not null default '{}'::jsonb;

comment on column public.student_textbooks.routine_add is
  '이 학생에게만 더한 학습 항목 — {"inclass":[id…],"home":[id…],"next":[id…]}. '
  '이 교재 루틴의 모든 회차에 더해진다 (0182). 읽는 곳: '
  'app/students/routinePickActions.routineChoices(화면) · '
  'app/today/routineActions.nextRoutine(차림) · lib/itemRefs(죽은 이름표 청소)';

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다).
-- **칸이 실제로 있는지** information_schema 로 본다 — 칸이 없으면 화면이
-- 오류 없이 조용히 옛 동작으로 돌아간다 (0174 와 같은 종류의 함정).
create or replace function public.routine_add_on()
returns boolean language sql stable as $$
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'student_textbooks'
       and column_name  = 'routine_add'
  );
$$;
grant execute on function public.routine_add_on() to authenticated;

-- ────────────────────────────────────────────────────────────────
-- **원장님 확인용** (0182 를 돌린 **뒤에** 이것만 따로 실행)
-- **두 번 돌려도 숫자가 그대로여야 한다** (재실행 감지).
--
-- select '칸' 무엇, count(*) 숫자, '1 이어야 맞아요' 기대
--   from information_schema.columns
--  where table_schema='public' and table_name='student_textbooks'
--    and column_name='routine_add'
-- union all
-- select '기본값이 빈 덩어리인가', count(*), '1 이어야 맞아요'
--   from information_schema.columns
--  where table_schema='public' and table_name='student_textbooks'
--    and column_name='routine_add' and column_default like '%{}%'
-- union all
-- select '탐침', case when public.routine_add_on() then 1 else 0 end, '1 이어야 맞아요'
-- union all
-- select '더한 항목이 있는 학생·교재 줄', count(*), '처음엔 0 (더하면 늘어요)'
--   from public.student_textbooks
--  where routine_add <> '{}'::jsonb;
