-- 0027: 늦은 귀가 안내 (하원 안내 문자)
--
-- 남아서 단어 재시험을 보거나 숙제를 마저 하고 가면 평소보다 늦게 나간다.
-- 데리러 오시는 학부모께는 **수업 중에** 알려드려야 의미가 있다.
--
-- 자동으로 잡히는 사유
--   · 단어시험 미통과   → 재시험을 보고 간다
--   · 숙제 미제출·미흡  → 오늘 마무리로 남는다
-- 원장님은 **하원 예상 시간만** 고르면 된다.
--
-- 그 밖의 사유(상담, 보강, 학교 행사 …)는 직접 적어서 보낸다.
--
-- 하루에 학생 한 명당 한 번이므로 daily_reports 에 붙인다.
-- 데일리리포트·숙제 문자와 같은 자리에서 발송 이력이 남는다.

alter table public.daily_reports
  add column if not exists late_until   text,          -- 하원 예상 시간 "21:30"
  add column if not exists late_reason  text,          -- 직접 적은 사유 (자동 사유는 계산한다)
  add column if not exists late_text    text,          -- 손으로 고친 문구
  add column if not exists late_sent_at timestamptz;   -- 보낸 시각

comment on column public.daily_reports.late_until is
  '하원 예상 시간 (HH:MM). 값이 있으면 늦은 귀가 안내 대상이다';

-- 발송 이력의 kind 에 'late' 가 하나 늘어난다.
-- report_sends.kind 는 자유 문자열이라 스키마는 그대로다.
comment on column public.report_sends.kind is
  'report | homework | late — 어떤 문자였는지';
