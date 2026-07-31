-- 0055: 오래된 제출물은 파일만 지운다
--
-- 사진과 녹음은 쌓인다. 한 학생이 하루에 두세 개씩 내면 한 달에 수백 개고,
-- 무료 용량은 금방 찬다.
--
-- 그렇다고 기록까지 지우면 안 된다. 언제 뭘 냈고 뭐라고 봐줬는지는 남아야
-- 나중에 상담할 때 말할 수 있다. 그래서 **파일만** 지우고 줄은 남긴다.
-- 지운 줄에는 지운 시각을 적어, 학생 화면에 "보관 기간이 지나 파일은
-- 지웠습니다" 로 뜨게 한다.

alter table public.homework_submissions
  add column if not exists purged_at timestamptz;

comment on column public.homework_submissions.purged_at is
  '보관 기간이 지나 파일을 지운 시각. 기록(누가·언제·무엇을)은 그대로 남는다';

-- 아직 안 지운 것 중 오래된 것을 빨리 찾기 위해
create index if not exists submissions_purge_idx
  on public.homework_submissions (date)
  where purged_at is null and path is not null;
