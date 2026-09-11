-- 0160 — 표-9 「아이가 값을 쓰는 자리에는 DB 쪽 잠금」을 **남은 두 표**에도((사2) 2026-09-11)
--
--  왜: day_item·material_give 에는 「그 한 칸만 빼고 비교해 다르면 거절」 트리거가 있었는데
--      score·file_link 은 접근 규칙(RLS)만 있고 **바꿀 수 있는 칸을 안 묶어** 두었다.
--      RLS 의 with_check 는 「바뀐 뒤 줄」만 본다 — 그래서 아이가 제 줄을 집어
--        · score: student_id·exam_id 를 **남의 것으로 옮겨** 제 점수를 남에게 붙일 수 있었고
--        · file_link: day_item_id 를 **남의 숙제 줄로** 돌려놓을 수 있었다(with_check 가 true 였다).
--      둘 다 화면에는 그런 길이 없지만, 표-9 는 「화면에 없다」가 아니라 **DB 가 막는다**는 규칙이다.
--  무엇: day_item_child_guard 와 **같은 꼴**의 트리거 둘(허용 목록이 아니라 **차이 비교**).
--        서버 자신(크론·마이그레이션·검사)과 학원 사람은 그대로 지나간다.
--  되돌리기: drop trigger … ; drop function … ;  (표는 안 건드린다)

begin;

-- ① 성적 — 아이는 **제가 넣는 값**만. 누구 것인지(student_id)·어느 시험인지(exam_id)·확인 도장은 못 만진다
create or replace function v2.score_child_guard() returns trigger language plpgsql security definer set search_path = v2, public as $$
begin
  if auth.uid() is null then return new; end if;          -- 서버 자신(크론·마이그레이션)은 지나간다
  if v2.is_staff() then return new; end if;               -- 학원 사람은 그대로
  if (to_jsonb(new) - 'raw' - 'full_score' - 'note' - 'updated_at')
     is distinct from (to_jsonb(old) - 'raw' - 'full_score' - 'note' - 'updated_at') then
    raise exception '아이는 제 점수(원점수·만점·메모)만 고칠 수 있다 (score) — 누구 것인지·어느 시험인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists score_child_guard on v2.score;
create trigger score_child_guard before update on v2.score for each row execute function v2.score_child_guard();
comment on function v2.score_child_guard() is '표-9 — 아이는 원점수·만점·메모만. student_id·exam_id·confirmed 는 못 바꾼다(0160)';

-- ② 숙제에 붙은 파일 — 아이는 **봤다는 표시**만. 어느 숙제·어느 파일인지는 못 돌린다(with_check 가 true 였다)
create or replace function v2.file_link_child_guard() returns trigger language plpgsql security definer set search_path = v2, public as $$
begin
  if auth.uid() is null then return new; end if;
  if v2.is_staff() then return new; end if;
  if (to_jsonb(new) - 'seen_by_child' - 'seen_at')
     is distinct from (to_jsonb(old) - 'seen_by_child' - 'seen_at') then
    raise exception '아이는 「봤음/안 보기」 표시만 할 수 있다 (file_link) — 어느 숙제에 붙은 파일인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists file_link_child_guard on v2.file_link;
create trigger file_link_child_guard before update on v2.file_link for each row execute function v2.file_link_child_guard();
comment on function v2.file_link_child_guard() is '표-9 — 아이는 seen_by_child·seen_at 만(0160)';

insert into v2.migration (file, sha) values ('0160_child_guard.sql', 'x') on conflict (file) do nothing;

commit;

notify pgrst, 'reload schema';
