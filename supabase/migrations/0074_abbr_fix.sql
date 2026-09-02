-- 약자 다듬기 — 처음 판이 되레 길어졌다(최대 125자)
--
-- ⚠️ 두 가지가 겹쳤다:
--   ① 중단원에 **소단원과 같은 글자**가 든 교재가 있다(그래머인사이드의 mid = 「01 품사」).
--      그대로 붙이면 「GRAMMAR BASICS-01 품사 · 01 품사」처럼 **같은 말이 두 번** 나온다.
--   ② 약자로 **안 줄어드는 이름**(「워크북 01 품사」)이 통째로 앞에 붙었다.
-- → 중단원은 **진짜 약자로 줄었고 · 소단원과 다를 때만** 붙인다.
--   대단원은 약자가 안 되면 원래 이름을 쓴다(그건 어차피 하나뿐이라 길어도 뜻이 있다).

-- 약자로 **줄었을 때만** 값을 준다. 아니면 null (붙이지 않는다)
create or replace function v2.abbr_only(p text)
returns text language sql immutable as $$
  select case when p ~ '^[A-Za-z]+\s*0*[0-9]+'
              then upper(substring(p from '^([A-Za-z])'))
                   || (regexp_match(p, '^[A-Za-z]+\s*0*([0-9]+)'))[1]
         end
$$;
comment on function v2.abbr_only is '약자로 줄었을 때만 값을 준다 — 못 줄이면 null (안 붙인다)';

create or replace function v2.unit_label(p_unit uuid, p_full boolean default true)
returns text language sql stable as $$
  with u as (select * from v2.units where id = p_unit),
       a as (
         select coalesce(v2.abbr_only(u.chapter), u.chapter) ch,
                -- ⚠️ 중단원은 **줄었고 · 소단원과 다를 때만**
                case when v2.abbr_only(u.mid) is not null
                      and coalesce(u.mid,'') is distinct from coalesce(u.sub,'')
                     then v2.abbr_only(u.mid) end md
           from u)
  select case
    when u.sub is null or u.sub = '' then
      concat_ws('-', a.ch, a.md) || case when coalesce(u.activity,'') = '' then ''
                                         else ' · ' || u.activity end
    when p_full then concat_ws('-', a.ch, a.md) || ' ' || u.sub
                     || case when u.is_workbook then ' · 워크북' else '' end
    else u.sub || case when u.is_workbook then ' · 워크북' else '' end
  end
  from u, a
$$;
