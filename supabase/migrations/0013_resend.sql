-- 0013: 재발송 (숙제 문자 · 데일리리포트 다시 보내기)
--   homework_text     : 고친 숙제 문자. 비어 있으면 자동 생성 문구를 쓴다.
--   homework_sent_at  : 숙제 문자를 마지막으로 보낸 시각
--   report_sends      : 보낸 이력. 몇 번 보냈는지, 그때 뭘 보냈는지 남는다.
alter table public.daily_reports add column if not exists homework_text text;
alter table public.daily_reports add column if not exists homework_sent_at timestamptz;

create table if not exists public.report_sends (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  kind            text not null default 'report',   -- report | homework
  body            text not null,
  sent_at         timestamptz not null default now(),
  sent_by         uuid references public.profiles(id) on delete set null
);
create index if not exists report_sends_report_idx
  on public.report_sends (daily_report_id, kind);

alter table public.report_sends enable row level security;
drop policy if exists staff_all on public.report_sends;
create policy staff_all on public.report_sends
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
