-- **월간용 키워드 메모** (원장님, 2026-08-21 — 「키워드메모칸 필요해」).
--
-- 「키워드는 하루하루 학부모에게 안 나가고 월간에서만 종합」 이 원래
-- 의도였는데(11-4), 리포트 댓글은 다는 즉시 학부모에게 나가서 그 자리로
-- 쓸 수 없었다. 학부모·학생이 읽는 daily_reports 에 칸을 더하면 새 나가므로
-- **원장만 읽는 별도 표**로 둔다. 월간 AI 브리핑만 이걸 종합한다.

create table if not exists public.report_keywords (
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null,
  body       text,
  created_at timestamptz not null default now(),
  primary key (student_id, date)
);

alter table public.report_keywords enable row level security;
drop policy if exists staff_all on public.report_keywords;
create policy staff_all on public.report_keywords
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.report_keywords_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.report_keywords_on() to authenticated;
