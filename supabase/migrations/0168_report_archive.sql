-- **판 지우기 → 휴지통** (마이그1 본체 v2 §1-1 — #8. 원장 확정 8/27:
-- 숨김·자동 부활·30일 뒤 자동 삭제·발송 이력 보존).
--
-- 지금 「판 지우기」는 그날 기록(검사행·발송 이력까지)을 통째로,
-- 되돌릴 수 없게 지운다. 잘못 만들어진 판을 치우는 정당한 용도가
-- 있으니 지우기를 없애는 게 아니라 **휴지통**으로 바꾼다:
--   숨김 → 화면·집계에서 사라짐 (기록은 남음)
--   그 판에 다시 쓰면 → 자동 부활 (트리거 2개 — 판 쓰기·항목 쓰기)
--   숨긴 지 30일 → 하루 정리 루틴(purge)이 진짜 삭제
--   발송 이력(report_sends)은 판이 죽어도 남는다 (cascade → set null)
--
-- 되돌리기:
--   drop trigger if exists dri_unarchive on public.daily_report_items;
--   drop trigger if exists dr_unarchive on public.daily_reports;
--   drop function if exists public.report_unarchive_items();
--   drop function if exists public.report_unarchive_row();
--   alter table public.report_sends drop constraint report_sends_daily_report_id_fkey;
--   alter table public.report_sends alter column daily_report_id set not null;
--   alter table public.report_sends add constraint report_sends_daily_report_id_fkey
--     foreign key (daily_report_id) references public.daily_reports(id) on delete cascade;
--   alter table public.daily_reports drop column if exists archived_at,
--     drop column if exists archived_reason;

alter table public.daily_reports
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

-- 발송 이력은 판보다 오래 산다 — 30일 삭제가 이력까지 끌고 가면 안 된다
alter table public.report_sends alter column daily_report_id drop not null;
alter table public.report_sends
  drop constraint if exists report_sends_daily_report_id_fkey;
alter table public.report_sends
  add constraint report_sends_daily_report_id_fkey
  foreign key (daily_report_id) references public.daily_reports(id) on delete set null;

-- 부활 ① — 판 자체에 쓰면 (저장·upsert). 숨기는 그 update(archived_at
-- 를 직접 만지는 것)는 건드리지 않는다
create or replace function public.report_unarchive_row()
returns trigger language plpgsql as $$
begin
  if old.archived_at is not null
     and new.archived_at is not distinct from old.archived_at then
    new.archived_at := null;
    new.archived_reason := null;
  end if;
  return new;
end;
$$;
drop trigger if exists dr_unarchive on public.daily_reports;
create trigger dr_unarchive
  before update on public.daily_reports
  for each row execute function public.report_unarchive_row();

-- 부활 ② — 항목(검사·배정)을 쓰면 (check_many·plan_many 경로까지)
create or replace function public.report_unarchive_items()
returns trigger language plpgsql as $$
begin
  update public.daily_reports
     set archived_at = null, archived_reason = null
   where id = new.daily_report_id and archived_at is not null;
  return new;
end;
$$;
drop trigger if exists dri_unarchive on public.daily_report_items;
create trigger dri_unarchive
  after insert or update on public.daily_report_items
  for each row execute function public.report_unarchive_items();

create or replace function public.report_archive_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.report_archive_on() to authenticated;
