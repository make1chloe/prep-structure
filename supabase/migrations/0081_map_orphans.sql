-- 0081 — 매핑표의 **짝 없는 줄**을 사유와 함께 바로잡는다 (검사-⑱)
--
-- 왜: 0048 의 매핑 insert 가 데이터 insert 와 **다른 조건**으로 돌았다.
--     데이터는 `where d.import_batch='import'` 로 좁혔는데 매핑은 통째로 넣어서,
--     **안 옮긴 옛 줄에도 「새 줄 X 가 되었다」가 적혔다.**
--     실측 19줄 — 전부 「테스트계정」 아이 것이고, 그 아이는 일부러 안 옮겼다
--     (v2.import_skip: old_table='students', why='이름에 테스트').
--
-- ⚠️ **지우지 않는다**(대전제-6). 매핑표는 「이게 새 앱 어디로 갔지」를 되짚는 장부라
--    전환 뒤에도 남긴다. 가리키는 곳만 비우고 **사유를 적는다**
--    (계획 1-3 「옮기지 않기로 한 것은 사유와 함께 매핑표에 남긴다」).
--
-- ⚠️ 몇 줄이 바뀌었는지 **세어 보고** 다르면 통째로 멈춘다 — 조용히 지나가지 않는다.
-- 되돌리기: 이 줄들의 new_table='day_item', new_id=old_id::uuid, skip_why=null 로 되돌린다
--          (아래 select 로 뽑아 둔 목록이 있어야 정확히 되돌릴 수 있다)

do $$
declare n int; 기대 int := 19;
begin
  with 짝없는 as (
    select m.old_table, m.old_id
      from v2.import_map m
     where m.new_table = 'day_item'
       and not exists (select 1 from v2.day_item x where x.id = m.new_id)
  )
  update v2.import_map m
     set new_table = null, new_id = null,
         skip_why = '그 아이를 안 옮겼다 — ' ||
           coalesce((select k.why from v2.import_skip k
                       join public.daily_report_items i on i.id::text = m.old_id
                       join public.daily_reports r on r.id = i.daily_report_id
                      where k.old_table = 'students' and k.old_id = r.student_id::text),
                    '판이 안 섰다')
    from 짝없는 z
   where m.old_table = z.old_table and m.old_id = z.old_id;
  get diagnostics n = row_count;

  if n <> 기대 then
    raise exception '⚠️ 짝 없는 줄이 %개인 줄 알았는데 %개를 고쳤다 — 멈춘다. 왜 달라졌는지 먼저 본다', 기대, n;
  end if;
  raise notice '매핑표 짝 없는 줄 %개를 사유와 함께 바로잡았다', n;
end $$;
