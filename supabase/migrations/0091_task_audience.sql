-- 0091: 일정은 **자기 것만** 보인다
--
-- 원장님 (2026-08-06)
--   「일정은 해당 학교 학생이거나 일정에 학생이 연결된 경우에
--    학생·학부모에게 노출시켜」
--
-- 지금까지는 **일정이면 전부 보였다** (0066: 할일이 아니고 나만 보기가 아니면
-- 끝). 그래서 신송중 학사일정이 다른 학교 아이 달력에도 떴고, 한 아이만
-- 해당하는 보강 일정이 온 학원에 보였다. 달력이 남의 일로 가득 차면
-- **자기 것도 안 보게 된다.**
--
-- 규칙은 하나다 — **대상을 적었으면 그 대상에게만, 안 적었으면 모두에게.**
--
--   deliver_student_ids 에 내 아이가 있다      → 보인다
--   deliver_school_id(또는 옛 글자)가 내 학교   → 보인다
--   deliver_class_id 가 내 반                   → 보인다
--   deliver_grade 가 적혀 있으면 학년까지 맞아야 한다
--   넷 다 비어 있다                             → 모두에게 (학원 휴강 · 전국 공통)
--
-- **안 적은 것을 「아무도 아님」 으로 보면 안 된다.** 그렇게 하면 지금까지
-- 적어둔 일정이 하루아침에 전부 사라진다. 안 적은 것은 「모두」 다.

-- ------------------------------------------------------------
-- 내 아이(들)의 학교 · 반 — RLS 안에서 students 를 직접 읽으면 서로 물고
-- 늘어지므로 security definer 로 한 겹 감싼다 (0057 과 같은 이유).
-- ------------------------------------------------------------
create or replace function public.task_for_me(
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
    -- 대상을 하나도 안 적었으면 모두에게 (학원 전체 휴강 · [전국] 수능일 …)
    when coalesce(array_length(p_students, 1), 0) = 0
     and p_school_id is null
     and coalesce(p_school, '') = ''
     and coalesce(p_grade, '') = ''
     and p_class is null
    then true

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
             -- 지목한 일정이 전부 새어 나갔다 (학교가 안 적혀 있다는 이유로
             -- 이 줄이 참이 되어버린다). 검사가 잡았다: scripts/check-parent.sh
             or (p_school_id is null and coalesce(p_school, '') = ''
                 and coalesce(p_grade, '') <> '')
           )
           and (coalesce(p_grade, '') = '' or s.grade = p_grade)
      )
      -- 3) 우리 반
      or (p_class is not null and p_class in (select public.my_class_ids()))
    end;
$$;

revoke all on function public.task_for_me(uuid[], uuid, text, text, uuid) from public;
grant execute on function public.task_for_me(uuid[], uuid, text, text, uuid) to authenticated;


-- 학생·학부모는 **일정만, 잠그지 않은 것만, 자기 것만** 읽는다
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
    and public.task_for_me(
      tasks.deliver_student_ids,
      tasks.deliver_school_id,
      tasks.deliver_school,
      tasks.deliver_grade,
      tasks.deliver_class_id
    )
  );


-- ------------------------------------------------------------
-- 이미 받아둔 나이스 학사일정에 **학교를 붙인다.**
--
-- 나이스 일정은 학교마다 받아오는데 학교를 어디에도 안 적어뒀다 — 제목에만
-- 「신송중 개교기념일」 처럼 들어 있었다. 글자는 규칙이 아니라서 그것으로는
-- 가릴 수 없다. source_id 가 `<학교코드>:<날짜>:<이름>` 이라 여기서 뽑아 붙인다.
--
-- 전국 공통 줄은 source_id 가 `common:` 으로 시작한다 — 안 걸리므로 그대로
-- 모두에게 남는다 (수능일은 학교가 정하는 것이 아니다).
-- ------------------------------------------------------------
update public.tasks t
   set deliver_school_id = s.id
  from public.schools s
 where t.source = 'neis'
   and t.deliver_school_id is null
   and coalesce(s.schul_code, '') <> ''
   and t.source_id like s.schul_code || ':%';


-- ------------------------------------------------------------
-- 들어갔는지 화면에서 확인할 표식 (0090 과 같은 까닭).
--
-- 이 SQL 도 표·칸을 안 만들고 읽기 규칙만 고친다. 「지금 DB 상태」 는 표와
-- 칸을 보므로 이대로면 목록에 안 뜨고, 안 뜨면 안 돌리시게 된다.
--
-- task_for_me() 자체를 확인에 쓸 수는 없다 — 값을 다섯 개 받는 함수라
-- 그냥 부르면 「그런 함수 없음」 이 되어, 들어가 있어도 「없음」 으로 뜬다.
-- 그래서 **아무것도 안 받는** 표식 함수를 따로 둔다.
-- ------------------------------------------------------------
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
       and qual like '%task_for_me%'
  );
$$;

revoke all on function public.task_audience_on() from public;
grant execute on function public.task_audience_on() to authenticated;
