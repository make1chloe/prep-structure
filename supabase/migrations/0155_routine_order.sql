-- 0155: 차례는 세 겹이다 — 영역 → 교재 → 루틴 항목
--
-- 원장님 (2026-08-24) — 「독해/문법/영작 순서를 먼저 놓고, 그 안에서 루틴순서」
-- · 「교재학습 순서도 정할 수 있게 해줘」 · 「등원끼리, 숙제끼리 순서를 정해야
-- 의미가 있지 않아?」
--
-- 0154 는 항목 차례 한 겹만 담았다. 그런데 아이가 실제로 겪는 차례는 세 겹이다:
--
--   ① 영역   독해 → 문법 → 영작        students.area_order
--   ② 교재   그 영역 안에서 어느 책부터  student_textbooks.book_sort
--   ③ 항목   그 책의 루틴에서 무엇부터  student_textbooks.routine_order (0154)
--
-- ③ 은 **등원끼리 · 숙제끼리** 따로 센다. 한 줄에 섞어 담되 화면이 두 목록으로
-- 갈라 보여준다 — 등원 학습과 집 숙제는 하는 자리가 달라서, 섞인 차례는
-- 아무 뜻이 없다.
--
-- 영역 이름을 그대로 담는다(참조가 아니라). 영역은 교재에 적힌 글자일 뿐
-- 따로 표가 없고, 목록에 없는 영역은 뒤에 붙으므로 새 영역이 생겨도 안 깨진다.

alter table public.students
  add column if not exists area_order text[] not null default '{}';

alter table public.student_textbooks
  add column if not exists book_sort int not null default 0;

comment on column public.students.area_order is
  '이 학생의 영역 차례 (0155). 비어 있거나 목록에 없는 영역은 뒤로';
comment on column public.student_textbooks.book_sort is
  '그 영역 안에서 이 교재의 차례 (0155)';

create or replace function public.routine_order_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_order_on() to authenticated;
