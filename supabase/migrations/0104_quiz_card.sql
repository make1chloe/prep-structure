-- 0104 · 시험 카드(목업 01 🔤 시험 · 📝 다음 시간 시험) — 손 권한 · 판정 계산 칸. 표는 0038~0041(v2.quiz · quiz_style) 그대로. 한 번 더 돌려도 같다.
-- 0038 은 quiz 에 select 만 줬다 — 원장님 손(내기·보기·재시험)이 못 쓴다. 누가 쓰나는 RLS staff_all 이 가른다(권한은 문, 규칙은 사람)
grant insert, update on v2.quiz, v2.quiz_style to authenticated, service_role;
-- 판정은 SQL 한 곳(v2.quiz_passed) — PostgREST 가 quiz 를 읽을 때 passed·pct 계산 칸으로 같이 준다. 화면·lib 는 다시 세지 않는다
create or replace function v2.passed(q v2.quiz) returns boolean language sql stable as $$ select v2.quiz_passed(q.id) $$;
create or replace function v2.pct(q v2.quiz) returns numeric language sql stable as $$
  select round((q.total - q.wrong)::numeric / nullif(q.total, 0) * 100, 0)
$$;
create or replace function v2.text(s v2.quiz_style) returns text language sql stable as $$ select v2.style_text(s.id) $$;
grant execute on function v2.passed(v2.quiz), v2.pct(v2.quiz), v2.text(v2.quiz_style) to authenticated, service_role;
comment on function v2.passed(v2.quiz) is '계산 칸 — select=…,passed 로 읽는다. 통과 판정은 v2.quiz_passed 한 곳(대전제-4)';
create index if not exists quiz_student_taken on v2.quiz (student_id, taken_on);
