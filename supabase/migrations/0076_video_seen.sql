-- 「실제로 지나간 구간」을 세는 한 벌 (계획 「영상」 절)
--
-- ⚠️ 교재 화면 담당이 `spans` 를 **jsonb 로 짐작**해 `x->>0` 을 썼다가 터졌다
--    (`operator does not exist: int4range ->> integer`). 진짜 꼴은 **`int4range[]`** 다 —
--    Postgres 의 범위 배열이라, 겹침 합치기를 **Postgres 에게 맡긴다**(`range_agg`).
--    직접 정렬해 합치면 같은 판단이 두 벌이 되고 경계 하나에서 갈린다.
--
-- ⚠️ **끝까지 끌어다 놓고 「다 봤다」를 막는다** — 끌어 놓은 자리는 구간이 안 생기므로 안 세어진다.
-- ⚠️ **대략치다.** 임베드가 막힌 영상은 앱 안에서 못 틀고, 「틀어놓고 딴짓」은 못 잡는다 —
--    **아이를 판단할 숫자가 아니다**(계획 ⑪).
-- ⚠️ 저장하지 않는다(원칙 5).
create or replace function v2.video_seen(p_video uuid, p_student uuid)
returns table (secs int, pct int) language sql stable as $$
  with v as (select seconds from v2.video where id = p_video),
  m as (
    select range_agg(r) mr              -- 겹치는 구간을 Postgres 가 합쳐 준다
      from v2.video_view vv, unnest(vv.spans) r
     where vv.video_id = p_video and vv.student_id = p_student
  ),
  s as (
    select coalesce((select sum(upper(x) - lower(x)) from unnest(m.mr) x), 0)::int t
      from m
  )
  select s.t,
         case when coalesce(v.seconds, 0) > 0
              then least(100, round(s.t * 100.0 / v.seconds))::int end
    from s, v
$$;
comment on function v2.video_seen is
  '실제로 지나간 구간의 합(초)과 %. ⚠️ **대략치다 — 아이를 판단할 숫자가 아니다.** '
  '끝까지 끌어다 놓은 것은 구간이 안 생겨 안 세어진다';
grant execute on function v2.video_seen(uuid, uuid) to authenticated, service_role;
