-- 0148 (너)(2026-09-09 — 원장님 「강사조교는 다 봐도 되고 학생학부모는 따로 권한두기」): 학교별 표 06c 를 아이·학부모 화면에도.
--   · 강사·조교는 지금처럼 일정 권한이면 본다(칸 안 늘림) · 학생·학부모는 「누가 무엇을 보나」의 새 칸(me.grid · parent.grid — lib/perm.js · 값은 0088 v2.role_access · 안 정함이면 막힘)
--   · 무엇을 보이나는 표마다 「아이·학부모 공개」 스위치(grid.share · 기본 끔 — 「학교별 특이사항」 같은 내부 표가 안 샌다) · 학교 줄 표만 · 그 아이 학교 줄만
--   · 아이 쪽 한 벌 grid_mine(p_student): 본인 · 그 아이의 학부모(my_students) · 학원 사람만. grid_board 는 share 를 싣는다(마지막 정의 0131 을 다시 냄 — cells_at(0-3 대조) 그대로 · 처음엔 0126 을 베껴 cells_at 을 잃었고 check-rules-db 가 잡았다 → check-redefine)
--   · 멱등: add column if not exists · create or replace
alter table v2.grid add column if not exists share boolean not null default false;
comment on column v2.grid.share is '아이·학부모 공개 — 켜면 학교 줄 표의 그 아이 학교 줄이 07·09 「우리 학교」 카드에 보인다(누가 보나는 role_access me.grid · parent.grid). 기본 끔(특이사항 같은 내부 표가 안 샌다) — (너) 0148';

create or replace function v2.grid_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'me', auth.uid(),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'rows', g.rows, 'template', g.template, 'sort', g.sort, 'state', g.state, 'board_col', g.board_col, 'created_by', g.created_by, 'created_at', g.created_at, 'share', g.share,
                 'cols', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'type', c.type, 'options', c.options, 'sort', c.sort, 'state', c.state) order by c.sort, c.id), '[]'::jsonb) from v2.grid_col c where c.grid_id = g.id),
                 'rows_', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'school_id', r.school_id, 'school', sc.name, 'level', sc.level, 'student_id', r.student_id, 'student', st.name, 'student_school', ssc.name, 'grade', st.grade, 'label', r.label, 'sort', r.sort, 'state', r.state,
                              'cells', (select coalesce(jsonb_object_agg(x.col_id, x.value), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id),
                              'cells_at', (select coalesce(jsonb_object_agg(x.col_id, x.updated_at), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id)) order by r.sort, r.created_at), '[]'::jsonb)
                            from v2.grid_row r left join v2.schools sc on sc.id = r.school_id left join v2.students st on st.id = r.student_id left join v2.schools ssc on ssc.id = st.school_id where r.grid_id = g.id))
               order by g.sort, g.created_at), '[]'::jsonb) from v2.grid g),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade) order by st.name), '[]'::jsonb) from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b where b.state = 'active'),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from) order by coalesce(e.english_on, e.term_from) desc), '[]'::jsonb)
                from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.state = 'active' and not e.hidden and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 180),
    'watch', (select coalesce(jsonb_agg(jsonb_build_object('student_id', w.student_id, 'name', st.name, 'school', sc.name, 'note', w.note, 'updated_at', w.updated_at) order by w.updated_at desc), '[]'::jsonb)
                from v2.student_watch w join v2.students st on st.id = w.student_id left join v2.schools sc on sc.id = st.school_id)
  ) where v2.is_staff()
$$;
comment on function v2.grid_board(date) is '학교별 표 06c 가 읽는 한 벌 — 표 전부(칸 · 줄 · 셀 · 내린 것 포함 — 화면이 거른다 · (너) 공개 스위치 share) · 학교 · 재원생 · 교재 · 회차(고르기 목록) · 따로 챙길 아이들 · 나(내 표/전체 표). 표·보드 보기는 이 한 벌을 그 자리에서 다르게 그린다(속도-1 예외)';
grant execute on function v2.grid_board(date) to authenticated, service_role;

create or replace function v2.grid_mine(p_student uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'student', p_student,
    'school', (select jsonb_build_object('id', sc.id, 'name', sc.name, 'level', sc.level) from v2.students st join v2.schools sc on sc.id = st.school_id where st.id = p_student),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'template', g.template, 'sort', g.sort,
                 'cols', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'type', c.type, 'options', c.options, 'sort', c.sort) order by c.sort, c.id), '[]'::jsonb) from v2.grid_col c where c.grid_id = g.id and c.state = 'active'),
                 'rows_', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'school', sc.name, 'sort', r.sort,
                              'cells', (select coalesce(jsonb_object_agg(x.col_id, x.value), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id)) order by r.sort, r.created_at), '[]'::jsonb)
                            from v2.grid_row r join v2.schools sc on sc.id = r.school_id
                            where r.grid_id = g.id and r.state = 'active' and r.school_id = (select st.school_id from v2.students st where st.id = p_student)))
               order by g.sort, g.created_at), '[]'::jsonb)
               from v2.grid g where g.state = 'active' and g.share and g.rows = 'school'),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb) from v2.books b),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name) order by e.name), '[]'::jsonb) from v2.exams e left join v2.schools sc on sc.id = e.school_id),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'short', u.short, 'label', u.label)), '[]'::jsonb) from v2.units u
                where u.id in (select (x.value->>'id')::uuid from v2.grid_cell x join v2.grid_col c on c.id = x.col_id join v2.grid_row r on r.id = x.row_id join v2.grid g on g.id = r.grid_id
                               where g.share and c.type = 'pick' and jsonb_typeof(x.value) = 'object' and (x.value->>'id') ~ '^[0-9a-f-]{36}$'))
  ) where v2.is_staff() or p_student in (select v2.my_students())
$$;
comment on function v2.grid_mine(uuid) is '아이·학부모 「우리 학교」 카드(07·09)가 읽는 한 벌 — 공개(share)한 학교 줄 표만 · 그 아이 학교 줄만 · 살아 있는 칸·줄만 · 고르기 목록(교재·회차 전부 · 단원은 쓰인 것만). 본인 · 그 아이의 학부모 · 학원 사람만(아니면 null) — (너) 0148';
grant execute on function v2.grid_mine(uuid) to authenticated, service_role;
