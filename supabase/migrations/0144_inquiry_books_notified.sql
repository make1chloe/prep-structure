-- 상담 때 교재 안내가 나간 날 (2026-08-21 감사) — 등록 전환 때
-- student_textbooks.notified_on 으로 이어져서, 상담 때 이미 안내한 교재를
-- 「안내 안 나간 교재」 로 또 재촉하지 않는다.
alter table inquiries add column if not exists books_notified_on date;
