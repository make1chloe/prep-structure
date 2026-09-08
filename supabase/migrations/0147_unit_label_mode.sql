-- 0147 (가)-⑪(2026-09-08 — 남긴 것 20 「소단원 이름을 진행 방식대로」 · 원장님 「네 추천대로 · 독해도 단원으로 나갈 수 있음 · 문법은 문제수로 안 나감」)
--   진행 방식(books.mode, 0144)이 unit 이 아니고(지문·세트·단어) **소단원 이름(sub)이 비어 있으면** — 방식대로 「지문 N · 세트 N · 단어 N」으로 이름 짓는다.
--   ⚠️ 있으면 그대로: sub 가 있으면 그 이름을 쓴다(덮지 않는다) · mode=unit(기본)은 옛 이름 그대로 — 옛 교재는 하나도 안 바뀐다(진행 방식은 교재마다 따로, 독해도 단원일 수 있다).
--   판단은 v2.unit_label 한 곳(0056·0068·0073·0074 를 잇는다) — 04·05·08·14·16 이 이걸 부른다(두 벌 없음 · lib·앱은 안 고친다).
--   번호는 이 교재 안 차례(sort) · 방식 갈래일 때만 센다(속도 — 문법·단원은 옛 길 그대로).
create or replace function v2.unit_label(p_unit uuid, p_full boolean default true)
returns text language sql stable as $$
  with u as (select un.*, b.mode from v2.units un join v2.books b on b.id = un.book_id where un.id = p_unit),
       a as (
         select coalesce(v2.abbr_only(u.chapter), u.chapter) ch,
                case when v2.abbr_only(u.mid) is not null
                      and coalesce(u.mid,'') is distinct from coalesce(u.sub,'')
                     then v2.abbr_only(u.mid) end md,
                case u.mode when 'passage' then '지문' when 'set' then '세트' when 'word' then '단어' else null end mword
           from u)
  select case
    -- 소단원 이름이 없고 진행 방식이 단원이 아니면 — 방식대로 「지문 N」((가)-⑪). count 는 이 갈래일 때만(속도)
    when (u.sub is null or u.sub = '') and a.mword is not null then
      (case when p_full and concat_ws('-', a.ch, a.md) <> ''
            then concat_ws('-', a.ch, a.md) || ' · ' else '' end)
      || a.mword || ' '
      || ((select count(*) from v2.units u2 where u2.book_id = u.book_id and u2.state = 'active' and u2.sort < u.sort) + 1)::text
      || case when u.is_workbook then ' · 워크북' else '' end
    when u.sub is null or u.sub = '' then
      concat_ws('-', a.ch, a.md) || case when coalesce(u.activity,'') = '' then '' else ' · ' || u.activity end
    when p_full then concat_ws('-', a.ch, a.md) || ' ' || u.sub
                     || case when u.is_workbook then ' · 워크북' else '' end
    else u.sub || case when u.is_workbook then ' · 워크북' else '' end
  end
  from u, a
$$;
comment on function v2.unit_label is '소단원 이름 한 곳 — 대단원·중단원(약자)·소단원. 소단원이 없고 진행 방식이 지문·세트·단어면 「지문 N」으로((가)-⑪ · 있으면 그대로 · 단원은 옛 이름). 04·05·08·14·16 이 부른다';
grant execute on function v2.unit_label(uuid, boolean) to authenticated, service_role;
