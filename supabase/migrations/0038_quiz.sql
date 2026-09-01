-- ─────────────────────────────────────────────────────────────
-- 0038 · 시험 — 단어 · 문장 (원장님 2026-09-02)
--
--   「내신 대비 때 단어시험 보는 경우도 있고, **문장시험**도 있다.
--    **숙제 낼 때 다음 시간 테스트 범위를 주고**, 그다음에 **리포트에 출력**」
--
-- ⚠️ 지금까지 `word_test` 는 **교재에만** 붙어 있었다 — 내신 범위로는 낼 수가 없었다.
--    그리고 **문장시험이 아예 없었다.**
--
-- 흐름 — **낸 날**과 **본 날**이 다르다:
--   오늘 숙제 배정 → 「다음 시간 시험 범위」를 같이 정한다 (assigned_*)
--                 → 리포트·아이 화면에 그대로 나간다
--   다음 수업     → 그 범위로 시험 (taken_*)
--                 → 못 넘으면 재시험 (retry_of)
-- ─────────────────────────────────────────────────────────────
drop trigger if exists word_test_stop on v2.word_test;
drop table if exists v2.word_test cascade;

create table v2.quiz (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  kind text not null check (kind in ('word','sentence')),      -- 단어 · 문장

  -- ① 낸 날 — 숙제와 같이 나간다
  assigned_sheet_id uuid references v2.day_sheet(id) on delete set null,
  assigned_on date,

  -- ② 범위 — **셋 중 하나**에서 온다
  source text not null check (source in ('book','prep','manual')),
  book_id  uuid references v2.books(id) on delete restrict,     -- 교재에서
  unit_from uuid references v2.units(id) on delete restrict,
  unit_to   uuid references v2.units(id) on delete restrict,
  scope_id uuid references v2.prep_scope(id) on delete set null, -- ⭐ 내신 범위에서
  free_note text,                                                -- 손으로

  -- ③ 어떻게 보나
  total smallint, cut_pct smallint not null default 90,
  way text,                                    -- 객뜻·주뜻·객영·주영 · 구두 · 받아쓰기

  -- ④ 본 날
  taken_sheet_id uuid references v2.day_sheet(id) on delete set null,
  taken_on date, correct smallint,
  retry_of uuid references v2.quiz(id) on delete set null,

  state text not null default 'planned'
        check (state in ('planned','taken','passed','failed','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 범위가 어디서 오는지와 칸이 맞아야 한다
  constraint quiz_source_ok check (
    (source='book'   and book_id  is not null) or
    (source='prep'   and scope_id is not null) or
    (source='manual' and free_note is not null))
);
comment on table v2.quiz is
  '한 줄 = 「이 아이가 볼 시험 하나」. **낸 날과 본 날이 다르다** —
   숙제 낼 때 범위를 정해 리포트로 내보내고, 다음 시간에 본다';
comment on column v2.quiz.scope_id is
  '⭐ 내신 범위로도 시험을 낸다(원장님 9/2). 지금까지는 교재에만 붙어 있어 불가능했다';

-- 통과 판정은 **한 곳에서만** (계획 `wordPass`)
create or replace function v2.quiz_passed(p_quiz uuid) returns boolean
language sql stable as $$
  select case when q.total is null or q.total = 0 or q.correct is null then null
              else q.correct::numeric / q.total * 100 >= q.cut_pct end
  from v2.quiz q where q.id = p_quiz
$$;

/** ⚠️ 멈춤이 시험도 멈춘다 — 교재에서 낸 시험만 해당 (내신 범위는 별개다) */
create or replace function v2.quiz_guard() returns trigger
language plpgsql as $$
declare d date;
begin
  if new.source <> 'book' or new.book_id is null then return new; end if;
  d := coalesce(new.assigned_on,
        (select s.date from v2.day_sheet s where s.id = new.assigned_sheet_id), v2.today());
  if not v2.word_test_on(new.student_id, new.book_id, d) then
    raise exception '멈춘 교재로는 시험을 낼 수 없습니다 (교재멈춤)';
  end if;
  return new;
end $$;
create trigger quiz_stop before insert or update on v2.quiz
  for each row execute function v2.quiz_guard();
create trigger quiz_touch before update on v2.quiz for each row execute function v2.touch_row();
create trigger quiz_audit after insert or update or delete on v2.quiz
  for each row execute function v2.audit_row();

alter table v2.quiz enable row level security;
alter table v2.quiz force row level security;
create policy staff_all on v2.quiz for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());
-- ⭐ 아이·부모는 **낸 것은 바로** 본다 (다음 시간 준비해야 하니까),
--    **결과는 마감해야** 본다
create policy own_quiz on v2.quiz for select to authenticated
  using (student_id in (select v2.my_students())
     and (state = 'planned' or v2.sheet_visible(taken_sheet_id)));

grant select on v2.quiz to authenticated;
grant execute on function v2.quiz_passed(uuid) to authenticated;
create index on v2.quiz (student_id, state, assigned_on);
