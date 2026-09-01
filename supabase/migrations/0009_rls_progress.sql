-- ─────────────────────────────────────────────────────────────
-- 0009 · 교재·진도의 접근 규칙
--
-- **가장 조심할 자리** — 아이가 진도를 찍는다(원장님 ㊶). 그런데 새 앱은
-- **진도 하나에 숙제가 전부 매달려 있다.** 그래서 세 겹으로 막는다:
--   ① 열려 있을 때만            v2.can_edit_progress()
--   ② 원장·검사가 찍은 줄은 못 덮는다   using (last_by='student' or status='none')
--   ③ 아이가 쓰면 반드시 「확인 기다리는 중」  with check (last_by='student' and not confirmed)
-- ─────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['schools','exams','stop_rule','books','book_alias','units',
                           'grammar_topics','unit_topic','student_book','progress',
                           'progress_part','progress_flag','progress_edit'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format($f$create policy staff_all on v2.%I for all to authenticated
                      using (v2.is_staff()) with check (v2.is_staff())$f$, t);
  end loop;
end $$;

-- ── 목록은 보여도 된다 (이름뿐이다) ────────────────────────
create policy read_books  on v2.books        for select to authenticated using (state <> 'stopped');
create policy read_units  on v2.units        for select to authenticated using (state = 'active');
create policy read_alias  on v2.book_alias   for select to authenticated using (true);
create policy read_topics on v2.grammar_topics for select to authenticated using (true);
create policy read_ut     on v2.unit_topic   for select to authenticated using (true);
-- ⚠️ 학교·시험은 **자기 학교 것만** (옛 앱은 8곳 58줄이 다 보였다)
create policy read_school on v2.schools for select to authenticated
  using (id in (select s.school_id from v2.students s where s.id in (select v2.my_students())));
create policy read_exam on v2.exams for select to authenticated
  using (scope='national'
      or school_id in (select s.school_id from v2.students s where s.id in (select v2.my_students())));

-- ── 배정·진도는 자기 것만 ──────────────────────────────────
create policy own_sb on v2.student_book for select to authenticated
  using (student_id in (select v2.my_students()));
create policy own_pr on v2.progress for select to authenticated
  using (student_id in (select v2.my_students()));
create policy own_pp on v2.progress_part for select to authenticated
  using (student_id in (select v2.my_students()));
create policy own_pf on v2.progress_flag for select to authenticated
  using (student_id in (select v2.my_students()));
create policy read_pe on v2.progress_edit for select to authenticated using (true);

-- ── ⭐ 아이가 진도를 찍는다 — 세 겹 ────────────────────────
create policy child_progress_insert on v2.progress for insert to authenticated
  with check (
    student_id in (select v2.my_students())
    and v2.can_edit_progress(student_id)          -- ① 열려 있을 때만
    and last_by = 'student' and confirmed = false  -- ③ 확인 기다리는 중으로만
  );
create policy child_progress_update on v2.progress for update to authenticated
  using (
    student_id in (select v2.my_students())
    and v2.can_edit_progress(student_id)
    and (last_by = 'student' or status = 'none')   -- ② 원장·검사가 찍은 줄은 못 덮는다
  )
  with check (
    student_id in (select v2.my_students())
    and last_by = 'student' and confirmed = false
  );
-- ⚠️ 지우는 길은 **안 연다.** 아이가 지우면 진도가 조용히 빈다

-- ── ❗ 이의 — 달 수만 있다 ─────────────────────────────────
create policy child_flag_insert on v2.progress_flag for insert to authenticated
  with check (student_id in (select v2.my_students())
              and seen_at is null and outcome is null);  -- 스스로 처리 못 한다
-- 고치기·지우기 없음 — 원장님이 보실 때까지 그대로 있어야 한다
