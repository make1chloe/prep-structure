-- 리허설 계정 — 역할마다 하나. 진짜 사람은 한 명도 없다(대전제 12). 비밀번호는 전부 e2e-pass.
insert into auth.users (id, email, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', 'zz_principal@e2e.test',  'e2e-pass'),
  ('22222222-2222-2222-2222-222222222222', 'zz_instructor@e2e.test', 'e2e-pass'),
  ('33333333-3333-3333-3333-333333333333', 'chloe0000@chloe-eng.internal',    'e2e-pass'),
  ('44444444-4444-4444-4444-444444444444', '01000000000@chloe-eng.internal',     'e2e-pass'),
  ('55555555-5555-5555-5555-555555555555', 'zz_assistant@e2e.test',  'e2e-pass')
on conflict (id) do nothing;
insert into v2.profiles (id, role, name, import_batch) values
  ('11111111-1111-1111-1111-111111111111', 'principal',  'zz_시험_원장', 'rehearsal'),
  ('22222222-2222-2222-2222-222222222222', 'instructor', 'zz_시험_강사', 'rehearsal'),
  ('33333333-3333-3333-3333-333333333333', 'student',    'zz_시험_학생', 'rehearsal'),
  ('44444444-4444-4444-4444-444444444444', 'parent',     'zz_시험_학부모', 'rehearsal')
on conflict (id) do nothing;
-- 조교는 나중 마이그레이션이 role 에 더했다 — 없으면 조용히 건너뛴다
do $$ begin
  insert into v2.profiles (id, role, name, import_batch) values ('55555555-5555-5555-5555-555555555555', 'assistant', 'zz_시험_조교', 'rehearsal') on conflict (id) do nothing;
exception when check_violation then raise notice 'assistant 없음 — 건너뜀'; end $$;

-- 리허설 학생·학부모도 처음 비밀번호 문을 지난다(0100 의 표시 줄은 마이그레이션 때 이미 섰으니 여기서 켠다)
update v2.profiles set must_change_pw = true where role in ('student','parent') and name like 'zz_시험_%';
