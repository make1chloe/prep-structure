-- 0098: 틀린 문제를 **한 표로** 합치고, 아이가 직접 적게 한다
--
-- 원장님 (2026-08-06)
--   「학생용 화면에서 자기 시험 결과를 입력하게 해줘 — 문법, 내신, 모의고사 전부」
--
-- ── 1) 같은 것이 두 표에 있었다 ──────────────────────────
--
--   score_wrongs (0072)  선생님이 손으로 적던 자리. question 이 「12번」 이라는
--                        **글자**이고 topic·reason 도 자유 입력이다
--   score_items  (0097)  방금 만든 자리. no 가 **숫자**라 영역별 정답률이 계산된다
--
-- 둘 다 「무엇을 틀렸나」 다. 두 군데에 두면 반드시 어긋난다 — 선생님이
-- score_wrongs 에 적은 오답은 리포트에 안 잡히고, 아이가 적은 것은 성적
-- 화면에 안 뜬다. 같은 화면을 보면서 서로 「왜 없지」 를 하게 된다.
-- (0074 에서 시험 회차를 합칠 때와 같은 이야기다.)
--
-- score_items 로 합친다. 숫자로 세는 쪽만이 리포트를 만들 수 있다.
--
-- **다만 번호를 모르는 오답이 있다.** 「서술형 2」 처럼 적어두신 것,
-- 번호 없이 「관계대명사」 만 적어두신 것. 버리면 안 되므로 `no` 를 비울 수
-- 있게 하고, 번호가 없는 것은 목록에는 보이되 **영역별 셈에서는 빠진다.**
-- 없는 번호를 지어내면 45문항이 46문항이 된다.
--
-- ── 2) 학부모는 대신 못 적는다 ───────────────────────────
--
-- 0097 의 쓰기 규칙이 `my_student_ids()` 였는데, 그것은 **학부모도 통과한다**
-- (0079 에서 어머니가 아이 것을 읽으라고 만든 함수다). 성적(scores)은 이미
-- 「학생 본인만 낸다」 로 막혀 있었는데(0072) 문항만 뚫려 있었다.
--
-- 어머니가 대신 적어주시면 **기록이 거짓이 된다** — 「해석을 못했어요」 를
-- 고른 것이 아이가 아니게 되고, 그 위에 세운 분석이 전부 어긋난다.
-- 같은 규칙으로 맞춘다.
--
-- ── 3) 아이가 자기가 적은 것을 고칠 수 있어야 한다 ────────
--
-- 넣기만 되고 고치기가 안 되면, 잘못 적은 아이는 두 줄을 만든다.
-- **자기가 낸 것(source='form')만** 고친다 — 선생님이 매긴 성적은 못 건드린다.

-- ------------------------------------------------------------
-- 1) 번호를 모르는 오답도 담을 수 있게
-- ------------------------------------------------------------
alter table public.score_items alter column no drop not null;

-- unique (score_id, no) 는 no 가 null 이면 여러 줄을 허용한다 (Postgres 기본).
-- 그대로 두면 「번호 없는 오답」 을 여러 개 적을 수 있어서 오히려 맞다.

alter table public.score_items add column if not exists label text;
comment on column public.score_items.label is
  '번호로 못 적는 것 — 「서술형 2」 · 「듣기 마지막」. no 가 비었을 때 화면에 이것을 보여준다';

-- ------------------------------------------------------------
-- 2) score_wrongs 를 옮긴다
--
--    「12번」 → 12,  「서술형 2」 → no 는 비우고 label 에 그대로.
--    같은 번호가 두 번 적혀 있으면 앞엣것만 (unique 에 걸린다).
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.score_wrongs') is not null then
    insert into public.score_items (score_id, no, wrong, reason, label, note)
    select distinct on (w.score_id, nullif(substring(w.question from '^\s*(\d+)'), '')::int)
           w.score_id,
           nullif(substring(w.question from '^\s*(\d+)'), '')::int,
           true,
           w.reason,
           -- 번호로 안 읽히는 것만 label 에 남긴다 (「12번」 은 no 로 충분하다)
           case when w.question ~ '^\s*\d+' then null else nullif(trim(w.question), '') end,
           -- topic 은 문항표가 갖는 자리다. 손으로 적어두신 것은 메모로 남긴다
           nullif(concat_ws(' · ', nullif(trim(w.topic), ''), nullif(trim(w.note), '')), '')
      from public.score_wrongs w
     where not exists (
       select 1 from public.score_items i
        where i.score_id = w.score_id
          and i.no is not distinct from nullif(substring(w.question from '^\s*(\d+)'), '')::int
     )
     order by w.score_id,
              nullif(substring(w.question from '^\s*(\d+)'), '')::int,
              w.sort;

    drop table public.score_wrongs;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) 누가 쓰나 — **학생 본인만.** 학부모는 읽기만
-- ------------------------------------------------------------
-- SETUP_ALL 은 여러 번 실행된다 — 새 이름도 먼저 지운다
drop policy if exists mine_write  on public.score_items;
drop policy if exists mine_update on public.score_items;
drop policy if exists own_insert  on public.score_items;
drop policy if exists own_update  on public.score_items;
drop policy if exists own_delete  on public.score_items;

create policy own_insert on public.score_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

create policy own_update on public.score_items
  for update to authenticated
  using (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

-- 잘못 적은 것을 지울 수 있어야 한다 — 못 지우면 틀린 오답이 영영 남는다
create policy own_delete on public.score_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.scores s
        join public.students st on st.id = s.student_id
       where s.id = score_items.score_id
         and st.profile_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4) 아이가 **자기가 낸 성적만** 고친다
--
--    선생님이 매긴 성적(source 가 form 이 아닌 것)은 못 건드린다.
--    아이가 자기 점수를 고칠 수 있으면 그 기록은 더 이상 성적이 아니다.
-- ------------------------------------------------------------
drop policy if exists score_own_update on public.scores;
create policy score_own_update on public.scores
  for update to authenticated
  using (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  )
  with check (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  );

-- 잘못 낸 것을 물릴 수 있게 (자기가 낸 것만)
drop policy if exists score_own_delete on public.scores;
create policy score_own_delete on public.scores
  for delete to authenticated
  using (
    scores.source = 'form'
    and exists (select 1 from public.students s
                 where s.id = scores.student_id and s.profile_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 5) 화면이 이 파일이 돌았는지 알 수 있게
-- ------------------------------------------------------------
create or replace function public.score_items_merged()
returns boolean language sql immutable as $$ select true $$;
