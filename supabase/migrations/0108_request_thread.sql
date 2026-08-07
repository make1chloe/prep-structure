-- ============================================================
-- 0108. 전달사항 — 답장을 여러 번, 그리고 보낸 쪽에서 무를 수 있게
--
-- 원장님 (2026-08-07)
--   「학부모/학생 전달사항에 대한 답장을 반복적으로 할 수 있게」
--   「학부모, 학생 화면에서 전달 취소가 가능하게 해줘.
--    제출 후에 나한테는 다 보이게 해줘」
--
-- ── 1) 답장이 한 번뿐이었다 ──────────────────────────────
--
-- `reply` 칸 하나에 덮어썼다. 그래서 「금요일 5시에 오세요」 라고 답한 뒤
-- 「아 그날 시험이네요, 월요일로 하죠」 를 적으면 **앞의 말이 사라진다.**
-- 어머니 화면에서도 마지막 한 줄만 보여서, 무슨 이야기가 오갔는지 아무도
-- 모르게 된다.
--
-- 오간 말을 **줄줄이 쌓는다.** 누가 언제 뭐라고 했는지 그대로 남는다.
--
-- ── 2) 잘못 보낸 것을 무를 수가 없었다 ────────────────────
--
-- 날짜를 잘못 골라 보내신 결석 알림이 그대로 남아, 원장님이 그걸 받아
-- 결석 예정을 깔게 된다. 어머니는 다시 문자를 보내시고, 그러면 두 군데에
-- 말이 남는다.
--
-- 보낸 쪽에서 무를 수 있게 한다. **지우지는 않는다** — 취소한 것도
-- 원장님께는 보인다 (「이 얘기가 왜 사라졌지」 가 없어야 한다).
--
-- ── 3) 처리한 것도 원장님께는 보인다 ─────────────────────
--
-- 지금까지 대시보드에는 `status='new'` 만 떴다. 「확인」 을 누르는 순간
-- 사라져서, 무슨 말을 했는지 다시 볼 수가 없었다. 화면 쪽에서 고친다.
-- ============================================================

alter table public.requests
  -- 오간 말 — [{ at, who, role, text }] 를 시간순으로
  add column if not exists thread     jsonb not null default '[]'::jsonb,
  -- 보낸 쪽에서 무른 때 (지우지 않는다)
  add column if not exists canceled_at timestamptz,
  -- 누가 보냈나 — 답장 문구를 학생용·학부모용으로 가르는 데 쓴다
  add column if not exists author_role text;

/**
 * **보낸 사람이 무른다.**
 *
 * requests 표는 학생·학부모에게 **읽기와 넣기만** 열려 있다 (0019).
 * 고치기를 통째로 열면 status 나 reply 도 고칠 수 있게 되어, 어머니가
 * 「확인함」 으로 바꿔놓을 수 있다. 그래서 이 문 하나만 낸다 —
 * **취소한 때 한 칸**만 적는다.
 *
 * 이미 선생님이 처리한 것은 못 무른다. 결석 예정이 이미 깔렸는데 요청만
 * 사라지면, 왜 깔렸는지 아무도 모르는 결석이 남는다.
 */
create or replace function public.cancel_request(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare r public.requests%rowtype;
begin
  select * into r from public.requests where id = p_id;
  if r.id is null then return 'not_found'; end if;

  -- 내 아이 것인가
  if not exists (select 1 from public.students s
                  where s.id = r.student_id and s.profile_id = auth.uid())
     and not exists (select 1 from public.parent_student ps
                      where ps.student_id = r.student_id and ps.parent_profile_id = auth.uid())
     and not public.is_staff()
  then
    return 'not_mine';
  end if;

  if r.handled_at is not null and not public.is_staff() then
    return 'handled';
  end if;

  update public.requests
     set canceled_at = now(), status = 'canceled'
   where id = p_id;
  return 'ok';
end;
$$;

comment on function public.cancel_request(uuid) is
  '보낸 사람이 전달사항을 무른다 (0108). 표는 잠가두고 이 문으로만';

revoke all on function public.cancel_request(uuid) from public, anon;
grant execute on function public.cancel_request(uuid) to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.request_thread_on()
returns boolean language sql immutable as $$ select true $$;
