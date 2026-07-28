-- 0043: 학생 계정 연결
--
-- 학생용 화면(/me)은 만들어 뒀는데, **학생 계정을 만들 길이 없었다.**
-- students.profile_id 는 읽기만 했지 어디서도 채우지 않았다.
-- 그래서 원장님이 학생 아이디로 로그인해볼 수가 없다.
--
-- 계정을 원장님이 대신 만들어 주려면 Supabase 관리자 키가 필요한데,
-- 그 키는 앱에 두면 안 된다. 그래서 반대로 간다.
--
--   1. 원장님이 학생마다 **연결 코드**를 뽑는다 (6자리, 하루짜리)
--   2. 학생이 스스로 가입한다 (이메일 · 비밀번호)
--   3. 학생이 코드를 넣으면 그 계정이 그 학생에 붙는다
--
-- 코드는 한 번 쓰면 죽고, 하루가 지나도 죽는다.

create table if not exists public.student_link_codes (
  code       text primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists student_link_codes_student_idx
  on public.student_link_codes (student_id);

alter table public.student_link_codes enable row level security;

-- 선생님만 뽑고 본다
drop policy if exists staff_all on public.student_link_codes;
create policy staff_all on public.student_link_codes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 코드를 읽지 못한다. 코드 확인·연결은 아래 함수가 대신한다
-- (그래야 남의 코드를 뒤져볼 수 없다)


-- ------------------------------------------------------------
-- 코드를 써서 내 계정을 학생에 붙인다.
--
-- security definer 로 도는 함수 하나만 열어둔다. 학생은 이 함수 말고는
-- 코드 표에 손댈 수 없다.
-- ------------------------------------------------------------
create or replace function public.link_student_by_code(p_code text)
returns table (ok boolean, message text, student_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_link_codes%rowtype;
  v_taken uuid;
begin
  if auth.uid() is null then
    return query select false, '로그인이 필요해요.'::text, null::uuid;
    return;
  end if;

  select * into v_row from public.student_link_codes
   where code = upper(btrim(p_code));

  if not found then
    return query select false, '코드가 맞지 않아요.'::text, null::uuid;
    return;
  end if;
  if v_row.used_at is not null then
    return query select false, '이미 사용한 코드예요.'::text, null::uuid;
    return;
  end if;
  if v_row.expires_at < now() then
    return query select false, '코드가 만료됐어요. 선생님께 새로 받아주세요.'::text, null::uuid;
    return;
  end if;

  -- 이 학생에 이미 다른 계정이 붙어 있으면 덮어쓰지 않는다
  select s.profile_id into v_taken from public.students s where s.id = v_row.student_id;
  if v_taken is not null and v_taken <> auth.uid() then
    return query select false, '이 학생에는 이미 다른 계정이 연결돼 있어요.'::text, null::uuid;
    return;
  end if;

  update public.students set profile_id = auth.uid() where id = v_row.student_id;
  update public.profiles set role = 'student' where id = auth.uid() and role is distinct from 'principal';
  update public.student_link_codes
     set used_at = now(), used_by = auth.uid()
   where code = v_row.code;

  return query select true, '연결됐어요.'::text, v_row.student_id;
end $$;

revoke all on function public.link_student_by_code(text) from public;
grant execute on function public.link_student_by_code(text) to authenticated;


-- ------------------------------------------------------------
-- 학생 본인이 자기 students 행을 읽을 수 있어야 /me 가 뜬다.
-- (이미 있을 수 있으므로 다시 만든다)
-- ------------------------------------------------------------
drop policy if exists own_read on public.students;
create policy own_read on public.students
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.parent_student ps
               where ps.student_id = students.id and ps.parent_profile_id = auth.uid())
  );
