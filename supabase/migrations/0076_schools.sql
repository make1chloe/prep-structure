-- 학교를 **한 곳**에 모은다. 그리고 출제 선생님은 여러 명일 수 있다.
--
-- 무엇이 문제였나
--   학교 이름이 **글자로** 세 군데에 흩어져 있었다.
--     students.school · exam_periods.school · neis_schools.name
--   「신송중」과 「신송중학교」가 다른 학교가 된다. 그러면
--     · 재원생의 학교와 시험 일정의 학교가 안 이어지고
--     · 같은 학교 시험이 둘로 갈리고
--     · 등급컷을 두 번 적게 된다
--   교재 이름이 갈리던 것과 **똑같은 문제**다.
--
-- 어떻게 고치나
--   1) neis_schools 를 schools 로 넓힌다. 나이스에 없는 학교도 들어갈 수 있게
--      코드 칸을 비울 수 있게 한다 (전학 온 학생의 옛 학교 같은 것).
--   2) 이름을 다듬은 **열쇠**로 같은 학교를 알아본다 (lib/schoolName 과 같은 규칙).
--   3) students · exam_periods 가 school_id 로 학교를 가리킨다.
--   4) school 글자 칸은 **지우지 않는다.** 대신 방아쇠로 school_id 를 따라
--      저절로 채워진다 — 화면 예순 몇 군데가 이 칸을 읽고 있고, 그것을 한꺼번에
--      고치는 것은 지금 할 일이 아니다. 진실은 school_id 하나다.

-- ── 1) 이름 열쇠 (lib/schoolName.js 의 schoolKey 와 같아야 한다) ──
create or replace function public.school_key(name text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(trim(name), '')),
        '여자중학교', '여중'), '여자고등학교', '여고'),
        '남자중학교', '남중'), '남자고등학교', '남고'),
        '초등학교', '초'), '중학교', '중'), '고등학교', '고'),
      '[[:space:]·・.,''"()\[\]{}/\\_-]', '', 'g'
    ), '');
$$;
comment on function public.school_key(text) is
  '학교 이름 비교용 열쇠. 신송중학교 = 신송중. lib/schoolName.js 와 같은 규칙이어야 한다.';

-- ── 2) neis_schools → schools ────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='neis_schools')
     and not exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='schools') then
    alter table public.neis_schools rename to schools;
  end if;
end $$;

create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 나이스에 없는 학교도 들어갈 수 있어야 한다
alter table public.schools alter column atpt_code drop not null;
alter table public.schools alter column schul_code drop not null;
alter table public.schools add column if not exists kind    text;
alter table public.schools add column if not exists aliases text[] not null default '{}';

-- 코드가 둘 다 있을 때만 겹치지 않게 (없는 것끼리는 겹쳐도 된다)
alter table public.schools drop constraint if exists neis_schools_atpt_code_schul_code_key;
create unique index if not exists schools_code_uniq
  on public.schools (atpt_code, schul_code)
  where atpt_code is not null and schul_code is not null;

-- 같은 이름의 학교가 둘이 되지 않게 — **이게 이 마이그레이션의 핵심**이다
create unique index if not exists schools_key_uniq
  on public.schools (public.school_key(name));

alter table public.schools enable row level security;
drop policy if exists staff_all on public.schools;
create policy staff_all on public.schools
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- 학생·학부모도 자기 학교 이름은 봐야 한다 (시험 일정에 붙어 나온다)
drop policy if exists school_read on public.schools;
create policy school_read on public.schools for select to authenticated using (true);

-- ── 3) 지금 쓰이는 학교 이름을 전부 넣는다 ────────────────
--    같은 열쇠는 한 줄로 뭉친다. 이름은 **가장 긴 것**을 남긴다
--    (「신송중」보다 「신송중학교」가 학부모께 보내는 문자에 낫다)
insert into public.schools (name)
select distinct on (public.school_key(n)) n
  from (
    select school as n from public.students     where coalesce(trim(school), '') <> ''
    union all
    select school as n from public.exam_periods where coalesce(trim(school), '') <> ''
  ) t
 where public.school_key(n) is not null
   and not exists (select 1 from public.schools s where public.school_key(s.name) = public.school_key(t.n))
 order by public.school_key(n), length(n) desc
on conflict do nothing;

-- ── 4) 학교를 가리키게 한다 ──────────────────────────────
alter table public.students     add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.exam_periods add column if not exists school_id uuid references public.schools(id) on delete set null;
create index if not exists students_school_idx     on public.students (school_id);
create index if not exists exam_periods_school_idx2 on public.exam_periods (school_id);

update public.students t set school_id = s.id
  from public.schools s
 where t.school_id is null
   and public.school_key(t.school) = public.school_key(s.name);

update public.exam_periods e set school_id = s.id
  from public.schools s
 where e.school_id is null
   and public.school_key(e.school) = public.school_key(s.name);

-- ── 5) 글자 칸은 school_id 를 따라간다 ───────────────────
--    진실은 school_id 하나다. school 은 화면이 읽는 **베낀 값**일 뿐이라
--    사람이 고칠 일이 없다. 학교 이름을 고치면 학생·시험이 저절로 따라온다.
create or replace function public.sync_school_name()
returns trigger language plpgsql as $$
begin
  if new.school_id is not null then
    select name into new.school from public.schools where id = new.school_id;
  end if;
  return new;
end $$;

drop trigger if exists students_school_name on public.students;
create trigger students_school_name before insert or update of school_id on public.students
  for each row execute function public.sync_school_name();

drop trigger if exists exams_school_name on public.exam_periods;
create trigger exams_school_name before insert or update of school_id on public.exam_periods
  for each row execute function public.sync_school_name();

-- 학교 이름을 고치면 그 학교를 가리키는 것들도 따라 바뀐다
create or replace function public.rename_school_cascade()
returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name then
    update public.students     set school = new.name where school_id = new.id;
    update public.exam_periods set school = new.name where school_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists schools_rename on public.schools;
create trigger schools_rename after update of name on public.schools
  for each row execute function public.rename_school_cascade();

-- ── 6) 출제 선생님은 **여러 명**일 수 있다 ────────────────
--    학년별로 나눠 내거나 공동 출제인 경우가 흔하다.
alter table public.exam_periods add column if not exists teachers text[];

update public.exam_periods
   set teachers = array[teacher]
 where teachers is null and coalesce(trim(teacher), '') <> '';

comment on column public.exam_periods.teachers is
  '출제 선생님 — 여러 명일 수 있다. teacher(단수) 는 옛 칸이라 쓰지 않는다.';
