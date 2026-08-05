-- 0079: 학부모 계정 · 선생님 권한
--
-- ── 1) 학부모 아이디 ──────────────────────────────────────
-- 학생 계정은 아이디를 `students.login_id` 에 적어뒀다. 학부모는 학생 줄이
-- 없으므로 적을 자리가 없었다 — 만들고 나면 **아이디를 다시 볼 방법이 없다.**
-- 학부모님이 "아이디가 뭐였죠" 하고 물으시면 답할 수가 없다.
alter table public.profiles
  add column if not exists login_id text;

create unique index if not exists profiles_login_id_key
  on public.profiles (login_id) where login_id is not null;

comment on column public.profiles.login_id is
  '학원이 준 아이디. 학생은 students.login_id 와 같고, 학부모는 여기에만 있다';

-- 이미 만들어둔 학생 계정의 아이디를 profiles 에도 채워둔다
update public.profiles p
   set login_id = s.login_id
  from public.students s
 where s.profile_id = p.id
   and p.login_id is null
   and coalesce(s.login_id, '') <> '';


-- ── 2) 선생님 권한 ────────────────────────────────────────
-- 지금은 원장·강사·조교가 **거의 같은 권한**이다. is_staff() 하나로 다 열린다.
-- 수강료도 · 발송 열쇠도 · 학생 계정 만들기도 조교가 할 수 있다.
--
-- 표 단위 RLS 를 한꺼번에 가르는 것은 위험하다 (마흔 개 표를 동시에 건드리게
-- 된다). 그래서 **알아볼 수 있는 함수부터** 만들어 두고, 화면과 서버 동작에서
-- 이것을 쓴다. 표 단위는 그다음이다.
create or replace function public.is_principal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'principal'
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role in ('principal','instructor')
  );
$$;

grant execute on function public.is_principal() to authenticated;
grant execute on function public.is_teacher() to authenticated;

-- 돈은 원장님 것이다. 조교가 볼 이유가 없다.
do $$
begin
  if to_regclass('public.payments') is not null then
    execute 'alter table public.payments enable row level security';
    execute 'drop policy if exists staff_all on public.payments';
    execute 'drop policy if exists principal_all on public.payments';
    execute 'create policy principal_all on public.payments for all to authenticated
             using (public.is_principal()) with check (public.is_principal())';
  end if;
end $$;

-- 발송 열쇠·연동 설정(integrations)은 **이미** 원장님만 볼 수 있다 (0015).
-- 여기서 다시 건드리지 않는다 — 잘 되고 있는 것을 고쳐서 깨뜨릴 이유가 없다.
