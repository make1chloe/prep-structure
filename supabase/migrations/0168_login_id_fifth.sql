-- 0168 (어46) 학생 아이디 · 겹치면 다섯째 숫자 · 원장님 2026-09-16 「클로이영어 아이디는 chloe+학생폰번호 뒷자리4개(같은 아이디 이미있으면 5번째에 2붙여서)자동생성되게 되어있는데 왜 굳이 내가 또 입력해야하니」
--   profiles_login_id_shape · 학생은 chloe + 숫자 넷 + (다섯째 숫자 하나 · 겹칠 때 2·3 … · lib/student-plan.js nextLoginId) · 옛 앱이 낸 -2·-3 꼴(실 DB chloe8729-2)은 그대로 둔다 · 학부모는 전화 11자리 그대로(0034·0100)
--   0100 처럼 not valid 로 걸고 바로 validate(실 DB 에 어긋난 줄이 있으면 validate 에서 멈춘다 · 0165 가 12개를 validate 한 뒤라 없다) · 몇 번을 돌려도 같다
alter table v2.profiles drop constraint if exists profiles_login_id_shape;
alter table v2.profiles add constraint profiles_login_id_shape check (
  login_id is null
  or (role = 'student' and login_id ~ '^chloe[0-9]{4}([0-9]|-[0-9]{1,2})?$')
  or (role = 'parent'  and login_id ~ '^01[0-9]{8,9}$')
) not valid;
alter table v2.profiles validate constraint profiles_login_id_shape;
comment on constraint profiles_login_id_shape on v2.profiles is
  '(어46) 학생 chloe + 숫자 넷 + 다섯째 숫자 하나(겹칠 때 2·3 … · nextLoginId) · 옛 -2·-3 도 됨 · 학부모 전화 11자리 · 원장님 9/16';
notify pgrst, 'reload schema';
