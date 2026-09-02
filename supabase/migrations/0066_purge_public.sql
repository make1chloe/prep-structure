-- D+30 에 비울 **옛 public 의 사람 정보** — 9001 이 이 목록을 돈다
--
-- ⚠️ 계획 6단계 4번: 전환일에 옛 앱은 **접근만** 닫힌다. 자료는 그대로 산다.
--    같은 프로젝트라 DB 에 v2 한 벌과 옛 public 한 벌이 **같은 아이의 이름·학부모 전화·
--    상담일지·굳은 발송 글을 두 벌로** 들고 있다. **지우는 날을 안 적으면 그 두 벌은 영구가 된다.**
--
-- ⚠️ 글자 칸 52개 중 **사람 정보인 것만** 골랐다. 교재·단원·학교·반·문구 이름은 사람 정보가 아니다
--    (textbook_units.name 7,365줄 · textbooks.name 162 · homework_items.name 64 · schools.name 11 …).
--    다 넣으면 옛 앱이 통계 화면조차 못 되고 통째로 못 읽게 된다.
--
-- ⚠️ `how` 는 v2 와 같은 뜻이다 — mask(○○○) · null(비움).
insert into v2.purge_map(schema_name, tbl, col, how, note) values
 -- 사람과 연락처
 ('public','profiles','name','mask',                   '사람 이름'),
 ('public','students','name','mask',                   '아이 이름'),
 ('public','students','parent_phone','null',           '학부모 전화 — 옛 앱 아이디이기도 하다'),
 ('public','students','student_phone','null',          '아이 전화'),
 ('public','students','note','null',                   '아이에 대한 메모'),
 ('public','classcard_students','user_name','mask',    '클래스카드 쪽 이름'),
 -- 신규 문의 (등록 안 된 사람의 이름·전화가 그대로 있다)
 ('public','inquiries','name','mask',                  '문의한 사람 이름'),
 ('public','inquiries','phone','null',                 '문의한 사람 전화'),
 ('public','inquiries','student_phone','null',         '아이 전화'),
 ('public','inquiries','memo','null',                  '상담 메모'),
 -- 굳은 글 — ⚠️ **1,676줄이다.** 아이 이름이 본문에 그대로 들어 있다
 ('public','report_sends','body','null',               '⚠️ 나간 리포트 본문 1,676줄 — 이름이 든다'),
 ('public','push_receipts','title','null',             '알림 제목에 이름이 든다'),
 ('public','scheduled_sends','note','null',            '예약 발송 메모'),
 ('public','notices','body','null',                    '공지 본문'),
 ('public','comment_samples','body','null',            '본보기 문장 — 아이 이름이 섞여 들어간다'),
 -- 상담·기록
 ('public','student_notes','title','null',             '상담일지 제목'),
 ('public','student_notes','body','null',              '상담일지 본문'),
 ('public','attendance','reason','null',               '결석 사유 — 병명이 적히기도 한다'),
 ('public','attendance','note','null',                 '출결 메모'),
 ('public','warning_actions','note','null',            '경고 메모'),
 ('public','stay_tasks','body','null',                 '남아서 할 일'),
 -- 아이가 쓴 것 · 아이에 대한 판단
 ('public','scores','note','null',                     '성적 메모'),
 ('public','scores','self_note','null',                '아이가 쓴 메모'),
 ('public','score_items','reason','null',              '아이가 고른 틀린 까닭'),
 ('public','student_unit_progress','note','null',      '진도 메모'),
 ('public','daily_report_items','range_note','null',   '범위 메모'),
 -- 할 일 — ⚠️ 제목에 아이 이름이 그대로 들어간다 (「김서은 단평출제」)
 ('public','tasks','title','null',                     '⚠️ 할 일 제목에 아이 이름이 든다'),
 ('public','tasks','note','null',                      '할 일 메모')
on conflict (schema_name, tbl, col) do update set how = excluded.how, note = excluded.note;
