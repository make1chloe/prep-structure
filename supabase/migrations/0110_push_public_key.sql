-- ============================================================
-- 0110. 알림 공개키를 학생·학부모도 읽을 수 있게
--
-- 원장님 (2026-08-07) — 「허용 눌렀는데 이래」
--   → 「알림 준비가 아직 안 됐어요. 선생님께 말씀해주세요.」
--
-- ── 무슨 일이었나 ────────────────────────────────────────
--
-- 알림을 켜려면 브라우저에게 **공개키**를 줘야 한다. 그 키는
-- `integrations` 표의 `push` 줄에 들어 있는데, 이 표는 0015 에서
-- **원장님만** 읽을 수 있게 잠가두었다 (솔라피 비밀키가 같이 들어 있어서).
--
-- 그래서 —
--   원장님 폰   키가 읽힌다 → 알림 켜짐 ✅
--   학생·학부모  RLS 가 막는다 → 키가 null → 「준비가 안 됐어요」 ❌
--
-- 오류는 아무 데도 안 났다. 표가 「없다」 고 답할 뿐이라, 화면은 그것을
-- 「원장님이 아직 키를 안 만드셨다」 로 읽었다. 그래서 원장님은 설정에서
-- 「알림 준비됨」 을 보시면서도 아이들은 못 켜는 상태가 이어졌다.
--
-- (같은 날 sw.js 도 고쳤다 — 그건 서비스워커가 아예 등록이 안 되던 것이고,
--  이건 등록된 뒤 구독을 만들 때 막히는 것이다. **두 곳이 막혀 있었다.**)
--
-- ── 왜 열어도 되나 ──────────────────────────────────────
--
-- **공개키는 감출 것이 아니다.** 이름 그대로다 — 브라우저가 구독을 만들 때
-- 쓰는 값이고, 이것만으로는 아무에게도 알림을 보낼 수 없다. 보내려면
-- **비밀키**가 있어야 하고, 그건 여전히 원장님과 선생님만 읽는다 (0104).
--
-- 표를 여는 것이 아니라 **문 하나만** 낸다. 이 문은 `push` 줄의
-- publicKey 한 칸만 내어준다 — 솔라피 키도, 나이스 키도, AI 키도
-- 이 문으로는 안 나온다.
-- ============================================================

create or replace function public.push_public_key()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(i.config->>'publicKey', '')
    from public.integrations i
   where i.id = 'push'
$$;

comment on function public.push_public_key() is
  '알림을 켤 때 브라우저에 줄 공개키 (0110). integrations 는 원장님만 읽을 수 있어서, 이 한 칸만 내주는 문';

-- 로그인한 사람이면 누구나 — 학생도 학부모도 자기 폰에 알림을 켤 수 있어야 한다.
-- 로그인 안 한 사람에게는 안 준다 (줄 이유가 없다).
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.push_public_key_on()
returns boolean language sql immutable as $$ select true $$;
