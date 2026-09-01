-- ─────────────────────────────────────────────────────────────
-- 0014 · 운영 — 수강료 · 성적 · 상담 · 신규 · 할 일 · 영상
-- ⚠️ 회차는 **「8회를 채웠나」**이지 수강료 계산이 아니다(원장님 정정).
--    세어 나오는 값이라 **저장하지 않는다** — 반 요일 + 달력 − 휴강.
-- ─────────────────────────────────────────────────────────────
create table v2.fee_rule (               -- 돈의 이력 — 「언제부터 얼마」
  id uuid primary key default gen_random_uuid(),
  student_id uuid references v2.students(id) on delete restrict,
  class_id uuid references v2.classes(id) on delete restrict,
  from_date date not null, to_date date,
  amount int not null, base_sessions smallint default 8,
  per_session boolean not null default false,        -- 특강은 회차만큼 받는다
  created_at timestamptz not null default now()
);
create table v2.payment (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  ym char(7) not null, amount int, paid_on date, method text, note text,
  source text, import_batch v2.batch,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (student_id, ym)
);
comment on column v2.payment.amount is '⚠️ 비면 **0원이 아니라 「아직 안 적음」**이다. 청구를 안 만든다';

create table v2.holiday (                -- 휴강 — 회차에서 빠진다 (결석은 안 빠진다)
  id uuid primary key default gen_random_uuid(),
  date date not null, class_id uuid references v2.classes(id) on delete cascade,
  reason text, unique nulls not distinct (date, class_id)
);
create table v2.makeup (                 -- 보강 — 원장님이 달력에서 아무 날이나
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  of_date date, on_date date, at_time time, state text not null default 'todo'
    check (state in ('todo','set','done','waived')),
  created_at timestamptz not null default now()
);

create table v2.score (                  -- 성적 — 아이가 넣고 원장님이 확인
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  exam_id uuid references v2.exams(id) on delete restrict,
  kind text not null check (kind in ('school','mock','unit')),
  taken_on date, subject text default '영어',
  raw int, full_score int, grade smallint, percentile numeric(5,2),
  by_who text not null default 'staff' check (by_who in ('staff','student')),  -- 옛 앱의 source='form'
  confirmed boolean not null default false,
  show_to text not null default 'staff' check (show_to in ('staff','student','parent','both')),
  note text, import_batch v2.batch,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table v2.score_wrong (             -- 문항별 오답 — 아이가 넣는다
  score_id uuid not null references v2.score(id) on delete cascade,
  q_no int not null, kind text, primary key (score_id, q_no)
);

create table v2.consult (                 -- 상담일지 — **원장만**
  id uuid primary key default gen_random_uuid(),
  student_id uuid references v2.students(id) on delete restrict,
  at timestamptz not null default now(), way text, body text,
  created_by uuid references v2.profiles(id), import_batch v2.batch
);
create table v2.inquiry (                 -- 신규 문의 — 전화 끊고 바로
  id uuid primary key default gen_random_uuid(),
  name text, phone text, school text, grade smallint, way text,
  stage text not null default 'new' check (stage in ('new','test','visit','joined','dropped')),
  body text, student_id uuid references v2.students(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table v2.todo (                    -- 할 일 — **종류가 바깥 축**(원장님 9/2)
  id uuid primary key default gen_random_uuid(),
  kind text not null,                     -- make·print·hand·unit_test·retest·score·repeat
  title text not null, note text,
  student_id uuid references v2.students(id) on delete cascade,
  exam_id uuid references v2.exams(id) on delete cascade,
  material_id uuid references v2.material(id) on delete cascade,
  due_on date, due_time time,
  state text not null default 'todo' check (state in ('todo','doing','done','dropped')),
  done_at timestamptz,
  why text,                               -- 자동으로 생긴 것은 「왜 생겼는지」
  rule_id uuid references v2.auto_rule(id) on delete set null,
  private boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table v2.video (
  id uuid primary key default gen_random_uuid(),
  title text not null, url text not null, folder text, seconds int,
  state text not null default 'active' check (state in ('active','hidden'))
);
create table v2.video_view (              -- 실제로 지나간 구간만 센다
  video_id uuid not null references v2.video(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete cascade,
  spans int4range[], last_pos int, done_at timestamptz,
  updated_at timestamptz not null default now(), primary key (video_id, student_id)
);
do $$ declare t text; begin
  foreach t in array array['payment','score','inquiry','todo'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t); end loop;
  foreach t in array array['fee_rule','payment','holiday','makeup','score','score_wrong',
                           'consult','inquiry','todo','video'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
create index on v2.todo (kind, state, due_on);
insert into v2.purge_map(tbl,col,how,note) values
  ('consult','body','null','상담 내용'),
  ('inquiry','name','mask',null),('inquiry','phone','null',null),('inquiry','body','null',null),
  ('score','note','null',null),('todo','note','null',null),('payment','note','null',null)
on conflict do nothing;
