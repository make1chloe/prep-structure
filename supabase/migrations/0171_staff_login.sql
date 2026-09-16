-- 0171 (어64) 직원(선생님·조교) 계정을 앱에서 낸다 · 원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한 - 설정페이지에서 열람페이지 조절가능하게」
--   지금 아이디 규칙(0168 profiles_login_id_shape)이 **학생·학부모 꼴만** 허용해서 직원 아이디를 넣을 수 없었다.
--   직원 아이디는 원장님이 손으로 적는다 — 영문 소문자로 시작하는 4~20자(영문 소문자·숫자·밑줄). chloe 로 시작하는 것은 막는다(학생 아이디와 헷갈린다 · (어46) 과 같은 사고).
--   ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
alter table v2.profiles drop constraint if exists profiles_login_id_shape;
alter table v2.profiles add constraint profiles_login_id_shape check (
  login_id is null
  or (role = 'student' and login_id ~ '^chloe[0-9]{4}([0-9]|-[0-9]{1,2})?$')
  or (role = 'parent'  and login_id ~ '^01[0-9]{8,9}$')
  or (role in ('principal','instructor','assistant') and login_id ~ '^[a-z][a-z0-9_]{3,19}$' and login_id !~ '^chloe')
) not valid;
alter table v2.profiles validate constraint profiles_login_id_shape;

comment on constraint profiles_login_id_shape on v2.profiles is
  '(어46) 학생 chloe + 숫자 넷 + 다섯째 숫자 하나 · 옛 -2·-3 도 됨 · 학부모 전화 11자리 · '
  '(어64) 직원(원장·선생님·조교)은 영문 소문자로 시작하는 4~20자 · chloe 로 시작 못 함(학생 아이디와 헷갈린다)';

notify pgrst, 'reload schema';
