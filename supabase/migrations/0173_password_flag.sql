-- 0173 (어71) 비밀번호를 바꿔도 다음 화면으로 못 가던 것 · 원장님 2026-09-17 「여기서 화면이 안넘어감」
--   길은 이렇다 — 비밀번호를 바꾼다 → v2.password_changed() 가 그 사람 줄의 must_change_pw 를 내린다 → 다음 화면으로 간다.
--   가운데 함수가 없거나 PostgREST 가 옛 모양을 기억하고 있으면 **표시가 안 내려가고**, 다음 화면의 문지기가 다시 비밀번호 화면으로 되돌린다.
--   화면은 그대로라 「안 넘어간다」로 보였다(대전제-0 — 앱 쪽은 이제 까닭을 말한다).
--   여기서는 그 셋을 다시 못 박는다: 함수 · 실행 권한 · 최소 글자 수 규칙 줄. 표 모양은 안 바꾼다. 몇 번을 돌려도 같다.

-- ① 표시를 내리는 함수 — 0100 과 같은 것. 없으면 생기고, 있으면 그대로다
create or replace function v2.password_changed() returns void
  language sql security definer set search_path = v2, public as $$
  update v2.profiles set must_change_pw = false where id = auth.uid()
$$;
comment on function v2.password_changed() is '비밀번호를 바꿨다 — 본인 줄의 must_change_pw 만 내린다((어71) 0173 이 다시 못 박음)';
grant execute on function v2.password_changed() to authenticated;

-- ② 최소 글자 수 규칙 줄 — 없으면 앱이 「규칙 줄이 없다」로 멈춘다(lib/rule.js 는 조용히 기본값으로 안 돈다)
insert into v2.rule (key, value, note) values
  ('password.min_len', '6', '비밀번호 최소 글자 수 — 처음 비밀번호는 못 쓴다')
on conflict (key) do nothing;

-- ③ 규칙 줄은 로그인한 사람이면 읽는다 — 못 읽으면 ② 가 있어도 앱이 멈춘다
drop policy if exists rule_read on v2.rule;
create policy rule_read on v2.rule for select to authenticated using (true);

notify pgrst, 'reload schema';

-- ④ **여기가 진짜 까닭이었다** — 0127 의 문지기가 선생님·조교의 비밀번호 바꾸기를 막고 있었다.
--    v2.profiles_guard 는 「원장만 학원 사람 계정을 고친다」라, 선생님·조교가 제 비밀번호를 바꾼 뒤
--    ①이 제 줄의 must_change_pw 를 내리는 것까지 튕겼다(아이·학부모 줄은 안 막혀서 그쪽은 잘 됐다 —
--    그래서 (어64) 로 낸 선생님 계정에서만 「화면이 안 넘어감」이 났다).
--    문을 넓히지는 않는다: **제 줄**이고 · **그 칸 하나만** 바뀌고 · **내려가는 쪽**일 때만 지나간다.
--    역할을 바꾸거나 다른 칸을 손대면 그대로 막힌다.
create or replace function v2.profiles_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;                                            -- 서버 자신
  if tg_op = 'UPDATE' and new.id = auth.uid()                                               -- (어71) 제 줄의 「처음 비밀번호」 표시 내리기 하나
     and old.must_change_pw and not new.must_change_pw
     and (to_jsonb(new) - 'must_change_pw') = (to_jsonb(old) - 'must_change_pw') then return new; end if;
  select role into me from v2.profiles where id = auth.uid();
  if me = 'principal' then return new; end if;
  if tg_op = 'INSERT' and new.role not in ('student', 'parent') then raise exception '원장만 학원 사람 계정을 만듭니다'; end if;
  if tg_op = 'UPDATE' and (old.role not in ('student', 'parent') or new.role <> old.role) then raise exception '원장만 학원 사람 계정을 고칩니다'; end if;
  return new;
end $$;
comment on function v2.profiles_guard() is '강사·조교는 학생·학부모 계정만 만들고 고친다 — 역할을 못 바꾸고 학원 사람 줄에 못 닿는다. 원장·서버 자신은 지나간다. (어71) 제 줄의 「처음 비밀번호」 표시를 내리는 것 하나만 예외(그 칸만 · 내려가는 쪽만)';

notify pgrst, 'reload schema';
