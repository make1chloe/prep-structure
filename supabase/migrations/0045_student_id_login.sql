-- 0045: 아이디 로그인 · 체크리스트 숙제
--
-- 1) 이메일로 로그인시키면 아이들이 못 들어온다.
--    이메일 주소도 비밀번호도 잊어버린다. 그래서 학원이 아이디를 준다 —
--    chloe0001 같은 것. 비밀번호는 0000 으로 시작하고, 처음 들어오면
--    학생이 바꾼다. 또 잊으면 원장님이 0000 으로 되돌린다.
--
--    Supabase 로그인은 이메일만 받으므로, 아이디에 학원 도메인을 붙여
--    속으로만 이메일을 만든다 (chloe0001 → chloe0001@…). 학생은 그런 게
--    있는지도 모른다.
--
-- 2) 숙제 내는 방법을 사진 · 녹음 · 체크리스트 셋으로 한다.
--    체크리스트는 숙제 항목마다 미리 적어둔다 (한 줄에 하나).

alter table public.students add column if not exists login_id text;
create unique index if not exists students_login_id_key
  on public.students (lower(login_id)) where login_id is not null;
comment on column public.students.login_id is '학생이 치는 아이디 (chloe0001). 속으로는 여기에 도메인을 붙여 이메일로 만든다';

-- 처음 들어왔거나 원장님이 되돌렸으면 비밀번호부터 바꾸게 한다
alter table public.profiles add column if not exists must_change_pw boolean not null default false;

-- 체크리스트 — 숙제 항목마다 한 줄에 하나씩
alter table public.homework_items add column if not exists checklist text;
comment on column public.homework_items.checklist is '체크리스트 문항 (줄바꿈으로 구분). 비면 체크리스트 버튼이 안 나온다';


-- ------------------------------------------------------------
-- 내 비밀번호를 바꿨다고 표시한다.
--   비밀번호 자체는 Supabase 가 바꾸고, 여기서는 깃발만 내린다.
-- ------------------------------------------------------------
create or replace function public.clear_must_change_pw()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_pw = false where id = auth.uid();
$$;

revoke all on function public.clear_must_change_pw() from public;
grant execute on function public.clear_must_change_pw() to authenticated;


-- ------------------------------------------------------------
-- 아이디로 로그인하려면 그 아이디가 어느 이메일인지 알아야 한다.
-- 로그인 화면은 아직 로그인 전이라 표를 못 읽으므로, 함수 하나만 열어둔다.
--
-- 아이디가 있는지 없는지 말고는 아무것도 알려주지 않는다
-- (이름·학교 같은 것은 절대 돌려주지 않는다).
-- ------------------------------------------------------------
create or replace function public.email_for_login_id(p_login_id text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
    from public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
   where lower(s.login_id) = lower(btrim(p_login_id))
   limit 1;
$$;

revoke all on function public.email_for_login_id(text) from public;
grant execute on function public.email_for_login_id(text) to anon, authenticated;
