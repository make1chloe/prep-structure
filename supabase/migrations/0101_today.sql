-- 0101 · 오늘 수업(목업 01) — 출결 다섯(왔음·지각·결석·조퇴·온라인) + 앱이 채우는 둘(makeup 보강으로 온 날 · off 휴강). 고르는 값은 DB 에도 건다(0-7). 한 번 더 돌려도 같다.
-- ⚠️ 처음엔 'makeup' 을 빠뜨렸다 — 실제 DB 엔 옛 앱에서 옮긴 보강 출결 368줄이 있어 이 CHECK 가 거기서 멈춘다(빈 눌러보기 DB 에선 안 잡혔다). 실제 DB 에 돌기 전이라 제자리에서 고쳤다(9/5 밤, 검사-②)
alter table v2.day_sheet drop constraint if exists day_sheet_attend_check;
alter table v2.day_sheet add constraint day_sheet_attend_check
  check (attend in ('present', 'late', 'absent', 'early', 'online', 'makeup', 'off'));
comment on column v2.day_sheet.attend is
  '출결 — present 왔음 · late 지각 · absent 결석 · early 조퇴 · online 온라인 · makeup 보강으로 온 날(앱이 채운다, 0109) · off 휴강(사람이 고르지 않는다). 쓰는 길은 lib/attend.js attendanceWrite 하나(검사-②)';
create index if not exists day_item_sheet_slot on v2.day_item (sheet_id, slot, sort);
create index if not exists day_sheet_student_date on v2.day_sheet (student_id, date desc);
