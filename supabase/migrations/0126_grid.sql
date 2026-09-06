-- 0126 · 표 06c 「학교별 표 — 표 하나에 보기 둘」(확정-56 · 원장님 9/3 「같은 줄」 · 9/5 ㉒ 보기 전환은 조회 0) — 표 넷(표 · 칸 · 줄 · 셀) + 따로 챙길 아이들 메모 + 판 하나. 한 번 더 돌려도 같다.
-- ⚠️ 칸 종류는 여섯 — 글 · 날짜 · 선택 · 예/아니오 · 체크 목록 · 「앱에서 고르기」(교재 · 시험 회차 · 단원). 앱에 있는 것을 글로 치면 오타가 새 항목이 된다(확정-56).
--    보드(칸반)는 「선택」 칸 하나로 묶어 본 것 — 카드 = 줄, 옮기면 그 칸 값이 바뀐다(같은 값 한 벌, 원칙-1). 줄·칸·표의 ✕ 는 「안 씀」으로 내린다(대전제-6).
create table if not exists v2.grid (
  id uuid primary key default gen_random_uuid(),
  label text not null,                                     -- 표 이름(학교별 교재 …)
  rows text not null default 'school' check (rows in ('school', 'student', 'free')),   -- 줄이 무엇인가
  template text,                                           -- 어느 본에서 만들었나(scope·progress·calendar·books·notes·blank)
  sort int not null default 0,
  state text not null default 'active' check (state in ('active', 'retired')),
  created_by uuid references v2.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table v2.grid is '한 줄 = 「원장님이 만든 표 하나」(목업 06c — 학교별 시험범위·학생별 진도체크·학교별 학사일정·학교별 교재·특이사항·빈 표). 줄은 학교이거나 학생이거나 자유, 칸은 원장님이 만든다. 지우지 않고 retired';
create table if not exists v2.grid_col (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references v2.grid(id) on delete cascade,
  label text not null,
  type text not null check (type in ('text', 'date', 'select', 'yn', 'checklist', 'pick')),
  options jsonb not null default '[]'::jsonb,              -- select: ["만들기","인쇄"] · pick: {"of":"book"|"exam"|"unit"}
  sort int not null default 0,
  state text not null default 'active' check (state in ('active', 'retired'))
);
comment on table v2.grid_col is '한 줄 = 「표의 칸 하나」(이름 · 종류 여섯 · 선택지). 머리칸의 ⌄로 종류를 바꾼다 · ✕ 는 retired';
create table if not exists v2.grid_row (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references v2.grid(id) on delete cascade,
  school_id uuid references v2.schools(id) on delete restrict,
  student_id uuid references v2.students(id) on delete restrict,
  label text,                                              -- 자유 줄(빈 표)의 이름
  sort int not null default 0,
  state text not null default 'active' check (state in ('active', 'retired')),
  created_at timestamptz not null default now()
);
comment on table v2.grid_row is '한 줄 = 「표의 줄 하나」 — 학교(school_id) 또는 학생(student_id) 또는 자유 이름(label). 같은 학교가 두 줄일 수 있다(학년마다). ✕ 는 retired';
create table if not exists v2.grid_cell (
  row_id uuid not null references v2.grid_row(id) on delete cascade,
  col_id uuid not null references v2.grid_col(id) on delete cascade,
  value jsonb,                                             -- 글 "…" · 날짜 "YYYY-MM-DD" · 선택 "만들기" · 예/아니오 true/false · 체크 목록 [{"name","done"}] · 고르기 {"of","id","book_id"}
  updated_at timestamptz not null default now(),
  primary key (row_id, col_id)
);
comment on table v2.grid_cell is '한 줄 = 「줄 × 칸의 값 하나」. 값은 칸 종류대로(jsonb) — 보드에서 카드를 옮기면 선택 칸의 이 값이 바뀐다(같은 값 한 벌). 손을 떼면 저장 — 저장 단추가 없다';
create table if not exists v2.student_watch (
  student_id uuid primary key references v2.students(id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);
comment on table v2.student_watch is '한 줄 = 「따로 챙길 아이 하나의 메모」(목업 06c 표 위 띠). 학생 화면에는 안 보인다 · 손을 떼면 저장';
alter table v2.grid add column if not exists board_col uuid references v2.grid_col(id) on delete set null;   -- 보드로 볼 때 묶는 「선택」 칸(칸반 축)
comment on column v2.grid.board_col is '보드 보기의 축 — 「선택」 칸 하나. 없으면 표만 본다';
do $$ declare t text; begin
  foreach t in array array['grid', 'grid_col', 'grid_row', 'grid_cell', 'student_watch'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format('drop policy if exists staff_all on v2.%I', t);
    execute format($f$create policy staff_all on v2.%I for all to authenticated using (v2.is_staff()) with check (v2.is_staff())$f$, t);
    execute format('grant select, insert, update on v2.%I to authenticated, service_role', t);
  end loop;
  foreach t in array array['grid', 'grid_cell', 'student_watch'] loop
    execute format('drop trigger if exists %I_touch on v2.%I', t, t);
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()', t, t);
  end loop;
  foreach t in array array['grid', 'grid_col', 'grid_row', 'grid_cell', 'student_watch'] loop
    execute format('drop trigger if exists %I_audit on v2.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()', t, t);
  end loop;
end $$;
create index if not exists grid_row_grid_idx on v2.grid_row (grid_id, state, sort);
create index if not exists grid_col_grid_idx on v2.grid_col (grid_id, state, sort);
insert into v2.purge_map(tbl, col, how, note) values ('student_watch', 'note', 'null', '아이에 대한 메모(파기 ⑨)') on conflict do nothing;

-- ══ 판 한 벌(정의자 · 학원 사람만) — 표 전부(칸 · 줄(학교·학생 이름 붙여) · 셀) · 학교 · 재원생 · 교재 · 회차(앱에서 고르기의 목록) · 따로 챙길 아이들 · 나. 셈(표 N · 줄 N · 칸 N)은 화면이 센다
create or replace function v2.grid_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'me', auth.uid(),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'rows', g.rows, 'template', g.template, 'sort', g.sort, 'state', g.state, 'board_col', g.board_col, 'created_by', g.created_by, 'created_at', g.created_at,
                 'cols', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'type', c.type, 'options', c.options, 'sort', c.sort, 'state', c.state) order by c.sort, c.id), '[]'::jsonb) from v2.grid_col c where c.grid_id = g.id),
                 'rows_', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'school_id', r.school_id, 'school', sc.name, 'level', sc.level, 'student_id', r.student_id, 'student', st.name, 'student_school', ssc.name, 'grade', st.grade, 'label', r.label, 'sort', r.sort, 'state', r.state,
                              'cells', (select coalesce(jsonb_object_agg(x.col_id, x.value), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id)) order by r.sort, r.created_at), '[]'::jsonb)
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
comment on function v2.grid_board(date) is '학교별 표 06c 가 읽는 한 벌 — 표 전부(칸 · 줄 · 셀 · 내린 것 포함 — 화면이 거른다) · 학교 · 재원생 · 교재 · 회차(고르기 목록) · 따로 챙길 아이들 · 나(내 표/전체 표). 표·보드 보기는 이 한 벌을 그 자리에서 다르게 그린다(속도-1 예외)';
grant execute on function v2.grid_board(date) to authenticated, service_role;
