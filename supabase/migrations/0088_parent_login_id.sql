-- 0088: **학부모도 아이디로 로그인되게**
--
-- 0079 에서 profiles.login_id 를 만들었는데, 로그인할 때 아이디를 이메일로
-- 바꿔주는 함수(0045)는 **students 표만** 보고 있었다. 학부모는 students 에
-- 줄이 없다. 그래서 학부모 계정을 아무리 만들어도 **로그인이 안 된다.**
--
-- 화면에는 「아이디 또는 비밀번호가 맞지 않아요」 로만 뜬다 — 아이디가 틀린
-- 것도 비번이 틀린 것도 아니고 찾을 데를 안 본 것인데, 그걸 알 방법이 없다.
--
-- 그리고 **전화번호를 아이디로 쓴다** (원장님, 2026-08-05).
-- 어머니는 010-1234-5678 처럼 하이픈을 넣어 치실 수 있다. 그때 「맞지 않아요」
-- 가 뜨면 무엇이 틀렸는지 알 수가 없다. 숫자만 남겨서 한 번 더 찾아본다.

create or replace function public.email_for_login_id(p_login_id text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  with q as (
    select lower(btrim(p_login_id)) as raw,
           regexp_replace(btrim(p_login_id), '\D', '', 'g') as digits
  )
  select u.email from q, public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
   where lower(s.login_id) = q.raw
  union all
  -- 학부모·선생님 — students 에 줄이 없다
  select u.email from q, public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.login_id) = q.raw
  union all
  -- 하이픈을 넣어 치셨을 때 (010-1234-5678 → 01012345678)
  select u.email from q, public.profiles p
    join auth.users u on u.id = p.id
   where q.digits <> '' and p.login_id = q.digits
  limit 1;
$$;

revoke all on function public.email_for_login_id(text) from public;
grant execute on function public.email_for_login_id(text) to anon, authenticated;

-- **이 SQL 이 돌았는지 알 수 있어야 한다.**
--
-- 이건 표도 칸도 안 만들고 **함수의 속만** 고친다. 그래서 「무엇이 있나」 를
-- 찔러보는 검사로는 옛것과 새것을 가릴 수가 없고, 검사에 안 걸리면
-- 설정 화면의 「한 번에 실행」 이 이 파일을 아예 건너뛴다.
-- (0081 에서 똑같은 일을 겪었다 — 확인할 방법이 없는 SQL 은 없는 것과 같다)
--
-- 그래서 **표시 하나**를 같이 둔다. 하는 일은 없고, 있는지 없는지가 곧
-- 이 파일이 돌았는지다.
create or replace function public.login_lookup_v2()
returns boolean language sql immutable as $$ select true $$;

grant execute on function public.login_lookup_v2() to anon, authenticated;
