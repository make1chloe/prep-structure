-- 시작일 두 칸을 하나로 (전수검사 A18, 원장님 2026-08-16 「합쳐줘」).
--
-- enrolled_on(0003, 등원시작일 — 화면·등록·엑셀이 쓰던 칸)과
-- started_on(0018, 수강료 일할이 보던 칸)이 같은 뜻으로 둘 있었다.
-- 등록 경로마다 어느 칸을 채우는지가 달라서, 일할이 틀리거나 화면에
-- 시작일이 비어 보이는 일이 생긴다. **enrolled_on 하나로 합친다** —
-- 코드는 이제 enrolled_on 만 읽고 쓴다. started_on 은 값을 옮긴 뒤
-- 버려둔다 (지우지는 않는다 — 옛 코드가 도는 동안 깨지지 않게).

update public.students
   set enrolled_on = coalesce(enrolled_on, started_on)
 where enrolled_on is null and started_on is not null;

create or replace function public.start_on_merged()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.start_on_merged() to authenticated;
