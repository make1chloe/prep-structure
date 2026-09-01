-- ─────────────────────────────────────────────────────────────
-- 0033 · 아이디 규칙을 못 박는다 (원장님 2026-09-02 — 「이미 그렇게 했었어」)
--
-- 실측으로 확인 — 학생 **20/21 이 `chloe`+4자리**, 학부모 **20/20 이 전화번호**.
--   학생   `chloe0515`      chloe + 본인 폰 **뒤 4자리**
--   학부모 `01012345678`    전화번호 그대로
--   원장·강사  진짜 이메일 (아이디 없음)
--
-- ⚠️ 화면에 **`@chloe-eng.internal` 을 보이지 않는다** — 그건 인증이 이메일 자리를
--    요구해서 속으로만 붙이는 것이고, 원장님·아이가 칠 것이 아니다.
-- ⚠️ 학생 `profiles.phone` 이 **21명 전부 비어 있다** — 아이 전화번호를 앱이 안 갖고 있어
--    「폰 뒤 4자리와 맞나」를 셀 수가 없다. 아이디만으로는 못 되돌린다.
-- ─────────────────────────────────────────────────────────────
alter table v2.profiles add constraint profiles_login_id_shape check (
  login_id is null
  or (role = 'student' and login_id ~ '^chloe[0-9]{4}$')
  or (role = 'parent'  and login_id ~ '^01[0-9]{7,8}$')
) not valid;                     -- ⚠️ not valid — 지금 있는 어긋난 1줄을 막지 않는다

/** 아이디를 짓는다 — 한 곳에서만. 화면마다 지으면 규칙이 갈린다 */
create or replace function v2.make_login_id(p_role text, p_phone text)
returns text language sql immutable as $$
  select case p_role
    when 'student' then 'chloe' || right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), 4)
    when 'parent'  then regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    else null end
$$;
comment on function v2.make_login_id is
  '학생 chloe+폰 뒤 4자리 · 학부모 전화번호. ⚠️ **속으로만** ''@chloe-eng.internal'' 을 붙인다';

/** 규칙에 안 맞는 아이디를 세운다 — 조용히 두지 않는다 */
create or replace function v2.login_id_odd()
returns table (id uuid, role text, name text, login_id text, why text)
language sql stable as $$
  select p.id, p.role, p.name, p.login_id,
    case when p.role='student' and p.login_id !~ '^chloe[0-9]{4}$' then '학생인데 chloe+4자리가 아니다'
         when p.role='parent'  and p.login_id !~ '^01[0-9]{7,8}$'  then '학부모인데 전화번호가 아니다'
         when p.role='student' and p.phone is null                 then '⚠️ 아이 전화번호가 없어 아이디를 다시 지을 수 없다'
    end
  from v2.profiles p
  where p.login_id is not null and p.role in ('student','parent')
    and ((p.role='student' and p.login_id !~ '^chloe[0-9]{4}$')
      or (p.role='parent'  and p.login_id !~ '^01[0-9]{7,8}$'))
$$;
grant execute on function v2.make_login_id(text,text), v2.login_id_odd() to authenticated;
