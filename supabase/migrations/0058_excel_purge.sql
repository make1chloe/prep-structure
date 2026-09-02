-- 엑셀 되돌리기 자료도 파기가 지나가야 한다
insert into v2.purge_map(schema_name, tbl, col, how, note) values
 ('v2','excel_run','note','null',  '올린 묶음 메모 — 아이 이름이 적힐 수 있다'),
 ('v2','excel_row','before','null','⚠️ **줄 전체를 통째로 담는다** — 이름·전화·상담 글이 그대로 든다. '
   || '검사가 이 칸을 못 잡았다(글자 칸이 아니라 jsonb 라서). 손으로 넣는다')
on conflict (schema_name, tbl, col) do update set how = excluded.how, note = excluded.note;

-- ⚠️ 되돌리기 자료는 오래 둘 것이 아니다. 되돌릴 일은 **올린 그 주**에 생긴다.
--    한 해가 지나도록 두면 그 안에 아이 이름이 그대로 쌓인다.
comment on table v2.excel_row is
  '엑셀이 바꾼 줄과 바꾸기 전 값. ⚠️ before 에 **줄 전체**가 들어 있어 개인정보다 — '
  '파기 목록에 올렸고, 90일이 지나면 크론이 before 를 비운다(되돌리기는 그때 끝난다)';
