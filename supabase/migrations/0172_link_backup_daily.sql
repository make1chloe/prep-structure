-- 0172: 연결 백업 상시화 (2026-08-27)
--
-- 0161 은 한 번 뜨는 스냅샷이었다 — 그 뒤에 낸 사진의 연결은 백업에 없다.
-- 매일 도는 정리 파도(purgeOncePerDay)가 이 함수를 같이 불러, 지금 살아
-- 있는 연결(report_item_id 가 있는 것)을 백업에 반영한다.
--
-- 살아 있는 연결이 null 인 행은 손대지 않는다 — 끊긴 연결을 기억하는 것이
-- 이 표의 존재 이유라, 끊김이 백업까지 번지면 안 된다. 연결이 새 줄로
-- 옮겨 붙은 것만 따라간다(백업 = 마지막으로 확인된 살아 있는 연결).

create or replace function public.backup_submission_links()
returns integer
language sql
set search_path = public
as $$
  with up as (
    insert into public.submission_link_backup
      (submission_id, report_item_id, homework_item_id, student_id, date)
    select id, report_item_id, homework_item_id, student_id, date
      from public.homework_submissions
     where report_item_id is not null
    on conflict (submission_id) do update set
      report_item_id   = excluded.report_item_id,
      homework_item_id = excluded.homework_item_id,
      student_id       = excluded.student_id,
      date             = excluded.date,
      backed_up_at     = now()
    where submission_link_backup.report_item_id   is distinct from excluded.report_item_id
       or submission_link_backup.homework_item_id is distinct from excluded.homework_item_id
    returning 1
  )
  select coalesce(count(*), 0)::integer from up;
$$;

-- 로그인 쿠키 권한 그대로 돈다(security definer 아님) — 표의 staff_all
-- RLS 가 그대로 지키므로, 학생 계정이 불러도 백업은 못 만진다.
grant execute on function public.backup_submission_links() to authenticated;

create or replace function public.link_backup_daily_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.link_backup_daily_on() to authenticated;
