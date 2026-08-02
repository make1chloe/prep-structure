-- 0071: 형제자매를 묶는다
--
-- 형제가 둘 다 다니면 학부모는 **계정 하나로 둘 다** 봐야 한다. 지금은 아이마다
-- 따로 연결해야 하고, 연결을 하나 빠뜨리면 그 아이 것만 안 보인다.
-- 그런데 학부모는 안 보이는 게 있다는 것 자체를 모른다.
--
-- 학부모 계정으로 묶으면 될 것 같지만 안 된다 — 등록할 때는 아직 학부모 계정이
-- 없다. 그래서 **학생끼리** 묶는다.
--
--   같은 family_id = 형제자매
--
-- 이렇게 해두면
--   · 학부모를 한 아이에게 연결할 때 **형제도 같이** 연결할 수 있다
--   · 수강료를 형제 합산으로 볼 수 있다
--   · 상담할 때 "형이 뭐 하고 있더라" 를 한 화면에서 본다

alter table public.students
  add column if not exists family_id uuid;

create index if not exists students_family_idx on public.students (family_id);

comment on column public.students.family_id is
  '형제자매 묶음. 같은 값이면 한 집이다. 혼자면 비어 있어도 된다';


-- ------------------------------------------------------------
-- 학부모가 내 아이 **전부**를 보게
--
-- my_student_ids() 는 지금 "내가 연결된 아이" 만 준다. 형제를 묶어두었어도
-- 연결이 하나뿐이면 하나만 본다.
--
-- **형제라고 저절로 열어주지는 않는다.** 이혼·재혼처럼 한쪽 부모만 보아야 하는
-- 경우가 있다. 연결은 아이마다 그대로 하되, 연결하는 자리에서 형제를 같이
-- 고를 수 있게 해준다 (앱에서).
-- 여기서는 **형제를 찾는 함수**만 둔다.
-- ------------------------------------------------------------
create or replace function public.siblings_of(sid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s2.id
    from public.students s1
    join public.students s2 on s2.family_id = s1.family_id
   where s1.id = sid
     and s1.family_id is not null
     and s2.id <> s1.id;
$$;

revoke all on function public.siblings_of(uuid) from public;
grant execute on function public.siblings_of(uuid) to authenticated;
