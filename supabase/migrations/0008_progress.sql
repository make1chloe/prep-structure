-- ─────────────────────────────────────────────────────────────
-- 0008 · 학생–교재 배정 · 진도 · 이의
--
-- ⚠️ **새 앱은 진도 하나에 전부 매단다.** 옛 앱은 숙제에 단원이 안 붙어 있어
--    (4,150줄 중 33줄만) 진도가 틀려도 숙제는 멀쩡했다. 새 앱은 아니다.
--    → 그래서 아래 셋이 **있으면 좋은 것이 아니라 없으면 안 되는 것**이다:
--      ① 진도 줄의 「마지막에 누가·확인했나」  ② ❗ 이의  ③ 진도 체크 열림
-- ─────────────────────────────────────────────────────────────

-- 한 줄 = 「이 아이가 이 날부터 이 교재를 쓴다」 -----------------
create table v2.student_book (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references v2.students(id) on delete restrict,
  book_id      uuid not null references v2.books(id)    on delete restrict,
  from_date    date not null,
  to_date      date,
  round        smallint not null default 1,        -- 지금 몇 회독
  per_session  smallint not null default 2,        -- 회차 — 한 수업에 덩어리 몇 개
  order_basis  text check (order_basis in ('chapter','sub')),   -- 비면 교재 기본값
  unit_test    text check (unit_test in ('off','per_chapter','per_n_sub')),
  unit_test_n  smallint,
  -- 멈춤 — 「돌아감 · 숙제멈춤 · 교재멈춤」 (원장님 ⑬)
  stop_mode    text not null default 'running' check (stop_mode in ('running','hw_off','book_off')),
  stop_exam_id uuid references v2.exams(id) on delete set null,   -- 시험에 묶으면 저절로 풀린다
  stop_until   date,
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, book_id, from_date)
);
comment on column v2.student_book.stop_exam_id is
  '시험에 묶으면 **그 시험 끝나는 날 저절로 풀린다.** 손으로만 풀면 3주 뒤에 「왜 이 교재가 안 나가지」 한다';

-- 한 줄 = 「이 아이가 이 단원을 이 회독째에 이렇게 했다」 ---------
-- ⚠️ 열쇠에 **회독이 필수**다. 없으면 2회독 시작하는 날 배정이 조용히 0줄이 된다
create table v2.progress (
  student_id uuid not null references v2.students(id) on delete restrict,
  unit_id    uuid not null references v2.units(id)    on delete restrict,   -- ⚠️ CASCADE 아님
  round      smallint not null default 1,
  status     text not null default 'none' check (status in ('none','doing','done','skip')),
  done_on    date,
  -- 표 4-8 — 화면에 「쌤/내가」를 띄우는 값. 감사 기록으로는 느리다
  last_by    text not null default 'staff' check (last_by in ('staff','student','check','import')),
  confirmed  boolean not null default true,        -- 아이가 찍은 것만 false 로 선다
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, unit_id, round)
);
comment on column v2.progress.last_by is
  '표 4-8. ⚠️ 감사 기록은 몇 만 줄이라 소단원 6줄 띄우려고 거기서 여섯 번 찾으면 화면이 느려진다';

-- 조각 — 소단원 하나를 쪼개 낸 것 (절 ⑳) ------------------------
create table v2.progress_part (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  unit_id    uuid not null references v2.units(id)    on delete restrict,
  round      smallint not null default 1,
  q_from     int, q_to int, page_from int, page_to int, note text,
  done_on    date,
  created_at timestamptz not null default now()
);
comment on table v2.progress_part is
  '조각들이 **원본을 다 덮는 순간 원본이 ○ 로 올라간다.** 이 연결이 없으면 커서가 영영 안 넘어간다';

-- ❗ 이의 — 표 4-7 -------------------------------------------
-- ⚠️ 진도 줄에 칸으로 넣으면 **다는 순간 진도가 바뀐다.** 옆에 붙는 쪽지라 자리가 따로 있어야 한다
create table v2.progress_flag (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  unit_id    uuid not null references v2.units(id)    on delete restrict,
  round      smallint not null default 1,
  kind       text not null check (kind in ('not_done','already_done','other')),
  said       text,
  raised_at  timestamptz not null default now(),   -- 서버가 찍는다
  seen_at    timestamptz, seen_by uuid references v2.profiles(id),
  outcome    text check (outcome in ('changed','kept'))
);
comment on table v2.progress_flag is
  '❗ 는 **진도를 안 바꾼다.** 아이가 스스로 되돌리게 하면 잘못 건드리는 길이 다시 열린다';

-- 진도 체크 열림 — 표 4-9 -------------------------------------
-- ⚠️ 날짜 자동 만료를 안 쓰기로 했으므로(원장님 9/2), **켠 날**이 필수다.
--    「12일째 열려 있습니다」가 그것뿐이고, 그게 잊는 것을 막는 유일한 장치다
create table v2.progress_edit (
  scope      text primary key default 'academy',
  is_open    boolean not null default false,
  opened_on  date,
  opened_by  uuid references v2.profiles(id),
  updated_at timestamptz not null default now()
);
insert into v2.progress_edit(scope) values ('academy') on conflict do nothing;

alter table v2.students add column progress_edit text not null default 'follow'
  check (progress_edit in ('follow','on','off'));   -- 학생별 예외

-- 「이 아이가 지금 이 진도를 고칠 수 있나」 — 한 곳에서 판단한다
create or replace function v2.can_edit_progress(p_student uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select case (select progress_edit from v2.students where id = p_student)
           when 'on'  then true
           when 'off' then false
           else coalesce((select is_open from v2.progress_edit where scope='academy'), false)
         end
$$;

do $$ declare t text; begin
  foreach t in array array['student_book','progress','progress_edit'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t);
  end loop;
  foreach t in array array['student_book','progress','progress_part','progress_flag','progress_edit'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t);
  end loop;
end $$;
create index on v2.progress (student_id, round);
create index on v2.progress (unit_id);
create index on v2.progress_flag (seen_at) where seen_at is null;

insert into v2.purge_map(tbl,col,how,note) values
  ('progress','note','null','아이 이름이 적힐 수 있다'),
  ('progress_flag','said','null','아이가 쓴 말')
on conflict do nothing;
