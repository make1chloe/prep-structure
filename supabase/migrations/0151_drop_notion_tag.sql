-- 0151: 「노션 이관」 꼬리표를 데이터에서 뺀다
--
-- 원장님 (2026-08-23) — 「노션 이관은 데이터에 대한 태그로서 쓸모가 없어
-- 전수 빼버려」.
--
-- 2026-08-07 에는 화면에서만 떼고 DB 에는 남겨뒀다 (lib/note.js) —
-- 「나중에 이 줄이 어디서 왔지를 물어야 할 일이 생길 수 있다」는 이유였다.
-- 그 일은 오지 않았고, 대신 꼬리표가 붙은 줄이 화면마다 하나씩 새어 나왔다
-- (내신 대비의 시험 메모가 그랬다). 값이 아예 없으면 새어 나올 곳도 없다.
--
-- **괄호 안의 말은 살린다** — 「노션 이관 (결석일이 생성일 기준이라 다를 수
-- 있음)」 에서 정작 알아야 할 것은 괄호 쪽이다. 화면에서 떼던 규칙
-- (lib/note.js cleanNote) 과 같은 규칙을 SQL 로 한 번 더 쓰지 않도록,
-- 여기서 한 번에 정리하고 화면 쪽은 그대로 둔다(안전망).

do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'exams', 'tasks', 'makeups'] loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'note'
       )
    then
      execute format($f$
        update public.%I
           set note = nullif(
                 btrim(
                   regexp_replace(
                     btrim(regexp_replace(note, '노션\s*이관', '', 'g')),
                     '^[(（]\s*(.*?)\s*[)）]$', '\1'
                   )
                 ), ''
               )
         where note ~ '노션\s*이관'
      $f$, t);
    end if;
  end loop;
end $$;

create or replace function public.notion_tag_dropped()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.notion_tag_dropped() to authenticated;
