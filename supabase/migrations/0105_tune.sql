-- 0105 · 조절 모달(목업 02) — 판×교재에 「조절한 때」 · 규칙 줄 둘(같은 조절 몇 번째면 묻나 · 몇 문항부터 「이번에 낼 번호」를 보이나, 뼈대-5) · 오늘 분량 셈 권한. 한 번 더 돌려도 같다.
alter table v2.sheet_book add column if not exists tuned_at timestamptz;
comment on column v2.sheet_book.tuned_at is '조절(02)을 적용한 때. 같은 아이 같은 교재에 몇 번째인지 세어 「루틴을 고칠까요」를 묻는다(9/5 ④) — 답은 루틴 11 에 적힌다';
insert into v2.rule (key, value, note) values
  ('tune.ask_after',   '3',  '같은 아이 같은 교재의 조절이 이 횟수째면 「루틴을 고칠까요」를 묻는다(목업 02 · 9/5 ④·⑦)'),
  ('chunk.split_from', '40', '소단원 한 줄의 문항 수가 이 이상이면 조절에서 「이번에 낼 번호」를 보인다(목업 02 — 62문항 대비문제를 한 번에 못 낸다)')
on conflict (key) do nothing;
-- 오늘 분량(항목·쪽·문항)은 v2.today_load 한 곳(0068) — 0017 의 「모든 함수」 권한이 0018 보다 먼저라 빠져 있었다
grant execute on function v2.today_load(uuid, date) to authenticated, service_role;
