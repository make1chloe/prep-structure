-- ⚠️⚠️ **발송이 한 통도 안 나가는 자리였다.**
-- `lib/notify.js` 는 막힌 발송(NOTIFY_SINK=off·self)을 자취에 남기면서 `sent_at` 을 **비운다** —
-- 「안 보냈다」가 사실이기 때문이다. 그런데 그 칸이 **not null** 이라 insert 가 그 자리에서 터진다.
-- ⚠️ 기본값이 `off` 이므로 **지금 상태에서 모든 발송이 실패한다.**
--    가짜 DB 검사(check-notify 11건)는 이걸 원리적으로 못 잡는다 — 제약이 없으니까.
--    PREPARE 검사(check-sql)도 못 잡는다 — not null 은 넣어 봐야 안다.
alter table v2.notify_log alter column sent_at drop not null;
comment on column v2.notify_log.sent_at is
  '실제로 내보낸 때. ⚠️ **막혔으면 비운다**(NOTIFY_SINK=off·self) — 「안 보냈다」가 사실이다. '
  'not null 이면 막힌 발송이 자취조차 못 남기고 그 자리에서 터진다';

-- 그 달의 진도를 셀 수 있게 (월간 리포트 담당 요청 — 진짜 DB 로 세워 답까지 확인함)
-- ⚠️ 지금 v2.book_progress() 는 날짜를 안 받아 **오늘 누적**만 준다. 그래서 지난 달 리포트에
--    **그 달에 있지도 않았던 진도**가 실렸다 (실측 2026-07 진도 줄 5개 중 4개 · 2026-06 은 3개 중 3개).
-- ⚠️ v2.book_progress() 는 **안 지운다** — 커서·진도율 화면이 그대로 쓴다(대전제 6).
-- ⚠️ 남는 한 가지 — `v2.units.state` 에 이력이 없어 **분모(단원 수)는 여전히 오늘 기준**이다.
--    「그날 이 단원이 살아 있었나」를 물어볼 칸 자체가 없다. 이 함수로도 못 고친다.
create or replace function v2.book_progress_on(p_student uuid, p_book uuid, p_on date)
returns table (done int, skipped int, total int, round smallint)
language sql stable as $$
  with sb as (select round from v2.student_book
              where student_id = p_student and book_id = p_book
                and from_date <= p_on and (to_date is null or to_date >= p_on)
              order by from_date desc limit 1),
  u as (select id from v2.units where book_id = p_book and state = 'active'),
  p as (select p.status, coalesce(p.done_on, p.marked_on) as at
          from v2.progress p, sb
         where p.student_id = p_student and p.round = sb.round
           and p.unit_id in (select id from u))
  select (select count(*)::int from p where status = 'done'
            -- ⚠️ 날짜를 모르는 줄은 **안 센다.** 지어내는 것보다 적게 세는 쪽이 낫다(대전제 0)
            and at is not null and at <= p_on),
         (select count(*)::int from p where status = 'skip' and at is not null and at <= p_on),
         (select count(*)::int from u)
           - (select count(*)::int from p where status = 'skip' and at is not null and at <= p_on),
         (select round from sb)
$$;
grant execute on function v2.book_progress_on(uuid, uuid, date) to authenticated, service_role;
