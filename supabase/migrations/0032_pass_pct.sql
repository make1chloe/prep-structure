-- 0032: 점수 기준을 하나로 — **성취도 %**
--
-- 어떤 줄은 높아야 좋고(숙제 성취도) 어떤 줄은 낮아야 좋으면(오답률)
-- 읽는 사람이 매번 뒤집어 생각해야 한다. 전부 **높을수록 좋은 %** 로 맞춘다.
--
--   단어시험    18/20  →  90% (2개 틀림)
--   단원평가    17/20  →  85% (3개 틀림)
--   숙제 성취도          88%
--
-- 통과선도 같은 방향으로 적는다. "오답 10% 이내" 와 "성취도 90% 이상" 은 같은 말이다.
update public.integrations
   set config = (config - 'wordWrongPct')
              || jsonb_build_object(
                   'wordPassPct',
                   coalesce(100 - (config->>'wordWrongPct')::int, 90)
                 )
 where id = 'warning'
   and config ? 'wordWrongPct';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordPassPct":90,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;
