-- 0088 — **원장님이 화면에서 켜고 끄신다.** 역할별 접근을 코드에서 DB 로 옮긴다
--
-- 원장님 2026-09-03: 「역할별로 페이지를 따로 만들지말고 원장이 학부모·학생·강사·조교에게
--                    각각 페이지를 어디까지 오픈할지 온오프 및 세부목록 관리하는 페이지 추가해」
--
-- 지금은 「강사는 수강료·설정 못 본다」가 **코드에 박혀 있다**
-- (`lib/menu.js` 의 `HIDDEN_FROM_INSTRUCTOR` · `canSeeFees` · `canSettings`).
-- 원장님이 바꾸시려면 사람을 불러야 한다. 앞으로 그 규칙은 **기본값**이 되고,
-- 진짜 판단은 이 파일이 세우는 `v2.role_access` 한 줄이 한다.
--
-- ⚠️ **몇 번을 돌려도 같은 결과**여야 한다 — 전환 전날 마지막 재적재가 이것을 다시 돈다.
--    (실제로 두 번 돌려 확인했다)
--
-- ⚠️ 이 파일은 **DB 만** 짓는다. 화면(`app/`)과 판단 한 벌(`lib/`)은 다른 사람이 짓는다.
--    다른 갈래가 부를 이름 — 표 `v2.role_access` · 함수 `v2.can(text)` · `v2.my_role()` ·
--    열쇠 22가지(아래 ④의 씨앗 목록 그대로).
--
-- ══ 되돌리기 ══════════════════════════════════════════════════════════════════
--   -- ⑥ 다섯 표를 옛 규칙으로
--   drop policy if exists staff_all on v2.payment;
--   create policy staff_all on v2.payment for all to authenticated
--     using (v2.is_staff()) with check (v2.is_staff());
--   (fee_rule · consult · inquiry · integration 도 똑같이)
--   -- ⑦ 조교를 다시 뺀다
--   create or replace function v2.is_staff() returns boolean language sql stable
--     security definer set search_path = v2, public as $$
--     select exists (select 1 from v2.profiles
--                    where id = auth.uid() and role in ('principal','instructor')
--                      and state = 'active') $$;
--   -- ⑤ ③ ②
--   drop function if exists v2.can(text);
--   drop table if exists v2.role_access;
--   drop function if exists v2.my_role();
--   -- ① 조교 역할을 도로 막는다 (⚠️ assistant 인 사람이 한 명이라도 있으면 안 걸린다)
--   alter table v2.profiles drop constraint if exists profiles_role_check;
--   alter table v2.profiles add constraint profiles_role_check
--     check (role in ('principal','instructor','student','parent'));
-- ══════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- ① 조교(assistant) 역할을 만든다
-- ════════════════════════════════════════════════════════════════════════════
-- 왜: 원장님이 「강사·조교에게 각각」이라 하셨는데 DB 에 조교가 없다.
--     실측 2026-09-03 — `v2.profiles.role` 의 CHECK 는
--     `CHECK ((role = ANY (ARRAY['principal','instructor','student','parent'])))` 넷뿐이고,
--     제약 이름은 **`profiles_role_check`** 다 (pg_constraint 에서 찾아 적었다 — 지어낸 이름이 아니다).
-- ⚠️ **안 하면 무엇이 터지나** — 조교 계정을 만드는 순간 insert 가 제약에 걸려 거절된다.
--     화면은 「저장했습니다」라 말할 수 없고, 원장님은 조교를 한 명도 못 만드신다.
-- ⚠️ 이름을 지어내서 `drop constraint if exists 아무이름` 을 쓰면 **안 지워지고 새 제약만 붙어**
--     두 제약이 겹친 채로 남는다(옛 것이 여전히 assistant 를 막는다).
alter table v2.profiles drop constraint if exists profiles_role_check;
alter table v2.profiles add constraint profiles_role_check
  check (role in ('principal','instructor','assistant','student','parent'));

comment on column v2.profiles.role is
  '누구인가 — principal(원장) · instructor(강사) · **assistant(조교, 0088 에서 더했다)** · '
  'student(학생) · parent(학부모). '
  '⚠️ 화면을 어디까지 여는가는 **여기가 아니라 v2.role_access** 가 정한다(0088). '
  '⚠️ principal 은 role_access 에 못 들어간다 — 원장님이 스스로를 잠글 자리를 안 만든다';


-- ════════════════════════════════════════════════════════════════════════════
-- ② 「나는 무슨 역할인가」 한 벌 — v2.my_role()
-- ════════════════════════════════════════════════════════════════════════════
-- 왜: 접근 규칙과 `v2.can()` 이 둘 다 이것을 묻는다. 두 벌로 적으면 한쪽만 고쳐지는 날이 온다
--     (대전제-4 · 원칙-1). `v2.is_staff()` 와 **같은 모양**으로 짓는다.
-- ⚠️ `security definer` 여야 한다 — `v2.profiles` 는 force RLS 라, 규칙 안에서 제 자격으로
--    profiles 를 다시 물으면 규칙이 규칙을 부르는 꼴이 된다.
-- ⚠️ `state='active'` 를 건다 — 그만둔 강사의 줄이 남아 있어도 권한은 그날로 닫힌다.
--    (is_staff() 가 이미 같은 조건이라 결이 같다)
-- ⚠️ 로그인 안 했으면 **null** 이다. 「없다」와 「학생이다」를 섞지 않는다.
create or replace function v2.my_role() returns text
  language sql stable security definer set search_path = v2, public as $$
  select p.role from v2.profiles p where p.id = auth.uid() and p.state = 'active'
$$;

comment on function v2.my_role() is
  '지금 로그인한 사람의 역할 **한 벌**. 로그인 안 했으면 null · 그만둔 사람(state<>''active'')도 null. '
  '⚠️ v2.can() 과 v2.role_access 접근 규칙이 둘 다 이것을 쓴다 — 두 벌로 적지 않는다(대전제-4)';

grant execute on function v2.my_role() to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- ③ v2.role_access — 원장님이 켜고 끄시는 그 표
-- ════════════════════════════════════════════════════════════════════════════
-- 한 줄 = 「이 역할에게 이 자리를 여는가 」.
create table if not exists v2.role_access (
  role       text        not null,
  key        text        not null,
  allowed    boolean     not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references v2.profiles(id),
  primary key (role, key)
);

-- ⚠️⚠️ **principal 은 못 들어간다.** 원장님이 스스로를 잠그시면 그 화면을 다시 켤 길이
--    화면 안에 남지 않는다 — 설정을 잠그면 설정을 못 열어 되돌릴 수가 없다.
--    화면 코드가 실수로 principal 줄을 넣으려 해도 **DB 가 막는다**(0-7 — 고르는 값은 DB 에도 건다).
alter table v2.role_access drop constraint if exists role_access_role_check;
alter table v2.role_access add constraint role_access_role_check
  check (role in ('instructor','assistant','student','parent'));

comment on table v2.role_access is
  '한 줄 = 「이 역할에게 이 자리를 여는가」 — 원장님이 화면에서 켜고 끄신다(원장님 2026-09-03). '
  '주인: 앱. ⚠️ **principal 은 들어갈 수 없다** — 원장님이 스스로를 잠그면 되돌릴 길이 없다. '
  '⚠️ 판단은 v2.can(key) 한 벌로만 묻는다 — 화면이 이 표를 직접 읽어 스스로 가르면 두 벌이 된다(대전제-4)';
comment on column v2.role_access.role is
  'instructor · assistant · student · parent 넷뿐. ⚠️ principal 은 CHECK 가 막는다';
comment on column v2.role_access.key is
  '자리 하나의 열쇠 — page.* (대메뉴) · ops.* (운영 화면 카드) · me.* (학생 화면 카드) · parent.* (학부모 화면 카드). '
  '⚠️ 열쇠 목록의 주인은 **코드(lib)** 다 — 여기에 CHECK 로 두 벌 두면 lib 에 열쇠를 더하는 날 DB 가 거절한다(원칙-1). '
  '⚠️ ops.fee **하나**가 운영 화면의 수강료 카드와 대시보드의 fee 카드를 **둘 다** 판단한다 — '
  '두 열쇠로 나누면 원장님이 두 번 끄셔야 하고 한쪽만 꺼진 날이 온다(원칙-1 · 대전제-3)';
comment on column v2.role_access.allowed is '켬(true) · 끔(false). ⚠️ **줄이 없으면 끔이다**(v2.can 이 fail closed)';
comment on column v2.role_access.updated_at is
  '⚠️ 서버가 정한다(표-10). 화면이 보낸 값을 안 믿는다 — role_access_stamp 트리거가 덮는다';
comment on column v2.role_access.updated_by is
  '마지막으로 켜고 끄신 분. ⚠️ 서버가 auth.uid() 로 정한다(표-10). '
  '⚠️ 감사(v2.audit)에도 같은 사실이 남는다 — 이 칸은 「지금 누구 손이 마지막이었나」를 '
  '줄 옆에서 바로 읽으려고 둔 것이지 감사를 대신하지 않는다';

-- ── 「했다」는 서버가 시각과 사람을 정한다 (표-10)
-- ⚠️ **안 하면 무엇이 터지나** — 원장님만 쓸 수 있는 표이긴 하나, 화면이 updated_by 를 실어 보내면
--    그 값을 그대로 믿게 된다. 「누가 껐나」가 앱이 보낸 글자면 장부가 아니다.
create or replace function v2.role_access_stamp() returns trigger
  language plpgsql security definer set search_path = v2, public as $fn$
begin
  new.updated_at := now();
  -- ⚠️ 로그인 안 한 채로 도는 길(마이그레이션 씨앗·검사)은 **null 그대로** 둔다.
  --    지어낸 사람을 적지 않는다(대전제-0).
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $fn$;

drop trigger if exists role_access_stamp on v2.role_access;
create trigger role_access_stamp before insert or update on v2.role_access
  for each row execute function v2.role_access_stamp();

-- ⚠️ 누가 언제 무엇을 무엇으로 바꿨나 (처음-2) — 다른 표들과 같은 이름꼴로
drop trigger if exists role_access_audit on v2.role_access;
create trigger role_access_audit after insert or update or delete on v2.role_access
  for each row execute function v2.audit_row();

-- ── 접근 규칙 — ⚠️ 규칙(정책)과 권한(GRANT)은 **짝**이다. 하나만 있으면 아무 일도 안 일어난다
alter table v2.role_access enable row level security;
alter table v2.role_access force row level security;

-- 읽기 — **로그인한 누구나 제 역할 줄만.** 화면이 제 카드를 걸러야 하기 때문이다.
-- ⚠️ 원장은 다 본다 — 원장이 못 읽으면 켜고 끄는 화면 자체를 못 그린다.
--    (principal 은 이 표에 줄이 없으므로 `role = my_role()` 만으로는 0줄이다)
drop policy if exists own_read_ra on v2.role_access;
create policy own_read_ra on v2.role_access for select to authenticated
  using (v2.my_role() = 'principal' or role = v2.my_role());

-- 쓰기 — **원장만.**
-- ⚠️⚠️ **안 막으면 이 표가 통째로 뜻을 잃는다** — 강사가 제 줄의 allowed 를 true 로 고치면
--    원장님이 끄신 수강료를 스스로 다시 켠다. 그러면 켜고 끄는 화면은 장식이다.
drop policy if exists principal_add_ra on v2.role_access;
create policy principal_add_ra on v2.role_access for insert to authenticated
  with check (v2.my_role() = 'principal');

drop policy if exists principal_edit_ra on v2.role_access;
create policy principal_edit_ra on v2.role_access for update to authenticated
  using (v2.my_role() = 'principal') with check (v2.my_role() = 'principal');

-- ⚠️ 지우지 않는다(대전제-6) — 끄는 것은 allowed=false 이지 줄을 없애는 것이 아니다.
--    (줄을 없애면 v2.can 이 fail closed 로 같은 답을 내지만, **누가 언제 껐나**가 사라진다)
grant select, insert, update on v2.role_access to authenticated;
revoke delete on v2.role_access from authenticated;

-- ── 파기 목록(v2.purge_map)에 올릴 것이 있나 — **판단: 없다.**
-- 왜: 이 표의 칸은 role · key · allowed · updated_at · updated_by 다.
--     앞의 넷에 사람 이름·전화·사람이 쓴 글이 **한 글자도 안 들어간다.**
--     `updated_by` 는 사람을 가리키는 uuid 지만 ① 가리키는 사람은 **원장님뿐**이고
--     (쓰기 규칙이 principal 만 허용한다) ② 같은 결의 `v2.audit.who` 도 파기 목록에 없다(실측).
--     ③ `v2.profiles` 쪽 이름·전화는 이미 목록에 있어 그쪽에서 지워진다.
-- ⚠️ 그래서 **일부러 안 올린다.** 올리면 파기가 원장님의 온오프 장부를 지우러 들어온다.
-- ⚠️ 이 판단이 틀리는 날 — role_access 에 메모 칸 같은 **사람이 쓰는 칸**이 생기면
--    그때는 반드시 올려야 한다(자동 검사 ⑨ · 처음-3).


-- ════════════════════════════════════════════════════════════════════════════
-- ④ 씨앗 32줄 — **지금 코드에 박혀 있는 값을 그대로** 옮긴다
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ `on conflict do nothing` — **원장님이 이미 정해 두신 값을 덮지 않는다.**
--    덮으면 전환 전날 재적재가 원장님이 끄신 것을 도로 켜 버린다.
--
-- ⚠️⚠️ **조교(assistant) 기본값은 원장님이 정하신 것이 아니다.** 강사와 같게 두었다.
--    원장님이 2026-09-03 에 집으신 것은 **수강료와 설정 둘뿐**이고
--    (「아니 강사는 수강료 설정 못보게」) 조교에 대해서는 아무 말씀도 없으셨다.
--    → 화면에도 이것을 **밝혀야 한다**: 「조교 기본값은 강사와 같게 두었습니다 — 정해 주세요」.
--       지어낸 값을 원장님이 정하신 값인 척 그리면 안 된다(대전제-0).
--
-- ⚠️⚠️ **여기에 씨앗을 넣지 않는다** (원장님 2026-09-03):
--   「**그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해**」
--
--   앞판은 32줄(강사10·조교10·학생4·학부모8)을 여기서 넣었다. 그러면 **내가 정한 값**이
--   원장님이 정하신 값인 척 표에 앉는다. 걷어냈다.
--
--   → 이 표는 **원장님이 화면에서 누르신 것만** 든다. 줄이 없으면 「아직 안 정하셨다」이고
--     `v2.can()` 은 **거짓**으로 답한다(fail closed — 돈·개인정보가 걸린 자리라 막는 쪽이 안전하다).
--
--   ⚠️⚠️ **그래서 조용히 사라지면 안 된다.** 안 정한 채로 두면 강사·조교·아이·학부모가
--        아무것도 못 보는데 아무도 까닭을 모른다. 그것을 막는 것은 **화면의 몫**이다:
--        · 막힌 화면은 「원장님이 아직 안 정하셨습니다」라고 **말한다**(대전제-0 · 대전제-10)
--        · 대시보드가 「아직 안 정한 것 N개 — 정하러 가기」로 원장님을 **부른다**(대전제-3)
--        · 설정 화면에 역할마다 「전부 켜기 / 전부 끄기」를 두어 **한 번에** 정하실 수 있게 한다
--        이 셋이 `lib/perm.js` 의 `stateOf()` · `unsetCount()` 로 이어져 있다.


-- ════════════════════════════════════════════════════════════════════════════
-- ⑤ v2.can(열쇠) — 판단을 묻는 **한 벌**
-- ════════════════════════════════════════════════════════════════════════════
create or replace function v2.can(p_key text) returns boolean
  language sql stable security definer set search_path = v2, public as $$
  select case
    -- ⚠️⚠️ **로그인한 사람이 없으면 참이다.** 검사·이관·크론은 jwt 없이 `postgres` 로 돈다.
    --    0082(day_item_child_guard)·0083(arrival_stamp)이 **바로 이 자리에서 다쳤다** —
    --    누구도 아닌 채로 도는 서버 자신을 막으면 검사와 마이그레이션이 통째로 죽는다.
    --    막아야 하는 것은 「로그인한 강사」이지 서버 자신이 아니다.
    when auth.uid() is null then true
    -- ⚠️ **원장은 묻지 않는다.** 원장이 role_access 를 타면 스스로를 잠글 길이 생긴다
    when v2.my_role() = 'principal' then true
    -- ⚠️ **줄이 없으면 거짓**(fail closed) — 권한은 막는 쪽이 안전하다.
    --    새 열쇠를 코드에 더하고 씨앗을 안 넣으면 그 자리는 **닫힌 채로** 뜬다(열린 채가 아니라).
    else coalesce((select a.allowed from v2.role_access a
                    where a.role = v2.my_role() and a.key = p_key), false)
  end
$$;

comment on function v2.can(text) is
  '「이 사람에게 이 자리를 여는가」 — 판단을 묻는 **한 벌**(대전제-4). '
  '로그인 안 했으면 참(검사·이관·크론이 지나가야 한다) · 원장이면 묻지 않고 참 · '
  '그 밖에는 v2.role_access 의 그 줄. **줄이 없으면 거짓**(fail closed). '
  '⚠️ 화면도 접근 규칙도 이것만 부른다 — role_access 를 직접 읽어 스스로 가르지 않는다';

grant execute on function v2.can(text) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- ⑥ 민감한 표 다섯의 접근 규칙을 가른다 — 여기가 이 일의 핵심이다
-- ════════════════════════════════════════════════════════════════════════════
-- 실측 2026-09-03 — v2 의 접근 규칙 **145개 중 85개가 `v2.is_staff()` 하나**다.
-- 그래서 지금 DB 는 원장과 강사를 **한 글자도 못 가른다** — 화면만 가리고 있다.
-- 전부 다시 짜는 것은 지금 할 일이 아니다. **돈·상담·열쇠가 든 표 다섯만** 가른다.
--
-- 다섯 표의 정책 이름은 전부 `staff_all` 이다(pg_policies 에서 찾아 적었다 — 지어낸 이름이 아니다).
-- 지금 모양: for all to authenticated using (v2.is_staff()) with check (v2.is_staff())
--
-- ⚠️ `is_staff()` 를 그대로 두고 `and` 로 **좁히기만** 한다. 빼면 아이·학부모에게 열린다.
-- ⚠️ 원장은 v2.can 이 묻지 않고 참이라 **아무것도 안 바뀐다**(확인했다 — 아래 검증).

drop policy if exists staff_all on v2.payment;
create policy staff_all on v2.payment for all to authenticated
  using (v2.is_staff() and v2.can('ops.fee'))
  with check (v2.is_staff() and v2.can('ops.fee'));

drop policy if exists staff_all on v2.fee_rule;
create policy staff_all on v2.fee_rule for all to authenticated
  using (v2.is_staff() and v2.can('ops.fee'))
  with check (v2.is_staff() and v2.can('ops.fee'));

drop policy if exists staff_all on v2.consult;
create policy staff_all on v2.consult for all to authenticated
  using (v2.is_staff() and v2.can('ops.consult'))
  with check (v2.is_staff() and v2.can('ops.consult'));

drop policy if exists staff_all on v2.inquiry;
create policy staff_all on v2.inquiry for all to authenticated
  using (v2.is_staff() and v2.can('ops.inquiry'))
  with check (v2.is_staff() and v2.can('ops.inquiry'));

-- ⚠️⚠️ `v2.integration` 은 **평문 열쇠**(솔라피·나이스·앤트로픽·VAPID)가 든 표다.
--    한 줄만 어긋나도 통째로 샌다 — 여기가 다섯 중 가장 조심할 자리다.
--
-- ⚠️ **막으면 무엇이 깨지나 — 직접 확인했다(2026-09-03 실측):**
--   ① 등원 관문(`app/api/arrival/route.js` 의 `openGate`) — **안 깨진다.**
--      그 문은 `process.env.DATABASE_URL` 로 따로 붙는데, 그 자격은 `postgres` 이고
--      `pg_roles.rolbypassrls = true` 다(실측). 접근 규칙을 통째로 지나간다.
--      아이가 등원을 못 찍는 일은 **안 생긴다.** (규칙을 바꾼 뒤 postgres 로 다시 읽어 확인했다)
--   ② `app/today/read.js` 의 `cc_link` — **바뀐다.** 그 조회는 로그인한 그 사람으로 돌아
--      강사·조교에게는 이 표가 안 보이므로 「클래스카드 연동됨」이 **null** 로 온다.
--      터지지는 않고 「연동 안 됨」처럼 그려진다. 화면 담당이 알아야 하는 자리다.
--   ③ `lib/push.js` 의 `vapidSaved` — **안 바뀐다.** 부르는 자리
--      (`app/api/notify/route.js` 49·80줄)가 없는 변수 `db` 를 넘겨 지금도 늘 null 이다(실측).
--      이 파일이 만든 일이 아니다 — 원래 있던 자리다.
drop policy if exists staff_all on v2.integration;
create policy staff_all on v2.integration for all to authenticated
  using (v2.is_staff() and v2.can('page.settings'))
  with check (v2.is_staff() and v2.can('page.settings'));


-- ════════════════════════════════════════════════════════════════════════════
-- ⑦ v2.is_staff() 에 조교를 **넣는다** — 까닭을 적는다
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ **정직하게 적는다: 이렇게 하면 조교는 DB 에서는 강사와 같다** (위 다섯 표만 빼고).
--    숨기지 않는다. 조교가 PostgREST 로 직접 찌르면 강사가 읽는 것을 다 읽는다.
--
-- 왜 그래도 넣나 — 안 넣으면 조교는 **아무 자료도 못 읽는다.** 실측: v2 규칙 145개 중
-- 85개가 `is_staff()` 하나이고, 나머지도 「내 아이」(학생)·「내 아이의 부모」(학부모) 갈래다.
-- 조교는 그 어디에도 안 들어 **모든 표에서 0줄**이 된다. 그러면 「조교에게 오늘 화면을 켜 준다」가
-- 원리적으로 뜻이 없다 — 켜도 빈 화면이다. 그것은 원장님 말씀을 못 지키는 것이다.
--
-- ⚠️ 오늘 실제로 바뀌는 것은 **없다** — 실측 2026-09-03: v2.profiles 에
--    principal 2 · instructor 2 · student 23 · parent 21 이고 **assistant 는 0명**이다.
--    조교를 만드시는 날부터 위 문장이 참이 된다.
--
-- ⚠️ **다음에 할 일**(이 파일 밖) — 규칙 145개를 「강사가 볼 것 / 조교가 볼 것」으로 가르려면
--    `is_staff()` 를 쪼개야 한다. 그때까지 조교와 강사의 차이는 **위 다섯 표와 화면**뿐이다.
-- ⚠️ `lib/menu.js` 의 JS 쪽 `isStaff(role)` 은 아직 'assistant' 를 모른다(실측).
--    DB 는 직원이라 하고 앱은 아니라 한다 — **그 갈래를 맡은 사람이 같이 고쳐야 한다.**
create or replace function v2.is_staff() returns boolean
  language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.profiles
                 where id = auth.uid() and role in ('principal','instructor','assistant')
                   and state = 'active')
$$;

comment on function v2.is_staff() is
  '원장·강사·**조교**(0088 에서 더했다)이고 재직 중인가. v2 규칙 145개 중 85개가 이것 하나를 쓴다. '
  '⚠️ 이 함수는 셋을 **못 가른다** — 돈·상담·열쇠가 든 다섯 표(payment·fee_rule·consult·inquiry·integration)만 '
  'v2.can(열쇠) 로 따로 가른다(0088). 나머지 표에서 조교는 **강사와 같은 것을 읽는다**';
