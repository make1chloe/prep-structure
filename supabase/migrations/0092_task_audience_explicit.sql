-- 0092: **대상을 안 적으면 안 보인다.** 「전체」 라고 골라야 전체에 보인다
--
-- 원장님 (2026-08-06)
--   「대상을 안 적으면 안 보여야지. 전체라고 설정해야 전체한테 보이게 해줘」
--
-- 0091 에서 나는 반대로 했다 — 「안 적었으면 모두에게」. 이유는 이미 적어둔
-- 일정이 하루아침에 사라지는 것이 무서워서였다. 그런데 그건 **한 번 겪고 마는
-- 일**이고, 안 적은 것이 새어 나가는 것은 **앞으로 계속 겪는 일**이다.
-- 매번 겪는 쪽을 안전하게 두는 것이 맞다.
--
-- 그리고 이쪽이 원래 맞다. 일정을 적을 때 「누가 보나」 를 생각 안 했다면
-- 그건 **아직 안 정한 것**이지 「모두」 가 아니다. 모를 때 열어주는 쪽이 사고다.
--
-- 새 규칙 — deliver_scope 하나로 정한다.
--
--   all      전체 (재원생·학부모 모두)      ← **골라야 보인다**
--   class    그 반
--   grade    그 학교 · 그 학년
--   student  고른 아이들
--   (비움)   **아무에게도 안 보임** — 선생님만 보는 일정
--
-- 「전체」 를 골랐으면 대상 칸이 비어 있어도 보인다. 그게 전체의 뜻이다.

create or replace function public.task_for_me(
  p_scope text,
  p_students uuid[],
  p_school_id uuid,
  p_school text,
  p_grade text,
  p_class uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- **전체라고 고른 것만** 모두에게 간다
    when coalesce(p_scope, '') = 'all' then true

    -- 대상을 하나도 안 적었으면 아무에게도 안 보인다 (선생님만 보는 일정).
    -- 「아직 안 정한 것」 을 「모두」 로 읽으면 안 된다
    when coalesce(array_length(p_students, 1), 0) = 0
     and p_school_id is null
     and coalesce(p_school, '') = ''
     and coalesce(p_grade, '') = ''
     and p_class is null
    then false

    else
      -- 1) 학생을 콕 집은 것
      exists (
        select 1 from unnest(coalesce(p_students, '{}'::uuid[])) u(id)
         where u.id in (select public.my_student_ids())
      )
      -- 2) 우리 학교 (학년까지 적혀 있으면 학년도 맞아야 한다)
      or exists (
        select 1 from public.students s
         where s.id in (select public.my_student_ids())
           and (
             (p_school_id is not null and s.school_id = p_school_id)
             -- school_id 를 안 붙인 옛 일정은 글자로 맞춘다.
             -- school_key 로 맞추므로 「신송중」과 「신송중학교」가 같은 곳이다
             or (p_school_id is null
                 and coalesce(p_school, '') <> ''
                 and public.school_key(s.school) = public.school_key(p_school))
             -- 학교는 안 적고 **학년만** 적은 것 (「중3 전체」).
             -- 학년이 적혀 있을 때만이다 — 이 조건을 빼먹었다가 학생·반만
             -- 지목한 일정이 전부 새어 나갔다 (0091 · check-parent.sh 가 잡았다)
             or (p_school_id is null and coalesce(p_school, '') = ''
                 and coalesce(p_grade, '') <> '')
           )
           and (coalesce(p_grade, '') = '' or s.grade = p_grade)
      )
      -- 3) 우리 반
      or (p_class is not null and p_class in (select public.my_class_ids()))
    end;
$$;

revoke all on function public.task_for_me(text, uuid[], uuid, text, text, uuid) from public;
grant execute on function public.task_for_me(text, uuid[], uuid, text, text, uuid) to authenticated;

-- **규칙을 먼저 갈아끼우고 나서** 옛 함수를 지운다.
--   순서를 거꾸로 했다가 한 번 크게 당했다. 0091 의 규칙이 아직 옛 함수를
--   붙들고 있는데 함수를 먼저 지우면 「딸린 것이 있다」 며 거절당하고,
--   Supabase 는 한 덩어리로 실행하므로 **그 뒤가 통째로 안 들어간다.**
--   그런데 앞부분은 이미 들어간 것처럼 보여서, 규칙만 옛것으로 남는다.
--   검사(scripts/check-parent.sh)가 「대상 안 적은 일정이 보인다」 로 잡았다.
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
    and public.task_for_me(
      tasks.deliver_scope,
      tasks.deliver_student_ids,
      tasks.deliver_school_id,
      tasks.deliver_school,
      tasks.deliver_grade,
      tasks.deliver_class_id
    )
  );


-- 이제 아무도 안 붙들고 있으니 0091 의 다섯 칸짜리를 지운다.
-- 남겨두면 「어느 쪽이 도는 거지」 가 된다
drop function if exists public.task_for_me(uuid[], uuid, text, text, uuid);


-- ------------------------------------------------------------
-- 이미 들어 있는 것 정리
--
-- 규칙이 뒤집혔으므로 **아무것도 안 하면 지금 있는 일정이 전부 안 보이게 된다.**
-- 뜻이 분명한 것만 여기서 살려두고, 나머지는 원장님이 보시면서 정하신다
-- (할일 화면의 일정마다 「누가 보나」 가 뜬다).
-- ------------------------------------------------------------

-- 1) 나이스 **전국 공통** (수능일 · 모의고사 · 공휴일). 학교가 정하는 것이
--    아니라 모두에게 해당한다 — source_id 가 'common:' 으로 시작한다
update public.tasks
   set deliver_scope = 'all'
 where source = 'neis'
   and source_id like 'common:%'
   and coalesce(deliver_scope, '') = '';

-- 2) 나이스 **학교별** 학사일정. 0091 에서 학교를 붙여뒀으니 뜻을 그대로 적어준다
update public.tasks
   set deliver_scope = 'grade'
 where source = 'neis'
   and deliver_school_id is not null
   and coalesce(deliver_scope, '') = '';

-- 3) 대상을 적어둔 것 (학생·반·학교) 은 scope 만 비어 있으면 채워준다.
--    적어둔 것이 있는데 안 보이면 「적었는데 왜 안 가지」 가 된다
update public.tasks
   set deliver_scope = 'student'
 where coalesce(deliver_scope, '') = ''
   and coalesce(array_length(deliver_student_ids, 1), 0) > 0;

update public.tasks
   set deliver_scope = 'class'
 where coalesce(deliver_scope, '') = ''
   and deliver_class_id is not null;

update public.tasks
   set deliver_scope = 'grade'
 where coalesce(deliver_scope, '') = ''
   and (deliver_school_id is not null
        or coalesce(deliver_school, '') <> ''
        or coalesce(deliver_grade, '') <> '');


-- 표식 — 이 SQL 이 들어갔는지 화면에서 본다 (0090·0091 과 같은 까닭)
create or replace function public.task_audience_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'tasks'
       and policyname = 'task_read_shared'
       and qual like '%deliver_scope%'
  );
$$;

revoke all on function public.task_audience_on() from public;
grant execute on function public.task_audience_on() to authenticated;
