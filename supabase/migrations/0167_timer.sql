-- 0167 (어35) 아이 화면 타이머 · 원장님 2026-09-15 「학생페이지 타이머 짓는다」 · 「그이전에 학생이 시작버튼 눌러서 타이머 시작되면, 이미 학생이 시작한 학습 완료후에 나머지를 루틴대로 하도록 배정함」
--   ① v2.day_item.started_at · ended_at · 학원 줄(slot class)에 아이가 「▶ 시작」 「■ 끝」을 누른 때(서버 시계 · 문지기가 찍는다). 끝을 누르면 said_done_at 도 같이 찍힌다(「다 했어요」와 같은 뜻).
--   ② v2.day_item_child_guard · 아이가 바꿀 수 있는 칸 셋(said_done_at · started_at · ended_at) · 비었다가 찍히는 순간은 now() · 이미 찍힌 것은 안 바뀐다 · 비우기(취소)는 된다(원장님 답 ⑧과 같은 결)
--   ③ 차례(sort)는 학원 사람 손이 쓴다(lib/routine.js layRoutine · reorderToday · moveBook) · 표는 안 바뀐다 · 검사 먼저 끝난 교재부터 깔리고 다 끝나면 루틴 차례로 다시 선다(시작한 줄은 앞)
alter table v2.day_item add column if not exists started_at timestamptz;
alter table v2.day_item add column if not exists ended_at timestamptz;
comment on column v2.day_item.started_at is '(어35) 아이가 「▶ 시작」을 누른 때(서버 시계) · 학원 줄 · 검사가 다 끝나 루틴 차례로 다시 세울 때 이 줄은 앞에 둔다';
comment on column v2.day_item.ended_at is '(어35) 아이가 「■ 끝」을 누른 때(서버 시계) · 그때 said_done_at 도 찍힌다 · 취소하면 둘 다 비운다';

create or replace function v2.day_item_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  -- 로그인한 사람이 없으면 지나간다 · 검사·마이그레이션·크론은 jwt 없이 postgres 로 돈다(0084)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- 남의 판은 못 건드린다 · 학부모도 여기서 걸린다(0084 ㉑ · 원장님 「절대안돼」)
  if not v2.sheet_mine(new.sheet_id) then
    raise exception '내 판이 아니면 못 건드린다 (day_item) · 학부모는 「다 했어요」를 못 누른다' using errcode = '42501';
  end if;

  -- 아이는 셋만 바꾼다 · 다 했어요 · 시작 · 끝(표-9 · (어35)). updated_at 은 touch 트리거가 미는 값이라 뺀다
  if (to_jsonb(new) - 'said_done_at' - 'started_at' - 'ended_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'started_at' - 'ended_at' - 'updated_at') then
    raise exception '아이는 「다 했어요 · 시작 · 끝」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- 시각은 서버가 정한다(표-10) · 비었다가 찍히면 now() · 이미 찍힌 것은 그대로 · 비우기(취소)는 된다(원장님 답 ⑧)
  if new.said_done_at is not null then new.said_done_at := coalesce(old.said_done_at, now()); end if;
  if new.started_at   is not null then new.started_at   := coalesce(old.started_at, now()); end if;
  if new.ended_at     is not null then new.ended_at     := coalesce(old.ended_at, now()); end if;
  return new;
end $$;
comment on function v2.day_item_child_guard() is
  '아이의 「다 했어요 · ▶ 시작 · ■ 끝」 문지기(표-9·표-10 · 0115 · (어35)) · 내 판만 · 세 칸 말고는 못 바꿈 · 시각은 서버가 · 취소(비우기)는 된다(원장님 답 ⑧). 학원 사람·검사는 지나간다';

notify pgrst, 'reload schema';
