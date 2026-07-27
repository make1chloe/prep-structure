-- 0034: 등원 학습 · 학생이 누르는 '학습 완료'
--
-- 0033 에서 타이머를 **집에서 하는 숙제**에 붙였는데, 정작 필요한 것은
-- **등원해서 학원에서 하는 학습**이었다. 실시간으로 남아야 하는 쪽은 이쪽이다.
--
-- 흐름
--   선생님  오늘 수업에서 "오늘 학원에서 할 것" 을 정해준다   (status = 'inclass')
--   학생    등원해서 위에서부터 하나씩 ▶시작 → ■학습 완료
--   학생    '검사 받을게요' 를 따로 안 누른다. **학습 완료가 곧 검사 대기**다
--   선생님  손이 비면 대기줄을 보고 **한꺼번에** 검사한다
--
-- 학생이 누른 완료(student_done_at)와 선생님이 찍은 결과(status)는 다른 것이다.
-- 학생은 "다 했어요" 를 말할 뿐이고, 잘했는지는 선생님이 본다.

alter table public.daily_report_items
  add column if not exists student_done_at timestamptz;

comment on column public.daily_report_items.student_done_at is
  '학생이 학습 완료를 누른 시각. 선생님 검사 결과(status)와는 다른 것이다';

comment on column public.daily_report_items.status is
  'assigned(다음 수업 숙제) | inclass(오늘 학원에서 할 것) | done | weak | missing | verified';

-- 타이머 줄에 등원 학습도 붙을 수 있게
alter table public.study_sessions
  add column if not exists kind text not null default 'home';

comment on column public.study_sessions.kind is
  'inclass(학원에서) | home(집에서). 나중에 습관을 볼 때 나눠 본다';
