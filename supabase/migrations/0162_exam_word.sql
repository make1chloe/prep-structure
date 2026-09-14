-- 0162 (어18) 「회차」는 수업 회차만 — 학교 시험 한 건은 「시험」(원장님 2026-09-14 「나는 회차를 수업 회차를 세는데만 써. 시험고르기로 바꾸든 용어를 바꿔」).
--   할 일 05 카드의 까닭 글 「시험 회차 %s %s에서 저절로」(0125 sync_material_todos)를 「시험 %s %s에서 저절로」로 — 함수 한 벌의 글자 하나와 이미 선 줄.
--   표·칸·함수 이름은 그대로(코드 이름은 원래 exam). 멱등 — 두 번 돌려도 같다.
create or replace function v2.sync_material_todos(p_material uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare m record; e record; s text; due date; n int := 0; base date; t record; why_ text; days_ int; done_ boolean;
begin
  if not v2.is_staff() then raise exception '학원 사람만'; end if;
  select mt.*, ty.steps ty_steps, ty.name ty_name into m from v2.material mt join v2.material_type ty on ty.id = mt.type_id where mt.id = p_material;
  if not found then raise exception '자료가 없습니다'; end if;
  select ex.*, sc.name school_name into e from v2.exams ex left join v2.schools sc on sc.id = ex.school_id where ex.id = m.exam_id;
  base := coalesce(e.english_on, e.term_from);
  why_ := case when e.id is null then '자료에서 저절로' else format('시험 %s %s에서 저절로', coalesce(e.school_name, '전국'), e.name) end;   -- (어18) 「시험 회차」 → 「시험」
  foreach s in array m.ty_steps loop
    if s not in ('make', 'print', 'hand') then continue; end if;
    days_ := (select value from v2.rule where key = 'todo.' || s || '_days')::int;
    due := case when base is null then v2.today() + coalesce(days_, 0) else base - coalesce(days_, 0) end;
    done_ := (s = 'make' and (m.reuse_of is not null or m.state <> 'todo')) or (s = 'print' and m.state in ('printed', 'done')) or (s = 'hand' and m.state = 'done');
    select * into t from v2.todo where material_id = p_material and kind = s order by created_at limit 1;
    if found then
      if t.state in ('todo', 'doing') and t.due_on is distinct from due then update v2.todo set due_on = due where id = t.id; n := n + 1; end if;
    else
      insert into v2.todo (kind, title, exam_id, material_id, due_on, state, done_at, why)
      values (s, case when m.title = m.ty_name then m.ty_name else m.ty_name || ' · ' || m.title end, m.exam_id, p_material, due,   -- 제목이 종류 이름 그대로면 한 번만
              case when done_ then 'done' else 'todo' end, case when done_ then now() else null end,
              case when s = 'make' and m.reuse_of is not null then '♻️ 지난번 것 — 만들기가 끝난 채로 섰습니다(확정-㊵)' else why_ end);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
comment on function v2.sync_material_todos(uuid) is '자료 한 장의 할 일(만들기·인쇄·배부)을 세우거나 마감을 맞춘다 — 자료를 더할 때 · 영어 시험일이 바뀔 때(sync_exam_todos) 부른다. 지우지 않는다. (어18) 까닭 글은 「시험 …에서 저절로」';
grant execute on function v2.sync_material_todos(uuid) to authenticated, service_role;

-- 이미 선 줄의 까닭 글도 같은 말로(멱등 — 「시험 회차 」로 시작하는 줄만)
update v2.todo set why = '시험 ' || substr(why, length('시험 회차 ') + 1) where why like '시험 회차 %에서 저절로';
