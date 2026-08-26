-- 0160: 0158 가드가 관리 도구까지 막지 않게 (2026-08-26)
--
-- 0158 의 트리거는 「is_staff() 가 아니면 student_done_at 만」인데,
-- is_staff() 는 auth.uid() 기반이라 **로그인 세션이 없는 실행**(서비스 키
-- 관리 작업·SQL 화면의 데이터 수리)까지 학생 취급으로 막아버린다.
-- 세션이 없는 실행은 RLS 를 애초에 우회하는 관리 경로다 — 트리거로
-- 다시 막을 대상이 아니다. 학생(세션 있음 + staff 아님)만 제한한다.

create or replace function public.guard_student_item_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    if (to_jsonb(new) - 'student_done_at') is distinct from (to_jsonb(old) - 'student_done_at') then
      raise exception '학생은 완료 표시만 바꿀 수 있어요';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_allow_admin_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.guard_allow_admin_on() to authenticated;
