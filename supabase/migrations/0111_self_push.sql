-- ============================================================
-- 0111. 학생·학부모도 **자기 폰에** 테스트 알림을 보낼 수 있게
--
-- 원장님 (2026-08-07)
--   「1. 학생이 부르는 중 눌러도 알림이 안 와」
--   「2. 안드로이드폰에서 알림이 안 켜져」
--
-- ── 왜 몇 주째 같은 자리에서 막히나 ──────────────────────
--
-- 알림이 안 오는 이유는 **일곱 군데**쯤 된다 — SQL 을 안 돌렸거나,
-- 공개키를 못 읽거나, 서비스워커가 없거나, 폰이 차단했거나, 방해금지
-- 시간이거나, 보낼 곳이 없거나, 열쇠가 없거나. 그런데 화면에는 전부
-- 똑같이 **아무 일도 안 일어난 것**으로 보인다.
--
-- 그래서 「안 와요」 를 들으면 저도 원장님도 추측만 하게 된다. 추측을
-- 없애려면 **그 폰에서 직접 눌러보고 어디서 막혔는지 읽을 수 있어야**
-- 한다. 그런데 지금 테스트 단추는 **선생님만** 쓸 수 있다 —
-- 보낼 열쇠(`integrations`)를 원장님만 읽기 때문이다 (0015).
--
-- 즉 정작 안 되는 사람(학생·안드로이드 어머니)이 확인할 길이 없었다.
--
-- ── 무엇을 여나 ──────────────────────────────────────────
--
-- **자기 폰으로만** 보낼 수 있는 문을 낸다. 돌려주는 기기는 부른 사람
-- 본인의 것뿐이다 (`profile_id = auth.uid()`).
--
-- 열쇠가 같이 나가는 것은 0104 에서 이미 그렇게 하고 있다 (학생이
-- 선생님을 부를 때). 여기서 늘어나는 위험은 없고, 대신 「내 폰에
-- 오는지」 를 본인이 1초 만에 확인할 수 있게 된다.
-- ============================================================

create or replace function public.self_push_targets()
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
  if auth.uid() is null then
    return;
  end if;

  select i.config into cfg from public.integrations i where i.id = 'push';
  if cfg is null or coalesce(cfg->>'privateKey', '') = '' then
    return;                                  -- 알림 열쇠를 아직 안 만드셨다
  end if;

  -- **내 기기만.** 남의 profile_id 를 넣을 자리가 아예 없다
  return query
    select ps.endpoint, ps.p256dh, ps.auth,
           cfg->>'publicKey', cfg->>'privateKey', cfg->>'contact'
      from public.push_subscriptions ps
     where ps.profile_id = auth.uid();
end;
$$;

comment on function public.self_push_targets() is
  '자기 폰에 테스트 알림을 보낼 때 쓸 대상 (0111). 열쇠가 원장님만 읽히므로 security definer';

revoke all on function public.self_push_targets() from public, anon;
grant execute on function public.self_push_targets() to authenticated;

-- ------------------------------------------------------------
-- **알림 열쇠가 아예 있기는 한가.**
--
-- 학생·학부모 화면에서 「아직 준비가 안 됐어요」 가 뜰 때, 그것이
--   · 원장님이 열쇠를 안 만드신 것인지
--   · 만들었는데 내가 못 읽는 것인지
-- 를 가를 수가 없었다. 있다/없다 한 글자만 답하는 문을 따로 낸다
-- (열쇠 자체는 안 나간다).
-- ------------------------------------------------------------
create or replace function public.push_keys_ready()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select coalesce(i.config->>'privateKey', '') <> ''
       from public.integrations i where i.id = 'push'),
    false)
$$;

comment on function public.push_keys_ready() is
  '알림 열쇠가 만들어져 있나 — 있다/없다만 (0111)';

revoke all on function public.push_keys_ready() from public, anon;
grant execute on function public.push_keys_ready() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.self_push_on()
returns boolean language sql immutable as $$ select true $$;
