-- 0165 (어22b) 옛 앱에서 받아온 줄이 0131 의 고르는 값 제약(not valid)에 안 맞아 못 고쳐지던 것을 끝낸다.
--   2026-09-15 실 DB 를 docs/sql-paste/0-안-맞는-옛-줄.sql 로 재니 안 맞는 줄은 문의(inquiry.way) 5줄뿐(나머지 11 제약은 0).
--   ① 문의 경로(way): 옛 앱의 값(「재원생 소개」「지인 소개」「블로그」「인터넷 검색」「지나가다 보고」「기타」 · lib/applySlots SOURCES)을
--      새 앱의 넷(phone·site·visit·intro)에 붙이고, 못 붙이는 값은 「기타(other)」로 두되 원래 글을 문의 내용 끝에 남긴다(지우지 않는다).
--   ② 그 뒤 검증 안 한 제약을 모두 validate 한다. 옛 줄이 남아 있으면 이 파일이 그 제약 이름으로 실패하니 숨어 있을 수 없다.

-- ① 문의 경로 · 「기타」 자리를 제약에 더한다(lib/inquiry-plan WAYS 와 같은 목록)
alter table v2.inquiry drop constraint if exists inquiry_way_choice;
alter table v2.inquiry add constraint inquiry_way_choice check (way in ('phone', 'site', 'visit', 'intro', 'other')) not valid;
-- 글과 경로를 **한 문장**에서 바꾼다: 따로 하면 첫 문장이 옛 경로 그대로인 줄을 고치다 제약에 걸린다(e2e 에서 잡음)
update v2.inquiry
   set body = case when way !~ '소개|블로그|검색|홈페이지|인터넷|지나가다|방문|전화' then concat_ws(E'\n', body, '옛 경로: ' || way) else body end,
       way  = case when way ~ '소개' then 'intro'
                   when way ~ '블로그|검색|홈페이지|인터넷' then 'site'
                   when way ~ '지나가다|방문' then 'visit'
                   when way ~ '전화' then 'phone'
                   else 'other' end
 where way is not null and way not in ('phone', 'site', 'visit', 'intro', 'other');
alter table v2.inquiry validate constraint inquiry_way_choice;

-- ② 검증 안 한 제약 전부 검증(실 DB 는 안 맞는 줄 0 · 2026-09-15 표). 다시 돌려도 이미 검증된 것은 지나간다.
do $$ declare r record; begin
  for r in select conrelid::regclass as t, conname from pg_constraint where connamespace = 'v2'::regnamespace and contype = 'c' and not convalidated loop
    execute format('alter table %s validate constraint %I', r.t, r.conname);
  end loop;
end $$;
