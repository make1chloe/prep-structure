-- ─────────────────────────────────────────────────────────────
-- 0037 · 단어 — 시험은 루틴 밖이고, **교재멈춤이면 시험도 멈춘다**
--
-- 원장님 2026-09-02:
--   「단어는 학원에서 **단어시험 말고 없어서** 할 게 없다」 → 루틴 학원 0줄이 맞다
--   「**단어 교재 멈춤 누르면 시험도 멈춘다**」 ← 이 연결이 없었다
--
-- ⚠️ 단어시험은 **루틴 항목이 아니다.** 루틴은 「교재예습 · 클카 필수학습」 둘뿐이고,
--    시험은 별도 표(`word_test`)다. 그래서 **멈춤이 루틴만 막고 시험은 그냥 나갔다.**
--    조용히 일어난다 — 교재를 멈춰 놨는데 단어시험지가 계속 나온다.
-- ─────────────────────────────────────────────────────────────

/** 오늘 이 아이의 이 교재로 단어시험을 보나 */
create or replace function v2.word_test_on(p_student uuid, p_book uuid, p_on date default null)
returns boolean language sql stable as $$
  select exists (
    select 1 from v2.student_book sb
    where sb.student_id = p_student and sb.book_id = p_book
      and sb.from_date <= coalesce(p_on, v2.today())
      and (sb.to_date is null or sb.to_date >= coalesce(p_on, v2.today()))
      and sb.stop_mode <> 'book_off'          -- ⭐ 교재멈춤이면 시험도 멈춘다
      and (sb.stop_until is null or sb.stop_until < coalesce(p_on, v2.today()))
  )
$$;
comment on function v2.word_test_on is
  '⚠️ `book_off` 면 **시험도 안 나간다**(원장님 9/2). `hw_off`(숙제멈춤)는 시험을 안 막는다 —
   단어시험은 학원에서 보는 것이라 숙제와 별개다';

/** 오늘 이 아이가 볼 단어시험 목록 — 멈춘 교재는 빠진다 */
create or replace function v2.word_tests_today(p_student uuid, p_on date default null)
returns table (book_id uuid, book_name text)
language sql stable as $$
  select b.id, b.name
  from v2.student_book sb join v2.books b on b.id = sb.book_id
  where sb.student_id = p_student and b.area = '단어'
    and sb.from_date <= coalesce(p_on, v2.today())
    and (sb.to_date is null or sb.to_date >= coalesce(p_on, v2.today()))
    and v2.word_test_on(p_student, b.id, p_on)
$$;

-- 멈춘 교재로 시험을 넣으려 하면 **그 자리에서 막는다**
create or replace function v2.word_test_guard() returns trigger
language plpgsql as $$
declare sid uuid;
begin
  if new.book_id is null then return new; end if;
  select s.student_id into sid from v2.day_sheet s where s.id = new.sheet_id;
  if sid is not null and not v2.word_test_on(sid, new.book_id,
       (select date from v2.day_sheet where id = new.sheet_id)) then
    raise exception '멈춘 교재로는 단어시험을 낼 수 없습니다 (교재멈춤)';
  end if;
  return new;
end $$;
create trigger word_test_stop before insert or update on v2.word_test
  for each row execute function v2.word_test_guard();

grant execute on function v2.word_test_on(uuid,uuid,date), v2.word_tests_today(uuid,date) to authenticated;
