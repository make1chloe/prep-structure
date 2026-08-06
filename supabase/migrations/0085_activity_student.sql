-- 0085: 학생도 **자기 상태만** 바꿀 수 있게
--
-- 원장님 (2026-08-05) — 「학생 페이지에서 체크하면 그 내용이 현황판에 반영되게」
--
-- 0084 는 선생님만 쓸 수 있었다. 그런데 지금 뭘 하고 있는지 제일 잘 아는 것은
-- 그 아이 자신이고, 선생님은 설명하는 중이라 눌러줄 손이 없다.
--
-- **자기 줄만** 이다. 남의 상태를 바꿀 수 있으면 장난이 사고가 된다.
-- my_student_id() 는 지금 로그인한 사람의 학생 id 를 돌려준다 (0047).
--
-- 읽기도 자기 것만이다. 학생이 반 전체가 뭘 하는지 볼 까닭은 없고,
-- 「누가 시험 중인지」 는 학생끼리 알 일이 아니다.

drop policy if exists student_activity_mine on public.student_activity;
create policy student_activity_mine on public.student_activity
  for all
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

-- 학생이 무엇으로 바꿨는지 선생님이 알아야 한다.
-- 「선생님이 눌렀나 아이가 눌렀나」 는 판단이 달라진다 —
-- 아이가 「도움 필요」 를 누른 것은 지금 가보셔야 한다는 뜻이다.
alter table public.student_activity add column if not exists by_student boolean not null default false;

comment on column public.student_activity.by_student is
  '학생이 자기 화면에서 누른 것인가. 선생님이 눌러둔 것과 구별해서 보여준다.';
