-- ⚠️⚠️ **연동 열쇠가 통째로 이관에서 빠져 있었다.** `v2.integration` 이 0줄이었다.
--
-- 원장님이 Vercel 환경변수를 보여 주시며 「VAPID 가 여기 없다」고 하셨고, 찾아보니
-- **옛 앱은 열쇠를 환경변수가 아니라 `public.integrations` 표에 넣는다**
-- (`main:lib/push.js` — 「보내는 데 필요한 키(VAPID)는 설정 화면에서 한 번 만들어
--  integrations 에 저장한다」). 그래서 Vercel 에는 있을 수가 없었다.
--
-- 이게 없으면 안 도는 것:
--   push      → **학부모·아이 폰 알림이 한 대도 안 간다** (주소·열쇠가 둘 다 같아야 기존 구독이 산다)
--   solapi    → 문자·알림톡        neis      → 학사일정 받아오기
--   anthropic → AI 브리핑          tuition   → 수강료 기준(학년별)
--   warning   → 경고 기준(단어 통과선 90 …)   schedule → 보강 요일(금)
--
-- ⚠️ **값을 이 파일에 적지 않는다.** 옛 표에서 그대로 옮긴다 — 적으면 열쇠가 git 에 남는다.
-- ⚠️ `supabase_service`·`supabase_admin` 은 **안 옮긴다.** 그 열쇠로 이 표를 읽을 수 있어
--    순환이 되고, 새 앱은 환경변수(.env.local · Vercel)에서 받는다.
insert into v2.integration (id, config, updated_at)
select i.id, i.config, i.updated_at
  from public.integrations i
 where i.id not in ('supabase_service', 'supabase_admin')
on conflict (id) do update set config = excluded.config, updated_at = excluded.updated_at;

-- ⚠️ 이 표에는 **평문 열쇠**가 들어 있다. 규칙이 한 줄만 어긋나도 통째로 샌다.
comment on table v2.integration is
  '바깥 서비스 연동 한 줄 (알림 VAPID · 문자 · 나이스 · AI · 수강료·경고 기준). '
  '⚠️ **평문 열쇠가 든다** — 원장·강사만 본다. 아이·학부모에게 한 줄도 안 나간다';
