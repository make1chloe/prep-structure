-- ============================================================
-- 시험용 더미 데이터 — 서로 다른 20명 + 반 5개 + 일주일치 수업
--
-- 쓰는 법
--   1. SQL Editor 에 붙여넣고 Run
--   2. 앱에서 일주일 굴려보고
--   3. 맨 아래 "지우기" 블록만 따로 실행해서 전부 삭제
--
-- 이름은 전부 '테스트'로 시작해서 실제 학생과 섞이지 않습니다.
-- ============================================================

-- ---------- 반 5개 ----------
insert into public.classes (name, days, start_time, end_time, room, level, category, capacity, tuition, base_sessions)
values
  ('테스트 월수 5:00 초등', array['월','수'], '17:00', '19:00', '1강의실', '기본반', '정규반', 8, 280000, 8),
  ('테스트 월수 7:30 중등', array['월','수'], '19:30', '22:00', '2강의실', '기본반', '정규반', 8, 320000, 8),
  ('테스트 화목 5:00 초등', array['화','목'], '17:00', '19:00', '1강의실', '기본반', '정규반', 8, 280000, 8),
  ('테스트 화목 7:30 중등', array['화','목'], '19:30', '22:00', '2강의실', '심화반', '정규반', 8, 340000, 8),
  ('테스트 금 2:20 고등',  array['금'],      '14:20', '16:50', '2강의실', '심화반', '정규반', 6, 220000, 4)
on conflict do nothing;

-- ---------- 학생 20명 (서로 다른 경우) ----------
insert into public.students (name, school, grade, parent_phone, student_phone, status, started_on, note)
values
  ('테스트김서은','한빛초','초5','01011110001','01099990001','enrolled','2025-03-02','평범한 케이스'),
  ('테스트홍채은','한빛초','초6','01011110002',null,'enrolled','2025-09-01','학생 번호 없음'),
  ('테스트노주하','샛별중','중1','01011110003','01099990003','enrolled','2026-07-15','달 중간 등원 — 수강료 일부'),
  ('테스트김소현','샛별중','중1','01011110004','01099990004','enrolled','2024-03-04','오래 다닌 학생'),
  ('테스트박民준','샛별중','중2','01011110005',null,'enrolled','2025-05-06','이름에 한자 섞임'),
  ('테스트이서준','샛별중','중2',null,'01099990006','enrolled','2025-11-03','학부모 번호 없음 — 발송 실패 케이스'),
  ('테스트최유정','샛별중','중3','01011110007','01099990007','enrolled','2025-01-06','내신 대비'),
  ('테스트정현수','샛별중','중3','01011110008','01099990008','enrolled','2025-03-02','숙제 잘 안 하는 케이스'),
  ('테스트서한결','한빛고','고1','01011110009','01099990009','enrolled','2026-03-02','고등 편입'),
  ('테스트강민서','한빛고','고1','01011110010','01099990010','enrolled','2026-03-02','같은 반 두 명'),
  ('테스트윤지호','한빛고','고2','01011110011','01099990011','enrolled','2025-03-03','선택과목 있음'),
  ('테스트임하늘','샛별중','중2','01011110012','01099990012','enrolled','2025-07-01','형제 할인'),
  ('테스트임바다','한빛초','초4','01011110012','01099990013','enrolled','2025-07-01','위 학생 동생 — 같은 학부모 번호'),
  ('테스트오세영','샛별중','중1','01011110014',null,'enrolled','2026-06-01','최근 등록'),
  ('테스트한예린','한빛초','초5','01011110015','01099990015','enrolled','2025-04-01','두 반 동시 수강'),
  ('테스트조은우','샛별중','중3','01011110016','01099990016','enrolled','2024-09-02','졸업 예정'),
  ('테스트배시윤','한빛초','초6','01011110017',null,'enrolled','2026-02-02','교재 끝낸 케이스'),
  ('테스트문가온','샛별중','중2','01011110018','01099990018','paused','2025-08-01','휴원 — 목록에서 빠져야 함'),
  ('테스트신도윤','샛별중','중1','01011110019','01099990019','enrolled','2026-07-01','이번 주 결석 예정'),
  ('테스트권나윤','한빛고','고3','01011110020','01099990020','enrolled','2025-03-03','고3 — 수업 1회')
on conflict do nothing;

-- ---------- 반 배정 ----------
-- 초등 월수
insert into public.class_students (class_id, student_id)
select c.id, s.id from public.classes c, public.students s
where c.name = '테스트 월수 5:00 초등'
  and s.name in ('테스트김서은','테스트홍채은','테스트임바다','테스트한예린','테스트배시윤')
on conflict do nothing;
-- 중등 월수
insert into public.class_students (class_id, student_id)
select c.id, s.id from public.classes c, public.students s
where c.name = '테스트 월수 7:30 중등'
  and s.name in ('테스트노주하','테스트김소현','테스트박民준','테스트이서준','테스트신도윤','테스트오세영')
on conflict do nothing;
-- 초등 화목
insert into public.class_students (class_id, student_id)
select c.id, s.id from public.classes c, public.students s
where c.name = '테스트 화목 5:00 초등'
  and s.name in ('테스트한예린')
on conflict do nothing;
-- 중등 화목
insert into public.class_students (class_id, student_id)
select c.id, s.id from public.classes c, public.students s
where c.name = '테스트 화목 7:30 중등'
  and s.name in ('테스트최유정','테스트정현수','테스트임하늘','테스트조은우')
on conflict do nothing;
-- 고등 금
insert into public.class_students (class_id, student_id)
select c.id, s.id from public.classes c, public.students s
where c.name = '테스트 금 2:20 고등'
  and s.name in ('테스트서한결','테스트강민서','테스트윤지호','테스트권나윤')
on conflict do nothing;

-- ---------- 학생 개별 수강료 (형제 할인) ----------
update public.students set tuition = 288000 where name in ('테스트임하늘','테스트임바다');

-- ---------- 교재 3권 + 단원 ----------
insert into public.textbooks (name, area, target_grade, total_pages, status, purchase_url)
values
  ('테스트 리딩튜터 주니어1','독해','초6~중1',160,'active','https://example.com/book1'),
  ('테스트 자이스토리 문법 중2','문법','중2',200,'active','https://example.com/book2'),
  ('테스트 워드마스터 중등실력','단어','중1~중2',120,'active','https://example.com/book3')
on conflict do nothing;

-- Unit 1~10, 페이지 균등 분할
insert into public.textbook_units (textbook_id, name, sort, label, page_start, page_end, total_pages)
select t.id, 'Unit ' || g, g, '본문', 8 + (g-1)*15, 8 + g*15 - 1, 15
from public.textbooks t, generate_series(1,10) g
where t.name like '테스트 %'
on conflict do nothing;

-- ---------- 반에 교재 배정 ----------
insert into public.class_textbooks (class_id, textbook_id)
select c.id, t.id from public.classes c, public.textbooks t
where c.name like '테스트 %' and t.name like '테스트 %'
on conflict do nothing;

-- 학생에게도 배정
insert into public.student_textbooks (student_id, textbook_id, assigned_on, status)
select s.id, t.id, coalesce(s.started_on, current_date), 'active'
from public.students s
join public.class_students cs on cs.student_id = s.id
join public.class_textbooks ct on ct.class_id = cs.class_id
join public.textbooks t on t.id = ct.textbook_id
where s.name like '테스트%'
on conflict do nothing;

-- 배시윤은 독해 교재를 끝낸 상태로
update public.student_textbooks st
set status = 'done', ended_on = current_date - 7
where st.student_id = (select id from public.students where name = '테스트배시윤')
  and st.textbook_id = (select id from public.textbooks where name = '테스트 리딩튜터 주니어1');

-- ---------- 진도 (학생마다 다르게) ----------
insert into public.student_unit_progress (student_id, textbook_unit_id, status, done_on)
select s.id, u.id, 'done', current_date - (random()*20)::int
from public.students s
join public.student_textbooks st on st.student_id = s.id
join public.textbook_units u on u.textbook_id = st.textbook_id
where s.name like '테스트%'
  and u.sort <= (case
    when s.name = '테스트김소현' then 8
    when s.name = '테스트최유정' then 6
    when s.name = '테스트노주하' then 2
    when s.name = '테스트배시윤' then 10
    else 4 end)
on conflict do nothing;

-- ---------- 이번 주 결석 예정 · 휴강 ----------
insert into public.attendance (student_id, date, status, planned, reason)
select s.id, current_date + 2, 'absent', true, '가족 여행'
from public.students s where s.name = '테스트신도윤'
on conflict (student_id, date) do nothing;

insert into public.holidays (date, name, scope)
values (current_date + 4, '테스트 휴강(설날)', 'all')
on conflict do nothing;

-- ---------- 일정 · 할일 ----------
insert into public.tasks (title, kind, category, due_on, start_time, status, deliver_body, notice_body)
values
  ('테스트 8월 특강 설명회','schedule','학사일정', current_date + 3, '19:00','open',
   '다음 주 특강 안내문 받아가세요','8월 특강 일정을 안내드립니다.'),
  ('테스트 중간고사 대비 시작','schedule','수업', current_date + 6, null,'open', null, null)
on conflict do nothing;

insert into public.tasks (title, kind, due_on, priority, status, no_due)
values
  ('테스트 8월 특강 교재 주문','todo', current_date + 1, 2,'open', false),
  ('테스트 블로그 특강 글 올리기','todo', current_date + 2, 1,'open', false),
  ('테스트 프린터 토너 주문','todo', current_date, 0,'open', false),
  ('테스트 교재 단원 입력 (남은 교재)','todo', current_date, 0,'open', true)
on conflict do nothing;

-- ---------- 신규 상담 3건 (서로 다른 경우) ----------
insert into public.inquiries (name, phone, school, grade, source, status, memo, form_submitted_at, test_want_on, visit_on)
values
  ('테스트문의A','01022220001','샛별중','중1','블로그','new','전화로만 접수 — 양식 미제출', null, null, null),
  ('테스트문의B','01022220002','한빛초','초6','소개','scheduled','양식 제출함', now(), current_date + 2, current_date + 3),
  ('테스트문의C','01022220003','한빛고','고1','검색','tested','테스트만 보고 상담 대기', now(), current_date - 1, null)
on conflict do nothing;

-- ---------- 지난 2주 수업 기록 (숙제 미제출 누적 케이스) ----------
insert into public.daily_reports (student_id, date, attendance_kind, word_correct, word_total, report_written)
select s.id, d::date, 'present', 15 + (random()*5)::int, 20, true
from public.students s,
     generate_series(current_date - 14, current_date - 1, interval '3 day') d
where s.name in ('테스트정현수','테스트김소현','테스트최유정')
on conflict (student_id, date) do nothing;

-- 정현수는 미제출이 쌓이게
insert into public.daily_report_items (daily_report_id, homework_item_id, status)
select r.id, h.id, 'missing'
from public.daily_reports r
join public.students s on s.id = r.student_id
join public.homework_items h on h.name = '단어(온라인)'
where s.name = '테스트정현수'
on conflict do nothing;

-- ============================================================
-- 지우기 (테스트 끝나면 이 블록만 실행)
-- ============================================================
-- delete from public.attendance where student_id in (select id from public.students where name like '테스트%');
-- delete from public.daily_reports where student_id in (select id from public.students where name like '테스트%');
-- delete from public.student_unit_progress where student_id in (select id from public.students where name like '테스트%');
-- delete from public.student_textbooks where student_id in (select id from public.students where name like '테스트%');
-- delete from public.class_students where student_id in (select id from public.students where name like '테스트%');
-- delete from public.students where name like '테스트%';
-- delete from public.textbook_units where textbook_id in (select id from public.textbooks where name like '테스트 %');
-- delete from public.class_textbooks where class_id in (select id from public.classes where name like '테스트 %');
-- delete from public.classes where name like '테스트 %';
-- delete from public.textbooks where name like '테스트 %';
-- delete from public.tasks where title like '테스트%';
-- delete from public.inquiries where name like '테스트%';
-- delete from public.holidays where name like '테스트%';
