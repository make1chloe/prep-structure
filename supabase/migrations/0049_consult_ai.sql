-- 0049: 상담일지 · 학부모 코멘트 초안
--
-- 1) 재원생 상담일지를 적을 곳이 없었다. 신규 상담 '일정' 만 있었고,
--    정작 무슨 얘기를 했는지 남길 데가 없었다.
--    말한 것을 그대로 받아쓰고, 요약해서 남긴다.
--
-- 2) 학부모께 나가는 코멘트를 매번 직접 쓰느라 시간이 걸린다.
--    조각을 이어 붙이면 붙여넣은 티가 난다. 그래서 **원장님이 예전에 쓰신
--    문장들을 본보기로 주고** AI 가 그 말투로 초안을 쓴다. 원장님은 고친다.

create table if not exists public.student_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  kind       text not null default 'consult',   -- consult(상담) / observe(관찰) / call(통화)
  title      text,
  raw        text,                              -- 받아쓴 것 그대로
  body       text,                              -- 정리한 것 (AI 초안 → 손으로 고침)
  with_whom  text,                              -- 학부모 / 학생 / 둘 다
  minutes    int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_notes_student_idx on public.student_notes (student_id, date desc);

alter table public.student_notes enable row level security;
drop policy if exists staff_all on public.student_notes;
create policy staff_all on public.student_notes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- 학생·학부모는 못 본다. 상담일지는 선생님 기록이다.


-- ------------------------------------------------------------
-- 본보기 문장 — 원장님이 예전에 쓰신 코멘트를 모아둔다.
-- AI 는 이 말투를 따라 쓴다. 많을수록 원장님 글에 가까워진다.
-- ------------------------------------------------------------
create table if not exists public.comment_samples (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  tag        text,                              -- 어떤 상황에 쓰는 문장인지 (선택)
  created_at timestamptz not null default now()
);

alter table public.comment_samples enable row level security;
drop policy if exists staff_all on public.comment_samples;
create policy staff_all on public.comment_samples
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
