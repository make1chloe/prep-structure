-- 단원 메모 (0119)
--
-- student_unit_progress.note 는 0010 부터 있었는데 화면에서 적을 길이 없었다.
-- 적으려고 보니 status 가 not null default 'done' 이라 두 가지가 조용히 틀린다:
--   1) 메모만 적어도 새 줄의 status 가 'done' 이 되어 **그 단원이 완료로 보인다**
--   2) 완료를 취소하면 줄을 지우는데, 그러면 **메모도 같이 사라진다**
--
-- status 를 비울 수 있게 한다 — 줄은 있는데 status 가 null 이면
-- 「아직 안 했지만 메모는 있다」 는 뜻이다.
alter table public.student_unit_progress alter column status drop not null;
alter table public.student_unit_progress alter column status drop default;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다).
-- 제약만 바꾸는 마이그레이션이라 표·칸으로는 확인할 수가 없다.
create or replace function public.unit_note_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.unit_note_on() to authenticated;
