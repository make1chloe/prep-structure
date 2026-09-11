-- 0161 「멈췄나」를 한 곳에서만 판단한다 (원칙-1)
--
-- 원장님 2026-09-11 「첫 주 돌려보기」에서 잡힌 것:
--   시험 회차를 넣는 **순간** 그 회차에 묶인 교재 줄이 미리 서고(stop_mode=book_off ·
--   stop_from=시험 몇 주 전 · stop_until=시험 뒤), 그 **stop_from 전**에는 교재가 멀쩡히 돌아간다.
--   실제로 오늘 수업 01 은 학습·숙제를 그대로 깔았다. 그런데 같은 줄을 보는 SQL 은
--   stop_from 을 **아예 안 봐서** 「멈춘 교재로는 시험을 낼 수 없습니다」로 막았다.
--   → 시험 몇 주 전부터 시험을 못 내는 상태가 조용히 이어진다.
--
-- 까닭: 같은 판단(「이 교재가 이 날 멈췄나」)이 JS(lib/routine-plan.js stopOn)와
--       SQL(v2.word_test_on) 두 벌로 적혀 있었고, 두 벌은 반드시 어긋난다(원칙-1).
-- 고침: SQL 쪽 판단을 v2.book_off_on 하나로 뽑고, JS stopOn 과 **글자 그대로 같은 규칙**을 적는다.
--       읽는 자리(word_test_on)는 그것을 부른다. scripts/check-stop.mjs 가 둘을 맞대어 잰다.

create or replace function v2.book_off_on(p_mode text, p_from date, p_until date, p_on date)
returns boolean language sql immutable as $$
  -- lib/routine-plan.js stopOn 과 같은 규칙:
  --   상태가 없거나 running 이면 안 멈춤 · stop_from 이 아직 안 왔으면 안 멈춤 · stop_until 이 지났으면 안 멈춤
  select p_mode = 'book_off'
     and (p_from  is null or p_from  <= p_on)
     and (p_until is null or p_until >= p_on)
$$;
comment on function v2.book_off_on is
  '「이 교재 줄이 이 날 교재멈춤인가」 — lib/routine-plan.js stopOn 과 한 규칙(원칙-1).
   stop_from 전이면 아직 진행중 · stop_until 이 지났으면 다시 진행중.';

create or replace function v2.word_test_on(p_student uuid, p_book uuid, p_on date default null)
returns boolean language sql stable as $$
  select exists (
    select 1 from v2.student_book sb
    where sb.student_id = p_student and sb.book_id = p_book
      and sb.from_date <= coalesce(p_on, v2.today())
      and (sb.to_date is null or sb.to_date >= coalesce(p_on, v2.today()))
      and not v2.book_off_on(sb.stop_mode::text, sb.stop_from, sb.stop_until, coalesce(p_on, v2.today()))
  )
$$;
comment on function v2.word_test_on is
  '⚠️ `book_off` 면 **시험도 안 나간다**(원장님 9/2). `hw_off`(숙제멈춤)는 시험을 안 막는다 —
   단어시험은 학원에서 보는 것이라 숙제와 별개다.
   멈췄나는 v2.book_off_on 한 곳에서만 판단한다(0161) — 2026-09-11 첫 주 돌려보기에서
   stop_from 을 안 보던 것이 잡혔다(시험 몇 주 전부터 시험을 못 냈다).';

notify pgrst, 'reload schema';
