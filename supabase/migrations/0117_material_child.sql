-- 0117 — 아이가 받을 교재·학습지(v2.material_give)에 쓰는 자리의 DB 쪽 잠금(표-9 · 표-10) — 07-2 ①
-- 왜: child_got(0016)이 아이에게 update 를 열어 두었는데 **어느 칸이든** 고칠 수 있다 — handed_at(원장이 나눠 준 때)까지.
--     규칙 표-9 「그 한 칸만 빼고 비교해 다르면 거절」로 잠근다: 아이는 stage(아직·받음·하는 중·완료)와 due_on(스스로 정한 마감)만.
--     got_at(받았다고 찍은 때)은 서버가 정한다 — stage 가 처음 none 을 벗어날 때 now().
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
create or replace function v2.material_give_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  if 누구 is null then return new; end if;        -- 검사·마이그레이션·크론
  if v2.is_staff() then return new; end if;       -- 학원 사람은 다 고친다
  if not (new.student_id in (select v2.my_own_student())) then
    raise exception '내 것이 아니면 못 건드린다 (material_give)' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'stage' - 'due_on' - 'got_at') is distinct from (to_jsonb(old) - 'stage' - 'due_on' - 'got_at') then
    raise exception '아이는 단계와 마감 날짜만 바꾼다 (material_give)' using errcode = '42501';
  end if;
  if old.stage = 'none' and new.stage <> 'none' and old.got_at is null then new.got_at := now();   -- 받았다고 찍은 때는 서버가(표-10)
  else new.got_at := old.got_at; end if;
  return new;
end $$;
drop trigger if exists material_give_child_guard on v2.material_give;
create trigger material_give_child_guard before update on v2.material_give
  for each row execute function v2.material_give_child_guard();
comment on function v2.material_give_child_guard() is
  '아이의 받을 학습지 문지기(표-9·표-10) — 내 것만 · stage·due_on 만 · got_at 은 서버가. 학원 사람·검사는 지나간다';

-- 학부모는 못 고친다(0084 ㉑ 과 같은 결) — child_got 이 my_students() 라 학부모도 들어 있었다
drop policy if exists child_got on v2.material_give;
create policy child_got on v2.material_give for update to authenticated
  using (student_id in (select v2.my_own_student()))
  with check (student_id in (select v2.my_own_student()));
