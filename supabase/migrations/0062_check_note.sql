-- 0062: 검사할 때 한 줄 남기기
--
-- ○△✕ 만으로는 나중에 아무것도 기억나지 않는다. "△ 였다" 는 알겠는데
-- **무엇이 부족했는지**가 없어서, 다음 수업에 같은 말을 또 하거나 아예 못 짚는다.
--
-- 그 자리에서 한 줄만 적을 수 있게 한다.
--   · 리포트에 그대로 나간다 (학부모가 "왜 △ 인가" 를 알 수 있다)
--   · 다음에 그 학생을 열면 지난번에 뭐라고 했는지 보인다
--
-- 짧아야 한다. 길게 쓸 곳은 공지와 상담일지가 따로 있다.

alter table public.daily_report_items
  add column if not exists check_note text;

comment on column public.daily_report_items.check_note is
  '검사하면서 남긴 한 줄. 리포트에 함께 나간다';

-- 검사 대기줄에서 아직 안 본 제출물을 빨리 찾기 위해
create index if not exists submissions_unchecked_idx
  on public.homework_submissions (date)
  where checked_at is null;
