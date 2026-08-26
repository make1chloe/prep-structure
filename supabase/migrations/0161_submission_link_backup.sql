-- 0161: 제출물 ↔ 검사 줄 연결 스냅샷 (2026-08-26)
--
-- 0159 가 CASCADE 삭제를 set null 로 바꿨다 — 행은 살지만, 판을 저장할
-- 때마다(전량 삭제·재삽입) 제출물의 report_item_id 가 null 로 끊긴다.
-- 그 연결(어느 사진이 어느 검사 줄 것이었나)은 한 번 끊기면 복구할 수
-- 없다. 저장 구조를 고치기 전까지, **지금 남아 있는 연결을 박제**해 둔다.
-- 나중에 재연결 공사가 이 표를 원본으로 쓴다.
--
-- 다시 실행해도 안전: 이미 백업된 행은 건너뛰고 새 연결만 추가.

create table if not exists public.submission_link_backup (
  submission_id    uuid primary key,
  report_item_id   uuid not null,
  homework_item_id uuid,
  student_id       uuid,
  date             date,
  backed_up_at     timestamptz not null default now()
);

insert into public.submission_link_backup
  (submission_id, report_item_id, homework_item_id, student_id, date)
select id, report_item_id, homework_item_id, student_id, date
  from public.homework_submissions
 where report_item_id is not null
on conflict (submission_id) do nothing;

alter table public.submission_link_backup enable row level security;
drop policy if exists staff_all on public.submission_link_backup;
create policy staff_all on public.submission_link_backup
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.submission_link_backup_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.submission_link_backup_on() to authenticated;
