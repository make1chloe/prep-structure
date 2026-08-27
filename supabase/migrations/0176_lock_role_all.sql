-- **0175 보강 — 자물쇠가 UPDATE 만 잠갔다** (적대 검토 2026-08-27)
--
-- 0175 는 두 군데가 뚫려 있었다. 둘 다 「막았다고 선언한 바로 그 피해」가
-- 그대로 난다.
--
-- ① **표식이 거짓말을 한다.** `role_locked_on()` 이 `select true` 상수였다.
--    트리거를 안 만들었어도, 누가 지웠어도, `alter table … disable trigger`
--    로 꺼놨어도 이 함수는 참을 돌려준다. 설정 → SQL 화면과 메뉴 배지가
--    이걸 「0175 들어감」 으로 읽으니, **자물쇠가 없는데 초록**이 된다.
--    확인할 수 없는 자물쇠는 없는 자물쇠다. → 아래에서 pg_trigger 를
--    **실제로 조회**하게 바꾼다 (0096 holidays_visible 선례).
--
-- ② **INSERT · DELETE 가 열려 있었다.** 트리거가 `before update` 뿐이라,
--    UPDATE 만 피하면 그만이다. 실행 가능한 길이 둘이다 —
--      · 조교가 원장의 profiles 행을 **DELETE** → 원장이 자기 학원에서
--        잠긴다 (0175 가 막겠다고 적어 둔 바로 그 피해).
--      · 아는 계정의 profiles 행을 지우고 `insert (id, role='principal')`
--        로 **다시 심는다** → UPDATE 가 아니니 트리거를 안 탄다.
--        `staff_all` 의 with_check(is_staff()) 는 「고치는 사람이 스태프냐」
--        만 보고 「무슨 역할을 심느냐」 는 안 본다.
--    → 트리거를 `before insert or update or delete` 로 넓힌다.
--
-- **막는 것 (원장이 아닌 스태프 기준)**
--   INSERT  새 role 이 스태프 3종이면 차단 (행 갈아끼우기)
--   UPDATE  ① 스태프 3종으로 올리기 ② 남의 스태프 역할 내리기 (0175 그대로)
--   DELETE  스태프 3종인 행 지우기 (자기 행 포함 — 지울 이유가 없다)
--
-- **안 막는 것 (그대로 열어 둔다)**
--   · `auth.uid()` 가 없는 자리 — Supabase SQL Editor · service_role.
--     **비상구다.** 원장이 잠겼을 때 되돌릴 유일한 길이고, 계정 삭제
--     (Admin API → auth.users 삭제 → profiles 로 cascade)가 지나는 길도
--     여기다. 이걸 닫으면 계정을 못 지운다.
--   · 원장 본인 (is_principal())
--   · 역할이 안 바뀌는 UPDATE — 이름·login_id·must_change_pw
--   · 학생·학부모 행을 만들고 지우는 것 (accountActions·parentActions 가
--     쓰는 길. role 이 student·parent 라 안 걸린다)
--   · 자기 역할을 **스스로 내리는** UPDATE — 0043 link_student_by_code 가
--     이 예외로 산다 (자기 행·새 role 'student')
--   · `on_auth_user_created` → `handle_new_user()` 의 INSERT — role 을 안
--     주므로 기본값 'student' 다. 스태프 3종이 아니라 통과한다.
--
-- 0175 파일은 그대로 둔다 (원장이 이미 실행했다). 이 파일이 함수 둘을
-- `create or replace` 로 덮고 트리거를 다시 만든다. 여러 번 돌려도 안전.
--
-- 되돌리기 (0175 상태로):
--   drop trigger if exists trg_lock_role on public.profiles;
--   create trigger trg_lock_role before update on public.profiles
--     for each row execute function public.lock_role();
--   + 0175 파일의 lock_role() · role_locked_on() 본문을 다시 실행
-- 통째로 풀려면:
--   drop trigger if exists trg_lock_role on public.profiles;
--   drop function if exists public.lock_role();
--   drop function if exists public.role_locked_on();

create or replace function public.lock_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  -- 그냥 보내주는 자리 두 곳 —
  --   · 사람이 아닌 자리(SQL Editor · service_role · 계정 삭제 cascade): 비상구
  --   · 원장 본인
  -- 지우는 트리거는 old 를, 나머지는 new 를 돌려줘야 한다.
  if v_me is null or public.is_principal() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    if old.role in ('principal','instructor','assistant') then
      raise exception '선생님 계정은 원장만 지울 수 있어요.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- 지우고 다시 심는 길을 막는다 (UPDATE 를 피해 가는 우회로)
    if new.role in ('principal','instructor','assistant') then
      raise exception '선생님 역할은 원장만 줄 수 있어요.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- 여기부터 UPDATE (0175 와 같다)
  if new.role is not distinct from old.role then
    return new;
  end if;

  if new.role in ('principal','instructor','assistant') then
    raise exception '역할은 원장만 올릴 수 있어요.'
      using errcode = '42501';
  end if;

  if old.role in ('principal','instructor','assistant')
     and old.id is distinct from v_me then   -- 자기 강등은 위협이 아니다 (0043)
    raise exception '남의 선생님 역할은 원장만 내릴 수 있어요.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists trg_lock_role on public.profiles;
create trigger trg_lock_role
  before insert or update or delete on public.profiles
  for each row execute function public.lock_role();

-- ── 표식 — **진짜로 걸려 있나를 물어본다** ─────────────────────
-- 상수 true 를 돌려주던 것이 ① 의 사고였다. pg_trigger 를 직접 본다:
--   있나 · 꺼져 있지 않나(tgenabled <> 'D') · 세 갈래를 다 잡나
-- tgtype 비트 4=insert · 8=delete · 16=update → 28 이 다 서 있어야 한다.
-- (0175 만 돌린 DB 는 update 뿐이라 여기서 **거짓**이 나온다 — 그래야 한다.
--  「0176 을 돌려야 한다」 를 화면이 말해주는 것이 이 줄의 일이다.)
create or replace function public.role_locked_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname = 'trg_lock_role'
       and tgenabled <> 'D'
       and (tgtype & 28) = 28
  );
$$;

revoke all on function public.role_locked_on() from public;
grant execute on function public.role_locked_on() to authenticated;

-- 확인 (Supabase SQL Editor 에 붙여넣고 Run — 셋 다 참이어야 정상):
--   select public.role_locked_on();                  -- t
--   select tgname, tgenabled, tgtype from pg_trigger  -- trg_lock_role · O · 31
--    where tgrelid = 'public.profiles'::regclass and tgname = 'trg_lock_role';
--   select count(*) = 1 from pg_trigger               -- t (자물쇠는 한 개뿐)
--    where tgrelid = 'public.profiles'::regclass and tgname = 'trg_lock_role';
