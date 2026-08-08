-- ============================================================
-- 0112. 「이 아이는 이 시험을 안 봤다」
--
-- 원장님 (2026-08-08) — 「시험없음 체크박스도 추가해줘. 없을때가 있어」
--
-- ── 왜 필요한가 ─────────────────────────────────────────
--
-- 「성적 미입력」 은 **그 학교 · 그 학년 아이는 그 시험을 봤을 것**이라는
-- 짐작으로 센다. 대개 맞지만 안 맞는 때가 있다 —
--   · 그날 아파서 못 봤다
--   · 시험 전에 전학 왔다 (그 학교 시험을 안 봤다)
--   · 그 과목을 안 듣는다
--
-- 이런 아이는 성적이 영영 안 들어온다. 그러면 배지가 **영영 안 꺼진다.**
-- 안 꺼지는 배지는 며칠 안에 배경이 되고, 그때부터는 진짜 빠진 성적도
-- 안 보이게 된다. 재촉은 끌 수 있어야 재촉이다.
--
-- ── 성적 줄로 하지 않는 까닭 ─────────────────────────────
--
-- 「0점짜리 성적」 을 넣어 치울 수도 있다. 그러면 안 된다 —
--   · 평균과 추이에 0점이 섞여 아이 성적이 실제보다 나쁘게 보인다
--   · 리포트에도 「0점」 이 적혀 나간다
-- 안 본 것은 **없는 것**이지 0점이 아니다. 그래서 따로 적어둔다.
--
-- 여러 번 돌려도 같다.
-- ============================================================

create table if not exists public.exam_skips (
  student_id uuid not null references public.students(id) on delete cascade,
  exam_id    uuid not null references public.exam_periods(id) on delete cascade,
  note       text,                                   -- 왜 안 봤는지 (병결 · 전학 …)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, exam_id)
);

comment on table public.exam_skips is
  '이 아이는 이 회차를 안 봤다 (0112). 성적 미입력 재촉에서 빠진다 — 0점이 아니라 없는 것이다';

alter table public.exam_skips enable row level security;

-- 선생님만 — 아이의 성적과 같은 성격이라 학생·학부모에게는 안 연다.
-- (아이 화면에는 애초에 「성적 미입력」 이라는 것이 없다)
drop policy if exists exam_skips_staff on public.exam_skips;
create policy exam_skips_staff on public.exam_skips
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant select, insert, update, delete on public.exam_skips to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.exam_skips_on()
returns boolean language sql immutable as $$ select true $$;
