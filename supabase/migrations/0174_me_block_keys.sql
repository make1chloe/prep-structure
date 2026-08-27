-- 0174: 학생 화면 블록 키 재편 이관 + 성장 기본 숨김 (원장 확정 2026-08-27)
-- 스키마 변경 없음 — 기존 'me' 행의 데이터만 만진다. 행이 없으면 무동작.
--
-- 실행처: Supabase 대시보드 SQL 편집기 (설정→관리자 SQL 화면은 적용/복사
-- 전용이라 SELECT 결과를 못 본다). **Vercel 새 배포(C2 — 코드 호환층
-- 포함) 반영 확인 후** 실행한다. 실행 전후로
--   select page, order_keys, hidden_keys from screen_layouts where page='me';
-- 를 눈으로 검수한다 (순서 훼손은 아래 멱등 where·확인 select 가 못 잡는다).

-- 키 재편 이관 (멱등): 옛 키가 실제로 있는 행만 만진다.
-- 지도는 lib/screenLayout.js LEGACY_KEYS 와 한 벌:
--   study→arrival,inclass,break,leave,homework / help→state,request,question
--   / myscore→growth,write
-- 새 키에 'myscore' 가 없으므로(시험 적기는 write — 4차 중대 1) 이관을 마친
-- 행은 WHERE 가 거짓이 된다 — 합본(SETUP_ALL) 재실행에도 재이관 없음.
-- 순서 보존: 옛 키 자리(o.ord)에 새 키들을 그 차례(m.ord)로 전개, 중복은
-- 첫 등장만. 순서 훼손은 멱등 where·확인 select 가 못 잡으므로 이관 직후
-- §0 조회로 눈 검수한다.
create or replace function pg_temp.remap_keys(old text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by first_ord), '{}')
  from (
    select m.nk as k, min(o.ord * 100 + m.ord) as first_ord
    from unnest(old) with ordinality as o(k, ord)
    cross join lateral unnest(
      case o.k
        when 'study'   then array['arrival','inclass','break','leave','homework']
        when 'help'    then array['state','request','question']
        when 'myscore' then array['growth','write']
        else array[o.k]
      end
    ) with ordinality as m(nk, ord)
    group by m.nk
  ) t
$$;

-- 이관과 「성장 기본 숨김」 병합을 한 문장에 — 옛-키 행(=옛 코드 시절의
-- 저장)에만 적용되므로, 이관이 끝난 뒤 원장이 성장 블록을 켜도 합본
-- 재실행이 다시 숨기지 않는다 (WHERE 가 거짓 — 멱등).
-- 성장 5키는 lib/screenLayout.js DEFAULT_HIDDEN.me 와 한 벌.
update public.screen_layouts
   set order_keys  = pg_temp.remap_keys(order_keys),
       hidden_keys = ( select coalesce(array_agg(distinct k), '{}')
                       from unnest( pg_temp.remap_keys(hidden_keys)
                          || array['checked','month','last','growth','write'] ) as u(k) )
 where page = 'me'
   and ( order_keys  && array['study','help','myscore']::text[]
      or hidden_keys && array['study','help','myscore']::text[] );

-- 실행 직후 확인 (Supabase 대시보드 SQL 편집기 — §0 과 같은 경로):
-- 옛 키 0 이어야 하고, 순서는 §0 조회로 눈 검수
select page, order_keys, hidden_keys from public.screen_layouts
 where page='me'
   and ( order_keys  && array['study','help','myscore']::text[]
      or hidden_keys && array['study','help','myscore']::text[] );
-- (0줄이면 이관 완료. pg_temp 함수는 세션 종료로 소멸.
--  이관 후 §0 확인 쿼리 = 옛 키 0 이 정리 커밋 C4 — 코드의 LEGACY_KEYS·
--  expandLegacy·거울 제거 — 의 게이트다.)

-- 되돌리기 (실행계획서 v5 §7): 데이터 전용이라 되돌릴 컬럼이 없다.
-- 자동 역이관은 동봉하지 않는다 — 그 사이 저장된 새 키 설정을 파괴한다.
-- 이관 실행 후 C2 코드를 revert 해야 할 때만, 유일한 안전 경로는
--   delete from public.screen_layouts where page='me';
-- (원장 화면 설정 소실 감수 — 코드 기본 차례 복귀. resetLayout 과 같은 뜻.
--  이관 전 revert 면 불필요.)
