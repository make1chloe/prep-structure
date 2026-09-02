-- 검사가 더 찾아낸 것 — 사람 정보인 것만 넣는다
-- ⚠️ `schools.atpt_name`(교육청 이름)과 `unit_exams.name`(문법 분류)은 **사람 정보가 아니다.**
--    scripts/check-switchday.mjs 의 NOT_PERSON 목록에 넣었다.
insert into v2.purge_map(schema_name, tbl, col, how, note) values
 ('public','monthly_reports','note','null', '월간 리포트 메모'),
 ('public','notices','title','null',        '공지 제목 — 아이 이름이 들어가기도 한다'),
 ('public','prep_scopes','name','null',     '시험 범위 이름'),
 ('public','prep_scopes','note','null',     '시험 범위 메모'),
 ('public','requests','body','null',        '학부모·아이가 보낸 요청 본문'),
 ('public','screen_notes','body','null',    '화면 메모'),
 ('public','todo_routines','note','null',   '되풀이 할일 메모')
on conflict (schema_name, tbl, col) do update set how = excluded.how, note = excluded.note;
