-- 0050: 공지를 나눈다
--
-- 지금은 '공지' 칸이 하나뿐이라, 학생에게 할 말과 학부모께 드릴 말이
-- 같은 데 들어간다. 그래서 학부모용 문장이 학생 화면에 뜨는 일도 있었다.
--
-- 세 갈래로 나눈다.
--   1. 전달사항   — 수업 중에 학생에게 말할 것   (이미 notices 표에 있다)
--   2. 학생공지   — 숙제문자 맨 위               ← 여기만 새로 만든다
--   3. 부모님공지 — 데일리리포트 맨 아래         (기존 daily_reports.notice)

alter table public.daily_reports
  add column if not exists notice_student text;

comment on column public.daily_reports.notice        is '부모님공지 — 데일리리포트 맨 아래';
comment on column public.daily_reports.notice_student is '학생공지 — 숙제문자 맨 위';
