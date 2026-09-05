-- 0101 · 오늘 수업(목업 01) — 출결 다섯(왔음·지각·결석·조퇴·온라인). 고르는 값은 DB 에도 건다(0-7). 한 번 더 돌려도 같다.
alter table v2.day_sheet drop constraint if exists day_sheet_attend_check;
alter table v2.day_sheet add constraint day_sheet_attend_check
  check (attend in ('present', 'late', 'absent', 'early', 'online', 'off'));
comment on column v2.day_sheet.attend is
  '출결 — present 왔음 · late 지각 · absent 결석 · early 조퇴 · online 온라인 · off 휴강(사람이 고르지 않는다). 쓰는 길은 lib/attend.js attendanceWrite 하나(검사-②)';
create index if not exists day_item_sheet_slot on v2.day_item (sheet_id, slot, sort);
create index if not exists day_sheet_student_date on v2.day_sheet (student_id, date desc);
