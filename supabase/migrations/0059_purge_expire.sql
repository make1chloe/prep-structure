-- 파기에 갈래가 하나 더 있다 — **사람이 아니라 시간으로 지우는 것**
--
-- ⚠️ 검사 둘이 서로 반대로 당겼다. 엑셀 되돌리기 자료를 두고
--    check-schema 는 「개인정보 칸인데 파기 목록에 없다」 하고
--    check-purge 는 「파기 목록에 있는데 그 아이 줄에 **닿을 길이 없다**」 했다.
--    둘 다 맞다 — `excel_row.before` 는 **어느 표의 어느 줄이든** 통째로 담아서
--    「이 아이 것만 골라 지우기」가 원리적으로 안 된다.
--
-- → 파기 방법에 `expire` 를 더한다. 「사람으로 못 찾으니 **날짜로 지운다**」.
--    닿는 길을 요구하지 않는 대신 **반드시 기한이 있어야** 한다.
alter table v2.purge_map drop constraint purge_map_how_check;
alter table v2.purge_map add  constraint purge_map_how_check
  check (how in ('null','blank','mask','row','expire'));
alter table v2.purge_map add column if not exists after_days int;
alter table v2.purge_map add constraint purge_map_expire_needs_days
  check (how <> 'expire' or after_days is not null);
comment on column v2.purge_map.after_days is
  '⚠️ how=''expire'' 일 때만. 「사람으로 못 찾으니 며칠 지나면 비운다」 — 무기한은 못 고른다';

update v2.purge_map set how = 'expire', after_days = 90,
  note = '⚠️ **줄 전체**를 담아 이름·전화·상담 글이 그대로 든다. 그런데 어느 표의 줄인지 제각각이라 '
      || '「이 아이 것만」 골라낼 수가 없다 → 90일이 지나면 통째로 비운다. 되돌리기는 그때 끝난다'
where tbl = 'excel_row' and col = 'before';

update v2.purge_map set how = 'expire', after_days = 90,
  note = '올린 묶음 메모 — 아이 이름이 적힐 수 있는데 어느 아이인지 알 길이 없다. 90일 뒤 비운다'
where tbl = 'excel_run' and col = 'note';
