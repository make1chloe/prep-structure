-- 0112 · 학생 줄 머리 · 🗺 영역별 메모 · 📝 단원평가(목업 01 남긴 것 6) — 표는 다 있다(day_area_memo 0079 · unit_test 0011 · schools 0006). 규칙 값 하나와 권한만. 한 번 더 돌려도 같다.
insert into v2.rule (key, value, note) values
  ('unit_test.pass_pct', '80', '단원평가 통과선(%) — 목업 01 의 21/25=84% 가 통과로 보인다')
on conflict (key) do nothing;
-- 앱이 쓰는 두 표의 권한(정책은 있다: staff_all(0016) · staff_all_dam(0079))
grant select, insert, update on v2.day_area_memo to authenticated, service_role;   -- 지우는 권한은 없다(대전제-6 · check-grants) — 비운 메모는 빈 글로 남는다
revoke delete on v2.day_area_memo from authenticated;
grant select, insert, update on v2.unit_test to authenticated, service_role;
grant select on v2.grammar_topics, v2.schools to authenticated, service_role;
comment on column v2.unit_test.state is '단원평가 상태 — todo 낼 것 · made 출제함 · taken 봄 · scored 채점함(맞은 개수 correct · 통과선은 규칙 unit_test.pass_pct). 01 의 📝 카드는 scored 가 아니거나 오늘 채점한 것만 보인다';
