-- **역할(role) 은 원장만 바꾼다** — 자가 승격·원장 강등 차단
-- (역할별화면권한 계획서 v1 P7 · 검토 발견 2·10·14. 2026-08-27)
--
-- 왜 지금인가 — **실측으로 확인된 구멍이다.** 원장이 Supabase 에서 직접
-- 확인한 profiles 의 정책은 딱 둘이었다:
--     staff_all            ALL     using is_staff()  with check is_staff()
--     profiles_self_select SELECT  using id = auth.uid()
-- 행·칸 제한이 없고, 방어 트리거 0, GRANT 제한 0. 즉 **스태프면 누구든**
-- profiles 를 통째로 고칠 수 있다. 조교 계정으로
--     PATCH /rest/v1/profiles?id=eq.<나>      {"role":"principal"}
--     PATCH /rest/v1/profiles?id=eq.<원장>    {"role":"student"}
-- 이 둘이 그대로 통한다. 앞엣것은 조교가 원장 화면을 열고, 뒤엣것은
-- **원장이 자기 학원에서 잠긴다.**
--
-- 지금은 계정이 원장 하나뿐이라 실피해가 0 이다. 그래서 지금 막는다 —
-- 개발자·조교 계정을 발급하고 나서 막으면 이미 늦다. 화면 권한(role_screens ·
-- 미들웨어)은 이 자물쇠가 없으면 통째로 무의미하다: 조교가 자기 역할을
-- 원장으로 올려버리면 어떤 메뉴 필터도 소용이 없기 때문이다.
--
-- **막는 것 / 안 막는 것**
--   막는다  ① 스태프 3종('principal','instructor','assistant')으로 올리는 모든 변경
--           ② **남의** 스태프 역할을 스태프 밖으로 내리는 변경 (= 원장 강등)
--   안 막는다 · 역할이 안 바뀌는 update (이름·login_id·must_change_pw…)
--           · 원장 본인이 하는 모든 역할 변경 (is_principal())
--           · auth.uid() 가 없는 자리 — Supabase SQL Editor · service_role.
--             **일부러 열어 둔 비상구다.** 이걸 닫으면 원장이 실수로 자기
--             역할을 내렸을 때 아무도 되돌릴 수 없다(스태프 계정 만드는
--             UI 가 없어서 손으로 넣어야 한다).
--           · **자기 자신**을 스태프 밖으로 내리는 것 (아래 0043 참고)
--
-- 0043 회귀 — `link_student_by_code` 는
--   update profiles set role='student' where id = auth.uid() and role is distinct from 'principal'
-- 로 **자기 행만** 손댄다. 새 역할이 'student' 라 ① 에 안 걸리고,
-- 자기 행이라 ② 에도 안 걸린다 → 학생 코드 연결은 그대로 된다.
-- (②에 `id <> auth.uid()` 가 붙은 이유가 이것이다. 자기 강등은 위협이
--  아니다 — 스스로 권한을 버리는 것뿐이고, 원장은 SQL Editor 로 되돌린다.)
--
-- 계정 만들기 회귀 — accountActions.js:161,262,325,499 · parentActions.js:196
-- 의 upsert(on conflict id) 는 전부 role 이 'student' 또는 'parent' 다.
-- 스태프 역할을 쓰는 profiles 쓰기 경로는 앱 전체에 **없다**(전수 grep).
-- 그래서 requireTeacher(강사 통과)와 이 트리거(원장 요구)는 부딪치지 않는다.
--
-- DELETE 는 여기서 안 막는다 — profiles.id 는 auth.users(id) on delete
-- cascade 라, 삭제를 막으면 계정 삭제(Admin API)가 통째로 막힌다.
-- 남은 구멍으로 적어 둔다 (계획서 §3-3 등급 3 몫).
--
-- 되돌리기:
--   drop trigger if exists trg_lock_role on public.profiles;
--   drop function if exists public.lock_role();
--   drop function if exists public.role_locked_on();

create or replace function public.lock_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 역할이 안 바뀌면 볼 것 없다 (이름·비번표시 같은 보통의 수정)
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- 사람이 아닌 자리(SQL Editor · service_role)는 통과 — 비상구
  if auth.uid() is null then
    return new;
  end if;

  -- 원장은 다 할 수 있다
  if public.is_principal() then
    return new;
  end if;

  if new.role in ('principal','instructor','assistant') then
    raise exception '역할은 원장만 올릴 수 있어요.'
      using errcode = '42501';
  end if;

  if old.role in ('principal','instructor','assistant')
     and old.id is distinct from auth.uid() then   -- old 로 본다: 고치는 대상은 「지금 그 행」이다
    raise exception '남의 선생님 역할은 원장만 내릴 수 있어요.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_lock_role on public.profiles;
create trigger trg_lock_role
  before update on public.profiles
  for each row execute function public.lock_role();

-- 밖에서 「이 SQL 이 돌았나」 를 물어볼 자국 (lib/sqlChecks.js 0175).
-- 트리거는 표·칸을 안 만들어서 이 표식이 없으면 확인할 방법이 없다.
create or replace function public.role_locked_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.role_locked_on() to authenticated;

-- 확인 (Supabase SQL Editor 에서 붙여넣고 Run — 두 줄 다 나와야 정상):
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and tgname = 'trg_lock_role';
--   select public.role_locked_on();
