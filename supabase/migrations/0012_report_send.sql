-- 0012: 데일리리포트 발송
--   sent_at     : 학부모에게 보낸 시각 (없으면 아직 안 보냄)
--   report_text : 실제로 보낸 문구. 비어 있으면 자동 생성 문구를 쓴다.
--                 선생님이 고쳐서 보내면 여기에 저장되고, 재발송도 이걸 쓴다.
alter table public.daily_reports add column if not exists sent_at timestamptz;
alter table public.daily_reports add column if not exists report_text text;
create index if not exists daily_reports_sent_idx on public.daily_reports (date, sent_at);
