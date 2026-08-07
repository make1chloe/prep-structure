-- ============================================================
-- 0107. 보강 일정을 어머니가 확정하시게
--
-- 원장님 (2026-08-07) — 「보강 일정이 안내되었을 때 학부모가 확정 버튼까지
-- 누르게 만들어. 어려운 경우 일정 변경 요청을 클릭하게 해. 둘 중 하나라도
-- 누르지 않으면 계속 어플 사용할 때마다 첫 화면에서 경고메세지를 줘」
--
-- ── 왜 필요한가 ─────────────────────────────────────────
--
-- 지금은 보강 날짜를 잡아 알림을 보내면 그것으로 끝이다. 그런데 그날
-- 안 오시면 **누구 잘못인지 알 수가 없다** — 못 보신 것인지, 보시고도
-- 안 된다고 생각만 하신 것인지, 우리가 잘못 적은 것인지.
--
-- 그 하루는 아이 자리를 비워두고 선생님 시간을 뺀 것이라, 그냥 넘어가면
-- 다음에 또 같은 일이 생긴다.
--
-- 그래서 **둘 중 하나를 반드시 누르시게** 한다.
--   확정        그날 갑니다
--   변경 요청   그날은 어렵습니다 (언제가 되는지 적어주신다)
--
-- 안 누르시면 앱을 열 때마다 첫 화면에 걸린다. 성가시게 하는 것이 맞다 —
-- 지나가면 아무도 모르는 일이기 때문이다.
--
-- ── 어디에 남기나 ───────────────────────────────────────
--
-- 보강은 attendance 한 줄이다 (status='makeup'). 따로 표를 만들면 그 줄과
-- 어긋날 수 있으므로 **같은 줄에** 칸을 붙인다.
-- ============================================================

alter table public.attendance
  add column if not exists makeup_confirmed_at timestamptz,   -- 어머니가 확정하신 때
  add column if not exists makeup_change_req   text,          -- 「그날은 어렵습니다」 + 사정
  add column if not exists makeup_req_at       timestamptz;

/**
 * **어머니가 자기 아이 보강 줄의 이 세 칸만 고칠 수 있게.**
 *
 * attendance 전체를 열 수는 없다 — 출결을 학부모가 고치면 회차와 수강료가
 * 흔들린다. 그래서 표는 그대로 잠가두고 이 문 하나만 낸다.
 *
 * 여기서 고칠 수 있는 것은 **확정 여부와 요청 글**뿐이다. 날짜·상태·사유는
 * 못 건드린다.
 */
create or replace function public.confirm_makeup(
  p_student uuid,
  p_date date,
  p_ok boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- **내 아이인가** — 학부모이거나 학생 본인이거나 선생님일 때만
  if not exists (
        select 1 from public.parent_student ps
         where ps.student_id = p_student and ps.parent_profile_id = auth.uid())
     and not exists (
        select 1 from public.students s
         where s.id = p_student and s.profile_id = auth.uid())
     and not public.is_staff()
  then
    return;
  end if;

  if p_ok then
    update public.attendance
       set makeup_confirmed_at = now(),
           makeup_change_req = null,
           makeup_req_at = null
     where student_id = p_student and date = p_date and status = 'makeup';
  else
    update public.attendance
       set makeup_confirmed_at = null,
           makeup_change_req = coalesce(nullif(btrim(p_note), ''), '일정 변경 요청'),
           makeup_req_at = now()
     where student_id = p_student and date = p_date and status = 'makeup';
  end if;
end;
$$;

comment on function public.confirm_makeup(uuid, date, boolean, text) is
  '보강 일정 확정 / 변경 요청 (0107). attendance 는 잠가두고 이 문으로만 적는다';

revoke all on function public.confirm_makeup(uuid, date, boolean, text) from public, anon;
grant execute on function public.confirm_makeup(uuid, date, boolean, text) to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.makeup_confirm_on()
returns boolean language sql immutable as $$ select true $$;
