-- 클로이영어 · **읽기만 합니다.** 아무것도 안 바꾸고, 아무것도 안 지웁니다(임시 함수 하나를 이 창에서만 만듭니다 · 창을 닫으면 사라집니다).
-- Supabase → SQL Editor → New query → 통째로 붙여넣고 Run → 나온 **표**를 그대로 주세요.
--
-- 무엇을 보나: 0131 이 「새 줄만 막고 옛 줄은 그대로」(not valid)로 건 고르는 값 제약마다, 옛 앱에서 받아온 줄 가운데
--              그 제약에 **안 맞는 줄이 몇 줄**인가. 안 맞는 줄은 그 뒤로 한 줄도 못 고칩니다(2026-09-15 0164 가 할 일 표에서 그렇게 되돌아감).
--              할 일 표(todo)는 0164 가 메모로 옮기고 검증까지 하므로 여기 안 나옵니다. 나머지가 0 이 아니면 그 표도 같은 길로 고칩니다.
-- ⚠️ SQL Editor 는 **맨 마지막 select 하나만** 보여 줍니다.

create or replace function pg_temp.안_맞는_옛_줄() returns table(표 text, 제약 text, 안_맞는_줄 bigint, 조건 text) language plpgsql as $$
declare r record; n bigint; e text;
begin
  for r in select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c where c.connamespace = 'v2'::regnamespace and c.contype = 'c' and not c.convalidated order by 1, 2 loop
    e := regexp_replace(regexp_replace(r.def, '^CHECK \(', ''), '\)( NOT VALID)?$', '');
    execute format('select count(*) from %s where not coalesce((%s), true)', r.tbl, e) into n;
    표 := r.tbl; 제약 := r.conname; 안_맞는_줄 := n; 조건 := e; return next;
  end loop;
end $$;

select * from pg_temp.안_맞는_옛_줄();
