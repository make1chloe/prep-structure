-- 0087 — 기한 파기를 **원장님이 켜기 전에는 안 돌린다** (원장님 조건이 아직 안 채워졌다)
--
-- ⚠️⚠️ 원장님 답(2026-09-03): 「옛날앱거야? **백업 따로 만들면 지워**」 — **조건부 승낙**이다.
--   그런데 백업을 못 지었다. 셋 다 안 되는 것을 확인했다(app/api/cron/route.js 머리주석):
--     ① 파일로 떨구기 — 서버리스 크론이라 쓸 곳도, 원장님이 꺼낼 길도 없다
--     ② v2 안 다른 표로 옮기기 — 같은 DB 같은 권한이라 **파기가 아니게 된다**
--     ③ Storage — v2 밖이고(0-9) 검사-⑥ 이 막는다. 그리고 ② 와 같은 까닭
--   → 조건이 안 채워졌으면 **안 지운다.** 「지어낸 백업」보다 「안 지움」이 맞다.
--
-- ⚠️ 그렇다고 크론을 도로 터뜨리지 않는다 — 그것이 규칙-어긋난곳 ⑲ 였다.
--    「막혀서 터진다」와 「원장님이 아직 안 켜셨다」는 **다른 일**이고, 크론 보고에 다르게 뜬다.
--
-- ⚠️ 지금 지워질 줄은 **0줄**이다 (실측 2026-09-03: v2.excel_row 0줄 · v2.excel_run 0줄).
--    급한 것이 아니라 **조건이 안 채워진 것**이 문제다.
--
-- 켜는 법: v2.integration 의 'purge' 줄 config 에 {"expire_on": true} 를 넣는다.
--          (원장님 화면에 단추를 두는 것은 다음 일감이다 — 지금은 줄이 0개라 급하지 않다)

insert into v2.integration (id, config)
values ('purge', jsonb_build_object('expire_on', false))
on conflict (id) do update
   set config = coalesce(v2.integration.config, '{}'::jsonb)
                || case when coalesce(v2.integration.config, '{}'::jsonb) ? 'expire_on'
                        then '{}'::jsonb                    -- ⭐ 이미 정해 두셨으면 **안 덮는다**
                        else jsonb_build_object('expire_on', false) end,
       updated_at = now();

comment on column v2.integration.config is
  '연동마다 다른 설정 한 덩어리. ⚠️ **평문 열쇠가 든다** — 원장·강사만 본다. '
  '⚠️ purge 줄의 expire_on 은 **기한 파기 스위치**다(0087). 기본 꺼짐 — '
  '원장님 조건(「백업 따로 만들면 지워」)이 아직 안 채워졌기 때문이다. 켜면 90일 지난 줄이 비워진다';
