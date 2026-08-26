-- **지난 리포트 조회 창 — 전체 300줄에서 학생별 40판으로** (마이그1 v2
-- §1-4 — #28. 원장 확정 8/27).
--
-- 판·/check 의 지난 배정 사슬이 「전학생 공용 limit(300)」·「고정 21일
-- 창」 을 썼다 — 인원이 늘면(60명×주5회 ≈ 1주치) 검사 목록이 오류 없이
-- 조용히 비고, 두 화면의 창이 달라 판정이 갈렸다. 학생별 최근 40판
-- (≈2~3개월)이면 장기 결석생 사슬도 안 끊긴다 — assignedUnitsFor 가
-- 이미 쓰는 그 축(lib/dayCheck:156)과 동수.
--
-- 되돌리기: drop function public.prev_reports_of(date, int);
--          drop function public.prev_window_on();

create or replace function public.prev_reports_of(d date, per_n int default 40)
returns table (
  id uuid, student_id uuid, date date,
  own_progress text, word_total int, sent_total int
)
language sql stable as $$
  select id, student_id, date, own_progress, word_total, sent_total
    from (
      select r.id, r.student_id, r.date, r.own_progress,
             r.word_total, r.sent_total,
             row_number() over (partition by r.student_id order by r.date desc) as rn
        from public.daily_reports r
       where r.date < d
         and r.archived_at is null            -- 휴지통 판 제외 (0168)
    ) t
   where rn <= per_n
$$;
grant execute on function public.prev_reports_of(date, int) to authenticated;

create or replace function public.prev_window_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.prev_window_on() to authenticated;
