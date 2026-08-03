-- 시험을 **한 줄**로 합친다.
--
-- 무엇이 문제였나
--   같은 시험이 두 군데에 따로 살고 있었다.
--     exam_periods  학사일정에서 (나이스로 받아옴) — 기간 · 영어시험일 · 등급컷
--     prep_exams    내신 자료에서 (손으로 적음)    — 회차명 · 범위 · 자료
--   신송중 1학기 기말이 두 줄이고 서로를 모른다. 그래서
--     · 시험 날짜가 바뀌면 두 군데를 고쳐야 하고
--     · 등급컷은 이쪽에만, 시험범위는 저쪽에만 있고
--     · 대시보드의 「시험범위 미등록」이 prep_exams 만 보니, 학사일정에서 만든
--       시험은 아예 안 잡혔다
--
-- 어떻게 합치나
--   exam_periods 를 남긴다. 나이스에서 받아오는 쪽이고, 결석 예정·전날 등원·
--   달력이 이미 여기에 걸려 있다. prep_exams 는 여기로 옮기고 없앤다.
--
--   시험 하나를 열면 **범위 · 자료 · 등급컷 · 우리 애들 성적 · 출제 선생님**이
--   한자리에 있게 된다.
--
-- 두 번 돌려도 같아야 한다 (SETUP_ALL 은 여러 번 실행된다).

-- ── 1) 시험이 들고 있어야 할 것 ──────────────────────────
alter table public.exam_periods add column if not exists teacher text;
alter table public.exam_periods add column if not exists source  text;

comment on column public.exam_periods.teacher is '출제 선생님 — 누가 내는지에 따라 대비가 달라진다';
comment on column public.exam_periods.note    is '시험 관련 특이사항 (범위 밖 출제, 서술형 비중 …)';
comment on column public.exam_periods.source  is 'neis(받아옴) | manual(손으로 적음)';

-- ── 2) prep_exams 를 옮긴다 ─────────────────────────────
do $$
declare
  has_prep boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'prep_exams'
  ) into has_prep;
  if not has_prep then return; end if;   -- 이미 옮겼다

  -- 어디로 갈지 미리 정해둔다.
  --   같은 학교 · 같은 학년이고 영어시험일이 시험 기간 안에 들면 **같은 시험**이다.
  --   짝이 없으면 새 회차를 만든다 (기간은 하루짜리로 둔다 — 아는 것이 그것뿐이다).
  create temp table _exam_map on commit drop as
  select
    p.id                                      as prep_id,
    (
      select e.id from public.exam_periods e
      where e.school = p.school
        and coalesce(e.grade, '') = coalesce(p.grade, '')
        and (
          p.exam_date is null
          or (p.exam_date between e.from_date and e.to_date)
          or e.english_on = p.exam_date
        )
      order by e.from_date
      limit 1
    )                                         as exam_id,
    p.school, p.grade, p.term, p.exam_date, p.note
  from public.prep_exams p;

  -- 짝이 없는 것은 새로 만든다
  with made as (
    insert into public.exam_periods (school, grade, name, from_date, to_date, english_on, note, source)
    select m.school, m.grade, m.term,
           coalesce(m.exam_date, current_date),
           coalesce(m.exam_date, current_date),
           m.exam_date, m.note, 'manual'
    from _exam_map m
    where m.exam_id is null
    returning id, school, coalesce(grade,'') as g, name, english_on
  )
  update _exam_map m
     set exam_id = made.id
    from made
   where m.exam_id is null
     and made.school = m.school
     and made.g = coalesce(m.grade, '')
     and made.name is not distinct from m.term
     and made.english_on is not distinct from m.exam_date;

  -- 짝을 찾은 쪽에는 내신 자료 쪽에서만 알던 것을 채워준다.
  -- **덮어쓰지 않는다** — 학사일정에 이미 적힌 것이 더 최근일 수 있다.
  update public.exam_periods e
     set name       = coalesce(e.name, m.term),
         english_on = coalesce(e.english_on, m.exam_date),
         note       = coalesce(e.note, m.note)
    from _exam_map m
   where e.id = m.exam_id;

  -- 범위를 새 시험으로 옮긴다. 단원·자료·배정은 범위에 매달려 있어서 같이 따라온다.
  alter table public.prep_scopes drop constraint if exists prep_scopes_exam_id_fkey;
  update public.prep_scopes s
     set exam_id = m.exam_id
    from _exam_map m
   where s.exam_id = m.prep_id;

  -- 어디로도 못 간 범위가 있으면 여기서 멈춘다 (지우고 나면 되돌릴 수 없다)
  if exists (
    select 1 from public.prep_scopes s
    where not exists (select 1 from public.exam_periods e where e.id = s.exam_id)
  ) then
    raise exception '옮기지 못한 시험범위가 있습니다. prep_exams 를 지우지 않았습니다.';
  end if;

  alter table public.prep_scopes
    add constraint prep_scopes_exam_id_fkey
    foreign key (exam_id) references public.exam_periods(id) on delete cascade;

  drop table public.prep_exams;
end $$;

-- ── 3) 나이스로 받아온 것 표시 ──────────────────────────
-- 손으로 적은 것을 다시 받아올 때 덮어쓰지 않기 위해서다
update public.exam_periods set source = 'neis' where source is null;

create index if not exists exam_periods_school_idx on public.exam_periods (school, grade);
