-- ============================================================
-- 0104. 학생이 부르면 선생님 폰에 알림이 뜨게
--
-- 원장님 (2026-08-06) — 「학생이 도움을 요청해도 알림이 안 와」
--
-- ── 왜 안 왔나 ──────────────────────────────────────────
--
-- 코드는 멀쩡했다. 학생이 「도와주세요」 를 누르면 `pushToStaff` 를 부른다.
-- 그런데 그 함수가 **학생의 자격으로** DB 를 읽는다 (서버에서 도는 코드라도
-- 로그인한 사람의 권한으로 읽는다). 그래서 —
--
--   · `integrations` 의 알림 열쇠 → **원장님만** 읽을 수 있다 (0015)
--   · 선생님들의 `push_subscriptions` → 본인 것이나 선생님만 (0016)
--
-- 둘 다 학생에게는 **빈 값**으로 온다. 오류가 아니다 — 그냥 없는 것처럼 온다.
-- 그러면 `pushToStaff` 는 「알림을 안 쓰시는구나」 하고 **조용히 넘어간다.**
--
-- 이 앱에서 여러 번 겪은 바로 그 모양이다. 읽기 규칙은 막을 때 오류를 내지
-- 않고 **아무것도 없는 것처럼** 굴어서, 화면도 로그도 멀쩡해 보인다.
--
-- ── 어떻게 고치나 ────────────────────────────────────────
--
-- 보내야 할 곳을 **표 주인 자격으로** 찾아주는 함수를 하나 둔다
-- (`security definer` — 부른 사람이 아니라 표 주인의 권한으로 돈다).
--
-- **아무나 부르면 안 된다.** 우리 학원 사람인지 확인한다 —
-- 학생 본인이거나, 학부모이거나, 선생님일 때만 답한다.
--
-- 다만 이 함수는 알림 열쇠(개인키)를 돌려준다. 학생 계정을 가진 사람이
-- 이 함수를 직접 불러 **선생님 폰에 가짜 알림을 보낼 수는 있다.**
-- 자료가 새는 것은 아니고(구독 주소는 그 자체로 쓸모가 없다), 학원 안 사람만
-- 부를 수 있다. 더 단단히 하려면 보내는 일을 아예 우리 서버 바깥으로
-- 빼야 하는데(웹훅), 그건 설정이 늘어난다. 지금은 이쪽을 고른다.
-- ============================================================

create or replace function public.staff_push_targets()
returns table (
  endpoint text,
  p256dh text,
  auth text,
  public_key text,
  private_key text,
  contact text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  -- **우리 학원 사람인가** — 학생 본인 · 학부모 · 선생님만
  if not exists (select 1 from public.students s where s.profile_id = auth.uid())
     and not exists (select 1 from public.parent_student ps where ps.parent_profile_id = auth.uid())
     and not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
     )
  then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;                                  -- 알림을 아직 안 켜신 상태
  end if;

  return query
    select ps.endpoint, ps.p256dh, ps.auth,
           cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact'
      from public.push_subscriptions ps
      join public.profiles p on p.id = ps.profile_id
     where p.role in ('principal', 'instructor', 'assistant');
end;
$$;

comment on function public.staff_push_targets() is
  '학생·학부모가 선생님께 알림을 보낼 때 쓸 대상 (0104). 읽기 규칙을 넘어야 해서 security definer';

revoke all on function public.staff_push_targets() from public, anon;
grant execute on function public.staff_push_targets() to authenticated;

-- ------------------------------------------------------------
-- **같은 병이 하나 더 있었다** — 선생님이 보내실 때도.
--
-- 알림 열쇠는 **원장님만** 읽는다 (0015). 그러니 강사·조교가 리포트를
-- 올리거나 댓글을 다시면, 보낼 열쇠를 못 찾아 **조용히 안 보내진다.**
-- 지금은 원장님 혼자 쓰셔서 안 드러났을 뿐, 선생님이 한 분 늘면 바로
-- 「저는 올렸는데 알림이 안 갔대요」 가 된다.
--
-- 열쇠 자체는 여전히 잠가 둔다 — 이 함수는 **선생님에게만** 답한다
-- (학생·학부모는 위의 staff_push_targets 로만 닿는다).
-- ------------------------------------------------------------
create or replace function public.push_keys()
returns table (public_key text, private_key text, contact text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role in ('principal', 'instructor', 'assistant')
  ) then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;
  end if;

  return query select cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact';
end;
$$;

comment on function public.push_keys() is
  '선생님이 알림을 보낼 때 쓸 열쇠 (0104). integrations 는 원장님만 읽을 수 있어서';

revoke all on function public.push_keys() from public, anon;
grant execute on function public.push_keys() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.staff_push_on()
returns boolean language sql immutable as $$ select true $$;
