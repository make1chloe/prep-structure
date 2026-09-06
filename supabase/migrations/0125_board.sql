-- 0125 · 보드 A 04 내신 자료 · 내 할 일 05 · 로드맵 08 · 진도 체크 열기(원장 쪽) — 칸 셋 · 표 하나 · 권한 · 규칙 줄 · 할 일 세우기 한 곳 · 되풀이 한 곳 · 판 넷. 한 번 더 돌려도 같다.
-- ⚠️ 내신은 파이프라인이 아니다(확정-㉟) — 마감만 있고 순서는 없다. 순서는 **자료 하나 안에서만**(만들기→인쇄→배부→풀이→채점). 할 일은 종류가 바깥 축(0014).
--    할 일은 자료를 세울 때 **저절로** 선다(만들기·인쇄·배부 — 영어 시험일에서 거꾸로 N일, 규칙 줄) · 시험일이 밀리면 날짜도 밀린다(확정-㉛) · ♻️ 지난번 것이면 만들기가 끝난 채로 선다(확정-㊵).
--    아이가 제 진도를 찍는 문(0009·0052 세 겹)은 그대로 — 여기서는 원장이 켜고 끄는 문 · 확인·되돌리기 · ❗ 보기만 연다(확정-㊶).

-- ══ ① 규칙 줄 — 마감은 영어 시험일에서 거꾸로 센다. 화면(05 · 04)이 읽고, 자료를 세우는 함수가 쓴다
insert into v2.rule (key, value, note) values
  ('todo.make_days',      '14', '자료 「만들기」 마감 = 영어 시험일 − N일(확정-㉛ 시험 루틴 D-N · 목업 05). 영어일이 없으면 오늘 + N일. 시험일이 밀리면 같이 밀린다(sync_exam_todos)'),
  ('todo.print_days',     '7',  '「인쇄」 마감 = 영어 시험일 − N일'),
  ('todo.hand_days',      '5',  '「배부」 마감 = 영어 시험일 − N일'),
  ('todo.score_days',     '3',  '「성적 받기」 마감 = 영어 시험일 + N일(아이가 넣는다 — 16)'),
  ('todo.behind_per_day', '1',  '남은 자료가 「남은 날 × N」보다 많으면 「못 따라갑니다 — 줄이기」(목업 05 🔥)'),
  ('todo.repeat_lead',    '3',  '되풀이 할 일이 마감 며칠 전부터 서나(옛 앱 lead_days)')
on conflict (key) do nothing;

-- ══ ② 자료 나무 세 층(목업 04) — 자료(출처) › 갈래(자료 한 장 = v2.material) › 항목(v2.material_item). 출처는 종류의 칸, 항목은 이름 하나면 된다
alter table v2.material_type add column if not exists source text not null default '직접';
comment on column v2.material_type.source is '목업 04 나무의 첫 층 — 이그잼 · 클래스카드 · 직접. 같은 출처의 갈래가 한 묶음으로 선다(자료 N · 갈래 N · 항목 N)';
alter table v2.material_item add column if not exists name text;
comment on column v2.material_item.name is '자료 안의 항목 이름(목업 04 mt3 알약 「동사 형 변형」). 단원(unit_id)·학습 항목(item_id)으로 못 고르는 것은 이름만 적는다';
insert into v2.purge_map(tbl,col,how,note) values ('material_item','name','null','자료 항목 이름 — 아이 이름이 적힐 수 있다(파기 ⑨)') on conflict do nothing;

-- ══ ③ 아이 × 회차의 「학교 진도 — 어디까지 나갔나」(목업 04 학생별 표). 한 줄 = 이 아이가 이 회차에서 학교 진도가 어디까지인가 — 진도를 알아야 그때그때 낸다
create table if not exists v2.prep_student (
  exam_id uuid not null references v2.exams(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete cascade,
  school_prog text,
  updated_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);
comment on table v2.prep_student is '한 줄 = 「이 아이가 이 회차에서 학교 진도가 어디까지 나갔나」(목업 04 학생별 표). 비면 「진도를 알아야 냅니다」 — 앱이 짐작하지 않는다';
alter table v2.prep_student enable row level security;
alter table v2.prep_student force row level security;
drop policy if exists staff_all on v2.prep_student;
create policy staff_all on v2.prep_student for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.prep_student to authenticated, service_role;
drop trigger if exists prep_student_touch on v2.prep_student;
create trigger prep_student_touch before update on v2.prep_student for each row execute function v2.touch_row();
drop trigger if exists prep_student_audit on v2.prep_student;
create trigger prep_student_audit after insert or update or delete on v2.prep_student for each row execute function v2.audit_row();

-- ══ ④ 권한 — 규칙(staff_all, 0016)은 있는데 권한이 없던 표(0070 의 함정: 규칙과 권한은 짝이다)
grant insert, update on v2.material, v2.material_type, v2.material_item, v2.auto_rule, v2.auto_key, v2.day_ran to authenticated, service_role;

-- ══ ⑤ 진도 체크 열기(확정-㊶) — 원장이 켜고 끈다(학원 전체 progress_edit · 아이마다 students.progress_edit) · 아이가 찍은 줄 확인·되돌리기(progress 는 0107) · ❗ 이의는 보고 처분만(진도는 안 바꾼다)
drop policy if exists pe_staff on v2.progress_edit;
create policy pe_staff on v2.progress_edit for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant update on v2.progress_edit to authenticated, service_role;
grant update (progress_edit) on v2.students to authenticated;
drop policy if exists progress_flag_staff on v2.progress_flag;
create policy progress_flag_staff on v2.progress_flag for all to authenticated using (v2.is_staff()) with check (v2.is_staff());

-- ══ ⑥ 할 일을 자료에서 세운다 — 한 곳(정의자 · 학원 사람만). 종류의 단계(steps) 중 만들기·인쇄·배부만 할 일이 된다(풀이·채점은 아이 쪽 stage).
--    마감 = 영어 시험일 − 규칙 N일(영어일이 없으면 오늘 + N일). 이미 있으면 마감만 맞춘다(시험이 밀리면 날짜도 밀린다, 확정-㉛). ♻️ 지난번 것(reuse_of)이면 만들기는 끝난 채로(확정-㊵)
create or replace function v2.sync_material_todos(p_material uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare m record; e record; s text; due date; n int := 0; base date; t record; why_ text; days_ int; done_ boolean;
begin
  if not v2.is_staff() then raise exception '학원 사람만'; end if;
  select mt.*, ty.steps ty_steps, ty.name ty_name into m from v2.material mt join v2.material_type ty on ty.id = mt.type_id where mt.id = p_material;
  if not found then raise exception '자료가 없습니다'; end if;
  select ex.*, sc.name school_name into e from v2.exams ex left join v2.schools sc on sc.id = ex.school_id where ex.id = m.exam_id;
  base := coalesce(e.english_on, e.term_from);
  why_ := case when e.id is null then '자료에서 저절로' else format('시험 회차 %s %s에서 저절로', coalesce(e.school_name, '전국'), e.name) end;
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
comment on function v2.sync_material_todos(uuid) is '자료 한 장의 할 일(만들기·인쇄·배부)을 세우거나 마감을 맞춘다 — 자료를 더할 때 · 영어 시험일이 바뀔 때(sync_exam_todos) 부른다. 지우지 않는다';
grant execute on function v2.sync_material_todos(uuid) to authenticated, service_role;

create or replace function v2.sync_exam_todos(p_exam uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int := 0; m record;
begin
  if not v2.is_staff() then raise exception '학원 사람만'; end if;
  for m in select id from v2.material where exam_id = p_exam and state <> 'dropped' loop n := n + v2.sync_material_todos(m.id); end loop;
  return n;
end $$;
comment on function v2.sync_exam_todos(uuid) is '회차의 자료 전부의 할 일 마감을 영어 시험일에 다시 맞춘다 — 시험이 밀리면 날짜도 밀린다(확정-㉛). lib/schedule setEnglishOn 이 부른다';
grant execute on function v2.sync_exam_todos(uuid) to authenticated, service_role;

-- ══ ⑦ 되풀이 — 규칙(auto_rule kind repeat · threshold {"day": 25} 매달 / {"weekday": 1} 매주 · {"lead": 3} 며칠 전부터)이 걸리면 할 일 한 줄.
--    열쇠는 칸으로(뼈대-2: rule_id + base_date = 그 마감 날) — 글자로 잇지 않는다. 지난 마감은 안 만든다(옛 앱 dueTasks 와 같은 뜻). 크론(하루 정리)과 05 첫 열기가 부른다 — 하루 한 번(day_ran)
create or replace function v2.run_repeats(p_on date) returns int
language plpgsql security definer set search_path = v2, public as $$
declare r record; n int := 0; d int; lead_ int; due date; lastday int; wd int;
begin
  if not (v2.is_staff() or auth.uid() is null) then raise exception '학원 사람만'; end if;
  for r in select * from v2.auto_rule where kind = 'repeat' and active loop
    lead_ := coalesce((r.threshold->>'lead')::int, (select value from v2.rule where key = 'todo.repeat_lead')::int, 0);
    if r.threshold ? 'day' then
      d := (r.threshold->>'day')::int;
      lastday := extract(day from (date_trunc('month', p_on) + interval '1 month - 1 day'))::int;
      due := (date_trunc('month', p_on) + (least(d, lastday) - 1) * interval '1 day')::date;       -- 31일로 적어도 2월엔 28일(옛 앱 clampDay)
      if due < p_on then
        due := (date_trunc('month', p_on) + interval '1 month')::date;
        lastday := extract(day from (date_trunc('month', due) + interval '1 month - 1 day'))::int;
        due := (due + (least(d, lastday) - 1) * interval '1 day')::date;
      end if;
    elsif r.threshold ? 'weekday' then
      wd := (r.threshold->>'weekday')::int;
      due := p_on + (((wd - extract(dow from p_on)::int) + 7) % 7);
    else continue;
    end if;
    if due - lead_ > p_on then continue; end if;                                                  -- 아직 띄울 때가 아니다
    if exists (select 1 from v2.auto_key k where k.rule_id = r.id and k.base_date = due) then continue; end if;
    insert into v2.auto_key (rule_id, base_date) values (r.id, due);
    insert into v2.todo (kind, title, due_on, rule_id, why)
    values ('repeat', r.name, due, r.id,
            case when r.threshold ? 'day' then format('매달 %s일 — 저절로', d)
                 else format('매주 %s요일 — 저절로', (array['일','월','화','수','목','금','토'])[wd + 1]) end);
    n := n + 1;
  end loop;
  insert into v2.day_ran (kind, ran_on) values ('repeat', p_on) on conflict do nothing;
  return n;
end $$;
comment on function v2.run_repeats(date) is '되풀이 규칙이 오늘 걸리면 할 일 한 줄 — 열쇠는 (규칙, 마감 날). 하루 한 번(day_ran repeat). 크론과 05 첫 열기가 부른다';
grant execute on function v2.run_repeats(date) to authenticated, service_role;

-- ══ ⑧ 판 넷(한 벌 · 정의자) — 04 내신 자료 · 05 내 할 일 · 08 로드맵(제 아이만) · 원장 쪽 진도 체크. 세는 것(N명 · N장 · D-N)은 화면이 센다(대전제-5)
create or replace function v2.prep_board(p_exam uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school', sc.name, 'level', sc.level, 'grade', e.grade, 'name', e.name,
                'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'hidden', e.hidden,
                'takers', (select count(*) from v2.exam_takers(e.id)),
                'materials', (select count(*) from v2.material m where m.exam_id = e.id and m.state <> 'dropped'))
              order by coalesce(e.english_on, e.term_from), sc.name, e.grade), '[]'::jsonb)
              from v2.exams e left join v2.schools sc on sc.id = e.school_id
             where e.state = 'active' and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 60),
    'exam', (select jsonb_build_object('id', e.id, 'scope', e.scope, 'school', sc.name, 'school_id', e.school_id, 'level', sc.level, 'grade', e.grade, 'name', e.name,
                'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'hidden', e.hidden,
                'scopes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'book_id', p.book_id, 'book', b.name, 'unit_id', p.unit_id, 'chapter', u.chapter,
                                                                         'short', case when p.unit_id is null then null else v2.unit_label(u.id, false) end,
                                                                         'free_note', p.free_note, 'added_on', p.added_on, 'removed_on', p.removed_on) order by p.added_on, u.sort), '[]'::jsonb)
                             from v2.prep_scope p left join v2.books b on b.id = p.book_id left join v2.units u on u.id = p.unit_id where p.exam_id = e.id))
              from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.id = p_exam),
    'takers', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_prog', ps.school_prog, 'prog_at', ps.updated_at) order by st.name), '[]'::jsonb)
                 from v2.exam_takers(p_exam) t join v2.students st on st.id = t.student_id left join v2.schools sc on sc.id = st.school_id
                 left join v2.prep_student ps on ps.exam_id = p_exam and ps.student_id = st.id),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'type_id', m.type_id, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'title', m.title, 'state', m.state,
                    'reuse_of', m.reuse_of, 'made_at', m.made_at, 'printed_at', m.printed_at, 'created_at', m.created_at,
                    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', coalesce(i.name, case when i.unit_id is null then null else v2.unit_label(i.unit_id, false) end, li.name), 'unit_id', i.unit_id, 'item_id', i.item_id, 'sort', i.sort, 'done_at', i.done_at) order by i.sort, i.id), '[]'::jsonb)
                                from v2.material_item i left join v2.learn_items li on li.id = i.item_id where i.material_id = m.id),
                    'gives', (select coalesce(jsonb_agg(jsonb_build_object('student_id', g.student_id, 'name', st.name, 'handed_at', g.handed_at, 'got_at', g.got_at, 'stage', g.stage, 'due_on', g.due_on) order by st.name), '[]'::jsonb)
                                from v2.material_give g join v2.students st on st.id = g.student_id where g.material_id = m.id))
                  order by ty.source, ty.sort, ty.name, m.created_at), '[]'::jsonb)
                    from v2.material m join v2.material_type ty on ty.id = m.type_id where m.exam_id = p_exam),
    'reuse', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'type', ty.name, 'source', ty.source, 'title', m.title, 'state', m.state, 'made_on', coalesce(m.made_at, m.created_at)::date,
                 'exam', jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'english_on', e.english_on, 'term_from', e.term_from),
                 'used', (select count(*) from v2.material_give g where g.material_id = m.id),
                 'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                 'overlap', (select count(distinct p1.unit_id) from v2.prep_scope p1 join v2.prep_scope p2 on p2.unit_id = p1.unit_id
                              where p1.exam_id = p_exam and p1.removed_on is null and p2.exam_id = e.id and p2.removed_on is null),
                 'already', exists (select 1 from v2.material x where x.exam_id = p_exam and x.reuse_of = m.id))
               order by coalesce(m.made_at, m.created_at) desc), '[]'::jsonb)
                from v2.material m join v2.material_type ty on ty.id = m.type_id join v2.exams e on e.id = m.exam_id left join v2.schools sc on sc.id = e.school_id
               where m.exam_id <> p_exam and m.state <> 'dropped'
                 and exists (select 1 from v2.prep_scope p1 join v2.prep_scope p2 on p2.unit_id = p1.unit_id
                              where p1.exam_id = p_exam and p1.removed_on is null and p2.exam_id = e.id and p2.removed_on is null)),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'due_on', t.due_on, 'state', t.state, 'material_id', t.material_id, 'why', t.why, 'done_at', t.done_at) order by t.due_on, t.created_at), '[]'::jsonb)
                from v2.todo t where t.exam_id = p_exam),
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id', ty.id, 'name', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'sort', ty.sort) order by ty.sort, ty.name), '[]'::jsonb) from v2.material_type ty where ty.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'todo.%')
  ) where v2.is_staff()
$$;
comment on function v2.prep_board(uuid, date) is '내신 자료 04 가 읽는 한 벌 — 회차 목록(지난 두 달부터) · 고른 회차(범위) · 보는 아이(학교 진도) · 자료(갈래 · 항목 · 배정) · ♻️ 같은 범위로 지난번에 만든 것 · 여기서 생긴 할 일 · 자료 종류 · todo.* 규칙. 세는 것(자료 N · 갈래 N · 항목 N)은 화면이 센다';
grant execute on function v2.prep_board(uuid, date) to authenticated, service_role;

create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at,
                 'student_id', t.student_id, 'student', st.name, 'student_school_id', st.school_id, 'student_school', ssc.name,
                 'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                                                                             'takers', (select count(*) from v2.exam_takers(e.id))) end,
                 'material', case when m.id is null then null else jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done')) end,
                 'rule', r.name)
               order by t.due_on nulls last, t.due_time nulls last, t.created_at), '[]'::jsonb)
                from v2.todo t left join v2.students st on st.id = t.student_id left join v2.schools ssc on ssc.id = st.school_id
                left join v2.exams e on e.id = t.exam_id left join v2.schools esc on esc.id = e.school_id
                left join v2.material m on m.id = t.material_id left join v2.material_type ty on ty.id = m.type_id
                left join v2.auto_rule r on r.id = t.rule_id
               where t.state in ('todo', 'doing') or t.updated_at >= (p_on - 30)::timestamptz),
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'student_id', u.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'topic', gt.name, 'q_count', u.q_count, 'assigned_on', u.assigned_on, 'state', u.state,
                      'next_class', (select min(d.date) from v2.student_days(u.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) order by u.assigned_on, st.name), '[]'::jsonb)
                     from v2.unit_test u join v2.students st on st.id = u.student_id left join v2.schools sc on sc.id = st.school_id left join v2.grammar_topics gt on gt.id = u.topic_id
                    where u.state = 'todo'),
    'retests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'student_id', q.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'kind', q.kind, 'total', q.total, 'assigned_on', q.assigned_on,
                      'book', b.name, 'unit', case when q.unit_from is null then null else v2.unit_label(q.unit_from, false) end, 'free_note', q.free_note, 'style', qs.text,
                      'pct', o.pct, 'harder', q.harder) order by q.assigned_on, st.name), '[]'::jsonb)
                  from v2.quiz q join v2.students st on st.id = q.student_id left join v2.schools sc on sc.id = st.school_id left join v2.books b on b.id = q.book_id
                  left join v2.quiz_style qs on qs.id = q.style_id left join v2.quiz o on o.id = q.retry_of
                 where q.state = 'planned' and q.retry_of is not null),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'school_id', e.school_id, 'level', sc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                      'takers', (select count(*) from v2.exam_takers(e.id)),
                      'scored', (select count(*) from v2.score s where s.exam_id = e.id and s.student_id in (select student_id from v2.exam_takers(e.id)))) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                 from v2.exams e left join v2.schools sc on sc.id = e.school_id
                where e.state = 'active' and not e.hidden and coalesce(e.english_on, e.term_to, e.term_from) between p_on - 45 and p_on + 45),
    'repeats', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'threshold', r.threshold, 'active', r.active) order by r.name), '[]'::jsonb) from v2.auto_rule r where r.kind = 'repeat'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active' and exists (select 1 from v2.students st where st.school_id = s.id and st.state = 'active')),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade) order by st.name), '[]'::jsonb) from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.sort, g.name), '[]'::jsonb) from v2.grammar_topics g),
    'exams_soon', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'english_on', e.english_on, 'term_from', e.term_from,
                       'materials', (select count(*) from v2.material m where m.exam_id = e.id and m.state <> 'dropped')) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                     from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.state = 'active' and not e.hidden and coalesce(e.term_to, e.english_on, e.term_from) >= p_on),
    'repeat_ran', exists (select 1 from v2.day_ran d where d.kind = 'repeat' and d.ran_on = p_on),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'todo.%')
  ) where v2.is_staff()
$$;
comment on function v2.todo_board(date) is '내 할 일 05 가 읽는 한 벌 — 할 일 줄(하는 것 전부 + 지난 30일의 끝낸·뺀 것 · 아이·회차·자료·규칙 붙여) · 단원평가 낼 것 · 재시험 줄 · 성적 받을 회차(보는 아이 · 낸 아이) · 되풀이 규칙 · 학교 · 아이 · 문법 분류 · 다가오는 회차 · 오늘 되풀이 돌았나 · todo.* 규칙. 칸·표 보기는 이 한 벌을 그 자리에서 다르게 그린다(속도-1 예외)';
grant execute on function v2.todo_board(date) to authenticated, service_role;

create or replace function v2.road_board(p_student uuid, p_book uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with sb as (select * from v2.student_book where student_id = p_student and book_id = p_book and from_date <= p_on and (to_date is null or to_date >= p_on) order by from_date desc limit 1)
  select jsonb_build_object(
    'today', p_on,
    'student', (select jsonb_build_object('id', st.id, 'name', st.name, 'progress_edit', st.progress_edit) from v2.students st where st.id = p_student),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('book_id', x.book_id, 'name', b.name, 'area', b.area::text, 'round', x.round, 'stop_mode', x.stop_mode, 'stop_from', x.stop_from, 'stop_until', x.stop_until, 'per_session', x.per_session) order by x.from_date desc, b.name), '[]'::jsonb)
                from (select distinct on (book_id) * from v2.student_book where student_id = p_student and from_date <= p_on and (to_date is null or to_date >= p_on) order by book_id, from_date desc) x join v2.books b on b.id = x.book_id),
    'book', (select jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text, 'order_basis', coalesce((select order_basis from sb), b.order_basis), 'chunk_depth', b.chunk_depth) from v2.books b where b.id = p_book),
    'sb', (select to_jsonb(sb) from sb),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'mid', u.mid, 'sub', u.sub, 'activity', u.activity, 'is_workbook', u.is_workbook, 'sort', u.sort, 'short', v2.unit_label(u.id, false)) order by u.sort), '[]'::jsonb)
                from v2.units u where u.book_id = p_book and u.state = 'active'),
    'progress', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', p.unit_id, 'status', p.status, 'last_by', p.last_by, 'confirmed', p.confirmed, 'marked_on', p.marked_on, 'done_on', p.done_on)), '[]'::jsonb)
                   from v2.progress p join v2.units u on u.id = p.unit_id where p.student_id = p_student and u.book_id = p_book and p.round = coalesce((select round from sb), 1)),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'unit_id', f.unit_id, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false), 'kind', f.kind, 'said', f.said, 'raised_at', f.raised_at, 'seen_at', f.seen_at, 'outcome', f.outcome) order by f.raised_at desc), '[]'::jsonb)
                from v2.progress_flag f join v2.units u on u.id = f.unit_id where f.student_id = p_student and u.book_id = p_book),
    'edit', jsonb_build_object('academy_open', (select is_open from v2.progress_edit where scope = 'academy'), 'opened_on', (select opened_on from v2.progress_edit where scope = 'academy'), 'can_edit', v2.can_edit_progress(p_student)),
    'days', (select coalesce(jsonb_agg(d.date order by d.date), '[]'::jsonb) from v2.student_days(p_student, p_on, p_on + 400) d where d.kind in ('class', 'makeup')),
    'remaining', (select count(*) from v2.todo_units(p_student, p_book, p_on))
  ) where v2.is_staff() or p_student in (select v2.my_own_student())
$$;
comment on function v2.road_board(uuid, uuid, date) is '로드맵 08 이 읽는 한 벌 — 제 아이(또는 학원 사람)만. 배정 교재들(상태) · 고른 교재의 소단원 · 이 회독의 진도(누가 찍었나 · 확인됐나) · ❗ 이의 · 진도 체크 열림(학원 · 이 아이) · 앞으로의 수업일(이대로면) · 남은 소단원. 진도 나무는 표 하나 · 보기 넷(확정-51)';
grant execute on function v2.road_board(uuid, uuid, date) to authenticated, service_role;

create or replace function v2.progress_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'edit', (select jsonb_build_object('is_open', e.is_open, 'opened_on', e.opened_on, 'updated_at', e.updated_at) from v2.progress_edit e where e.scope = 'academy'),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school', sc.name, 'grade', st.grade, 'progress_edit', st.progress_edit,
                    'pending', (select count(*) from v2.progress p where p.student_id = st.id and not p.confirmed),
                    'flags', (select count(*) from v2.progress_flag f where f.student_id = st.id and f.seen_at is null)) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'pending', (select coalesce(jsonb_agg(jsonb_build_object('student_id', p.student_id, 'student', st.name, 'unit_id', p.unit_id, 'round', p.round, 'status', p.status, 'marked_on', p.marked_on, 'updated_at', p.updated_at,
                    'book', b.name, 'book_id', b.id, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false)) order by p.updated_at desc), '[]'::jsonb)
                  from v2.progress p join v2.students st on st.id = p.student_id join v2.units u on u.id = p.unit_id join v2.books b on b.id = u.book_id where not p.confirmed),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'student_id', f.student_id, 'student', st.name, 'unit_id', f.unit_id, 'round', f.round, 'kind', f.kind, 'said', f.said, 'raised_at', f.raised_at,
                    'book', b.name, 'book_id', b.id, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false),
                    'status', (select p.status from v2.progress p where p.student_id = f.student_id and p.unit_id = f.unit_id and p.round = f.round)) order by f.raised_at), '[]'::jsonb)
                from v2.progress_flag f join v2.students st on st.id = f.student_id join v2.units u on u.id = f.unit_id join v2.books b on b.id = u.book_id where f.seen_at is null)
  ) where v2.is_staff()
$$;
comment on function v2.progress_board(date) is '원장 쪽 진도 체크(목업 08 아래 · 확정-㊶) — 열림(학원 · 켠 날) · 아이마다(따라감·켬·끔 · 확인 안 한 것 N · ❗ N) · 아이가 찍은 줄 전부 · 안 본 ❗ 전부(지금 상태 붙여). 확인·되돌리기·처분은 lib/progress.js 한 벌';
grant execute on function v2.progress_board(date) to authenticated, service_role;

-- ══ ⑨ 대시보드 「안 돌고 있는 것」에 진도 체크 열림 띠를 얹는다(남긴 것 11 · 확정-㊶ 「N일째 열려 있습니다」) — 조회를 안 늘리려고 dash_ops 에(속도-상한 대시보드 20). 반환 꼴이 바뀌어 지웠다 다시 세운다
drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int)
language sql stable security definer set search_path = v2, public as $$
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null),
         (select is_open from v2.progress_edit where scope = 'academy'),
         (select opened_on from v2.progress_edit where scope = 'academy'),
         (select count(*)::int from v2.progress where not confirmed),
         (select count(*)::int from v2.progress_flag where seen_at is null)
   where v2.is_staff()
$$;
comment on function v2.dash_ops(date) is
  '대시보드 「안 돌고 있는 것」 — 하루 정리가 마지막으로 돈 날(day_ran queue) · 큐 실패·대기 수 · 클래스카드 마지막 수신 · 오늘 마감한 판 수 · 진도 체크 열림(켠 날 · 확인 안 한 것 · ❗). 학원 사람이 아니면 0줄';
grant execute on function v2.dash_ops(date) to authenticated, service_role;
