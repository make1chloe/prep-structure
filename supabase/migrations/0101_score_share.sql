-- 0101: 성적을 **누구에게 보여줄지** 아이마다 정한다
--
-- 원장님 (2026-08-06) — 다른 학원 화면을 보여주시며
--   「성장 공개 대상 — 비공개 / 학생만 / 학부모만 / 둘다」
--   「다른 학원 거라 그대로 따를 필요 없이 장점만 취해」
--
-- ── 왜 필요한가 ──────────────────────────────────────────
--
-- 성적은 **보여주는 것이 늘 좋은 자료가 아니다.**
--
--   · 점수가 무너진 달에 어머니가 먼저 보시면, 원장님이 설명하실 기회가
--     없이 전화가 온다. 같은 숫자라도 **누가 먼저 말하느냐**로 상담이 달라진다
--   · 반대로 아이에게는 보여줘야 하는데 어머니께는 아직인 경우가 있다
--     (본인 의지로 올라오는 중인 아이)
--   · 형제가 있으면 성적 이야기가 집에서 견주는 이야기가 되기도 한다
--
-- 그래서 아이마다 넷 중 하나를 고른다. **기본은 「둘 다」** — 지금까지
-- 학생·학부모 모두 성적을 보고 있었으므로, SQL 을 실행하는 순간 누군가의
-- 화면에서 자료가 사라지면 안 된다.
--
-- ── 화면에서 감추는 것과 자료를 막는 것은 다르다 ─────────
--
-- 블록만 감추면 **막힌 것이 아니다.** 그래서 읽기 규칙(RLS)에서 막는다.
--
-- 다만 **아이가 스스로 낸 것(source='form')은 늘 자기에게 보인다.**
-- 안 그러면 방금 적어 낸 오답이 화면에서 사라져서, 아이는 저장이 안 된 줄
-- 알고 또 적는다. 자기가 적은 것을 자기가 못 보는 것은 규칙이 아니라 고장이다.

alter table public.students
  add column if not exists score_share text not null default 'both';

comment on column public.students.score_share is
  '성적·리포트를 누구에게 보여줄까 — none(비공개) | student(학생만) | parent(학부모만) | both(둘 다). 기본 both';

-- 잘못된 값이 들어가면 조용히 아무에게도 안 보이게 된다 → 아예 막는다
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_score_share_chk'
  ) then
    alter table public.students
      add constraint students_score_share_chk
      check (score_share in ('none', 'student', 'parent', 'both'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 읽기 규칙 — 학생 본인인지 학부모인지를 **갈라서** 본다
--
--   my_student_ids() 는 둘을 구분하지 않는다 (0079 에서 어머니가 아이 것을
--   읽으라고 만든 함수다). 여기서는 구분해야 하므로 직접 본다.
-- ------------------------------------------------------------
create or replace function public.score_visible(p_student uuid, p_source text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
     where s.id = p_student
       and (
         -- 학생 본인
         (s.profile_id = auth.uid()
          and (coalesce(s.score_share, 'both') in ('student', 'both')
               -- **자기가 적어 낸 것은 늘 보인다.** 안 보이면 저장이 안 된 줄
               -- 알고 또 적는다 — 규칙이 아니라 고장이다
               or coalesce(p_source, '') = 'form'))
         -- 학부모
         or (exists (
               select 1 from public.parent_student ps
                where ps.student_id = s.id
                  and ps.parent_profile_id = auth.uid())
             and coalesce(s.score_share, 'both') in ('parent', 'both'))
       )
  )
$$;

comment on function public.score_visible(uuid, text) is
  '이 성적을 지금 보는 사람에게 보여줘도 되나 (0101). 선생님은 이 함수를 안 탄다';

drop policy if exists score_own on public.scores;
create policy score_own on public.scores
  for select to authenticated
  using (public.score_visible(scores.student_id, scores.source));

-- 문항별 오답도 같은 규칙. 성적은 감췄는데 오답은 보이면 감춘 것이 아니다
drop policy if exists mine_read on public.score_items;
create policy mine_read on public.score_items
  for select to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and public.score_visible(s.student_id, s.source)
    )
  );

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.score_share_on()
returns boolean language sql immutable as $$ select true $$;
