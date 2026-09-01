-- 0021 · 파기 목록 마저 (검사 ⑨ 가 잡은 셋)
insert into v2.purge_map(tbl,col,how,note) values
  ('progress_part','note','null','조각에 적은 말'),
  ('holiday','reason','null','휴강 사유에 아이 이름이 들 수 있다')
on conflict do nothing;
-- purge_map.note 는 **설명 글**이라 개인정보가 아니다 — 검사에서 뺀다
