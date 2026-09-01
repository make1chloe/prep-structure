-- ─────────────────────────────────────────────────────────────
-- 0002 · 사람 · 학생 · 반 · 소속
--
-- 표마다 「무엇이 한 줄인가」를 적는다 (계획 0단계 1번).
-- 그 문장이 곧 열쇠다.
-- ─────────────────────────────────────────────────────────────

-- 한 줄 = 「로그인하는 사람 하나」 -------------------------------
create table v2.profiles (
  id           uuid primary key,                 -- auth.users.id 와 같다
  role         text not null check (role in ('principal','instructor','student','parent')),
  name         text not null,
  phone        text,
  state        text not null default 'active'
               check (state in ('active','paused','left')),   -- 지우지 않는다(대전제 6)
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table v2.profiles is '한 줄 = 로그인하는 사람 하나. 주인 = 이관 → 앱';

-- 한 줄 = 「우리 학원에 다니는 아이 하나」 ------------------------
create table v2.students (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references v2.profiles(id),  -- 계정이 없을 수도 있다
  name         text not null,
  school_id    uuid,                                     -- 0003 에서 학교 표가 온다
  grade        smallint,
  state        text not null default 'active'
               check (state in ('active','paused','left','prospect')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table v2.students is '한 줄 = 우리 학원에 다니는 아이 하나. prospect 는 아직 등록 전(리허설 fixture 포함)';

-- 한 줄 = 「이 어른이 이 아이의 보호자다」 ------------------------
create table v2.parent_student (
  parent_profile_id uuid not null references v2.profiles(id) on delete cascade,
  student_id        uuid not null references v2.students(id) on delete cascade,
  rel               text,
  import_batch      v2.batch,
  created_at        timestamptz not null default now(),
  primary key (parent_profile_id, student_id)
);
comment on table v2.parent_student is
  '한 줄 = 이 어른이 이 아이의 보호자다. ⚠️ 형제가 재원 중이면 학부모 계정을 못 지운다';

-- ─────────────────────────────────────────────────────────────
-- 반 — **이름으로 부르지 않는다** (원장님: 요일+시각이 곧 반)
-- ⚠️ 요일·시각을 **열쇠로 삼으면 안 된다** — 요일을 옮기는 순간
--    다른 반이 되어 버려 지난달 명단·회차·수강료가 끊긴다.
-- ─────────────────────────────────────────────────────────────
create table v2.classes (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'regular' check (kind in ('regular','special')),
  nickname     text,                                   -- 비어 있는 것이 정상
  state        text not null default 'active' check (state in ('active','closed')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table v2.classes is
  '한 줄 = 반 하나. **이름이 없다** — 화면 이름은 아래 요일·시각 이력에서 저절로 지어진다';

-- 한 줄 = 「이 반이 이 날부터 이 요일 이 시각이었다」 --------------
-- ⚠️ 회차가 여기서 나온다. 이력이 없으면 **지난달 청구액이 소급해 바뀐다**
create table v2.class_schedule (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references v2.classes(id) on delete cascade,
  from_date  date not null,
  to_date    date,                                   -- 비어 있으면 지금까지
  weekdays   smallint[] not null,                    -- 0=일 … 6=토
  start_time time not null,
  end_time   time,
  created_at timestamptz not null default now(),
  unique (class_id, from_date)
);
comment on table v2.class_schedule is
  '한 줄 = 이 반이 이 날부터 이 요일·시각이었다. **회차·청구액이 여기서 나온다**';

-- 한 줄 = 「이 아이가 이 날부터 이 반이었다」 ---------------------
-- ⚠️ 열쇠에 **시작일이 들어간다**. 칸만 붙이면 나갔다 돌아온 아이의
--    두 번째 기간이 안 들어간다 (계획 「처음부터 넣는 것 ⑤」)
create table v2.class_member (
  class_id   uuid not null references v2.classes(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete cascade,
  from_date  date not null,
  to_date    date,
  import_batch v2.batch,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id, from_date)
);
comment on table v2.class_member is
  '한 줄 = 이 아이가 이 날부터 이 반이었다. ⚠️ 한 아이가 정규·특강으로 **두 줄**에 설 수 있다';

-- ─────────────────────────────────────────────────────────────
-- 소속을 읽는 자리를 **한 벌로** 모은다 (계획 1단계 조심할 자리 ③)
-- 안 그러면 반을 옮긴 아이의 회차가 두 반 요일을 합쳐 부풀어
-- **수강료가 조용히 틀린다.**
-- ⚠️ 이 구멍은 검증으로 못 잡는다 — 이관이 전원 같은 시작일로 박으므로
--    전환 시점엔 닫힌 줄이 하나도 없어 날짜 조건이 있든 없든 같은 답이 난다.
-- ─────────────────────────────────────────────────────────────
create or replace function v2.class_roster(p_class uuid, p_on date)
returns table (student_id uuid)
language sql stable as $$
  select m.student_id from v2.class_member m
  where m.class_id = p_class
    and m.from_date <= p_on
    and (m.to_date is null or m.to_date >= p_on)
$$;

create or replace function v2.student_classes(p_student uuid, p_on date)
returns table (class_id uuid)
language sql stable as $$
  select m.class_id from v2.class_member m
  where m.student_id = p_student
    and m.from_date <= p_on
    and (m.to_date is null or m.to_date >= p_on)
$$;

-- 고친 때 도장 + 감사 기록 --------------------------------------
do $$ declare t text; begin
  foreach t in array array['profiles','students','classes'] loop
    execute format('create trigger %I_touch before update on v2.%I
                    for each row execute function v2.touch_row()', t, t);
  end loop;
  foreach t in array array['profiles','students','parent_student','classes','class_schedule','class_member'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I
                    for each row execute function v2.audit_row()', t, t);
  end loop;
end $$;

-- 파기 목록에 올린다 — 안 올리면 파기가 여기를 안 지나간다 -------
insert into v2.purge_map(tbl, col, how, note) values
  ('profiles','name','mask','이름'),
  ('profiles','phone','null','전화 — 학부모 아이디이기도 하다'),
  ('students','name','mask','이름')
on conflict do nothing;
