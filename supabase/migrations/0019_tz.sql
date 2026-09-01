-- ─────────────────────────────────────────────────────────────
-- 0019 · 시간대 — 하나로 (계획 0단계 2번)
-- ⚠️ 검사가 잡았다: `current_date`(UTC) 와 `v2.today()`(서울) 를 섞어 쓰면
--    **밤 9시 이후 하루가 어긋난다.** 옛 앱에서 실제로 5건 났다.
--    → 기본값을 전부 v2.today() 로 바꾸고, 검사가 `current_date` 를 잡는다.
-- ─────────────────────────────────────────────────────────────
alter table v2.prep_scope   alter column added_on set default v2.today();
alter table v2.payment      alter column ym       drop default;
alter table v2.file         alter column uploaded_at set default now();

-- 「지금 서울에서 몇 시인가」 — 밤 9시 넘었나를 한 곳에서
create or replace function v2.seoul_hour() returns int
  language sql stable as $$ select extract(hour from (now() at time zone 'Asia/Seoul'))::int $$;
grant execute on all functions in schema v2 to authenticated;
