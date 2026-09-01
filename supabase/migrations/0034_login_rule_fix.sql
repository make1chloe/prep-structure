-- 0034 · 아이디 규칙의 정규식을 고친다
-- ⚠️ 0033 에서 전화번호를 `^01[0-9]{7,8}$` 라 적었다. **11자리면 01 뒤가 9자리**다.
--    검사가 학부모 20명 전부를 「안 맞음」으로 세웠다 — **검사 자신이 틀린 자리**다.
alter table v2.profiles drop constraint if exists profiles_login_id_shape;
alter table v2.profiles add constraint profiles_login_id_shape check (
  login_id is null
  or (role = 'student' and login_id ~ '^chloe[0-9]{4}$')
  or (role = 'parent'  and login_id ~ '^01[0-9]{8,9}$')     -- 010-1234-5678 = 11자리
) not valid;
create or replace function v2.login_id_odd()
returns table (id uuid, role text, name text, login_id text, why text)
language sql stable as $$
  select p.id, p.role, p.name, p.login_id,
    case when p.role='student' then '학생인데 chloe+4자리가 아니다'
         else '학부모인데 전화번호(11자리)가 아니다' end
  from v2.profiles p
  where p.login_id is not null and p.role in ('student','parent')
    and ((p.role='student' and p.login_id !~ '^chloe[0-9]{4}$')
      or (p.role='parent'  and p.login_id !~ '^01[0-9]{8,9}$'))
$$;
grant execute on function v2.login_id_odd() to authenticated;
