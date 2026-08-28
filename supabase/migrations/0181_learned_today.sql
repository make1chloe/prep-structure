-- 0181: 학생이 **오늘 배운 것**을 적는다 (원장님 2026-08-28 —
-- 「등원 학습이 끝나고 하원하기 전에 학생이 **반드시**, 오늘 학습에서
--  배운 것을 적는 칸을 만들어줘」).
--
-- 「반드시」 = **길목**이다 (원장 확정). 안 적으면 하원을 못 누른다.
-- 자리는 등원 절차(0038 arrival_checks · lib/arrivalSteps)의 homework_at
-- 뒤 · leave_at(0150) 앞 — 하원 카드 바로 위다.
--
-- ── 왜 daily_reports 에 칸을 안 더하나 ────────────────────────────
-- 0038 이 등원 체크에서 내린 것과 **똑같은 판정**이다. daily_reports 를
-- 통째로 열어주면 점수·코멘트·발송까지 학생 손이 닿아 0158 형 트리거를
-- 또 세워야 한다. 학생이 **쓰는** 값은 전용 표 — 0038 · 0065 video_views ·
-- 0129 notice_receipts 와 같은 관례다.
--
-- ── 학부모는 못 읽는다 (원장 확정, 뒤집지 말 것) ──────────────────
-- 원장님 원문: 「그 자체는 **원본**이고, 원본을 공개하는 게 아니라 그걸
-- 토대로 AI가 일일리포트를 작성하게 할 거야」
-- → 학부모가 보는 것은 **AI 가 쓴 리포트**이지 이 글이 아니다.
-- → 그래서 0038 에 있는 parent_read 같은 정책을 **일부러 안 만든다.**
--    my_student_ids()(0057) 도 안 쓴다 — 그 함수는 학부모를 함께 담는다.
--
-- ── 세 동사 (0175 가 update 만 잠가 뚫렸던 실사고를 기억한다) ─────
--   select : 학생 본인 + 선생님. 학부모 없음.
--   insert : 학생 본인 것만.
--   update : 학생 본인 것만 (하원 누르기 전에 고쳐 쓸 수 있어야 한다).
--   delete : **아무도** (선생님 빼고) — 원본은 지워지지 않는다.
-- RLS 는 정책이 없는 동사를 거부한다. delete 정책을 일부러 안 만든다.
--
-- 되돌리기:  drop table if exists public.learned_notes;

create table if not exists public.learned_notes (
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, date)
);
create index if not exists learned_notes_date_idx on public.learned_notes (date);

alter table public.learned_notes enable row level security;

drop policy if exists staff_all on public.learned_notes;
create policy staff_all on public.learned_notes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 읽고 쓴다 (0038 own_all 과 같은 모양,
-- 다만 for all 이 아니라 세 동사로 나눠 delete 를 안 연다)
drop policy if exists own_read on public.learned_notes;
create policy own_read on public.learned_notes
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = learned_notes.student_id and s.profile_id = auth.uid())
  );

drop policy if exists own_write on public.learned_notes;
create policy own_write on public.learned_notes
  for insert to authenticated
  with check (
    exists (select 1 from public.students s
            where s.id = learned_notes.student_id and s.profile_id = auth.uid())
  );

drop policy if exists own_edit on public.learned_notes;
create policy own_edit on public.learned_notes
  for update to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = learned_notes.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = learned_notes.student_id and s.profile_id = auth.uid())
  );

-- 고친 시각은 서버가 적는다 (아이 화면이 보낸 값을 믿지 않는다)
create or replace function public.touch_learned_note()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_learned_note on public.learned_notes;
create trigger trg_touch_learned_note
  before insert or update on public.learned_notes
  for each row execute function public.touch_learned_note();

-- 돌아가는지 손가락 하나로 확인하는 탐침. 정책이 실제로 걸려 있는지까지
-- pg_policies 로 본다 — 표만 있고 정책이 없으면 RLS 가 통째로 막아
-- 아이 화면이 조용히 빈다 (0090 · 0166 에서 데었다).
create or replace function public.learned_today_on()
returns boolean language sql stable as $$
  select (
    select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'learned_notes'
  ) = 4;
$$;
grant execute on function public.learned_today_on() to authenticated;

-- ────────────────────────────────────────────────────────────────
-- **원장님 확인용** (0180 · 0181 을 돌린 **뒤에** 이것만 따로 실행)
--
-- 표식이 초록인 것만으로는 모자란다 — 표는 섰는데 정책이 빠져 있으면
-- 화면이 오류 없이 조용히 빈다 (0090 · 0166). 그래서 숫자를 눈으로 본다.
-- **두 번 돌려도 숫자가 그대로여야 한다** (재실행 감지 — 2026-08-28 확인).
--
-- select '표' 무엇, count(*) 숫자, '2 여야 맞아요' 기대
--   from information_schema.tables
--  where table_schema='public' and table_name in ('report_reads','learned_notes')
-- union all
-- select '정책', count(*), '6 여야 맞아요 (열람 2 + 배운것 4)'
--   from pg_policies
--  where schemaname='public' and tablename in ('report_reads','learned_notes')
-- union all
-- select '트리거', count(*), '2 여야 맞아요'
--   from pg_trigger t join pg_class c on c.oid=t.tgrelid
--  where c.relname in ('report_reads','learned_notes') and not t.tgisinternal
-- union all
-- select '함수', count(*), '5 여야 맞아요'
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.proname in
--    ('my_child_ids','report_student','guard_report_read','report_read_on','learned_today_on')
-- union all
-- select '표식(둘 다 켜졌나)',
--        case when public.report_read_on() and public.learned_today_on() then 1 else 0 end,
--        '1 이어야 맞아요'
-- union all
-- select '잠금(RLS 켜짐)', count(*), '2 여야 맞아요'
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname in ('report_reads','learned_notes')
--    and c.relrowsecurity;
