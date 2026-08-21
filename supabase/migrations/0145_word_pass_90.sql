-- 단어시험 통과선 90 확정 (원장님 2026-08-21 「90%」).
-- 코드 기본값이 80/90 으로 갈라져 있던 것을 90 으로 통일하면서,
-- 이미 저장된 설정이 옛 기본값 80 그대로면 90 으로 올린다
-- (원장님이 일부러 80 이 아닌 다른 값을 적으셨다면 안 건드린다).
update integrations
set config = jsonb_set(config, '{wordPassPct}', '90')
where id = 'warning'
  and (config->>'wordPassPct')::numeric = 80;

-- 실행 확인용 표식 (설정 → SQL 배지가 이 함수 유무로 실행 여부를 안다)
create or replace function word_pass_90() returns boolean
language sql stable as $$ select true $$;
