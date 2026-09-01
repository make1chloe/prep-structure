-- ─────────────────────────────────────────────────────────────
-- 0011 · 하루 — 판 · 검사 · 학습 · 숙제 · 늦귀가 · 단어시험 · 단원평가
--
-- ⚠️ 옛 앱의 사고 #7 — 판 정책에 **마감 술어가 없었다.** 여기서는 넣는다.
-- ⚠️ 옛 앱은 `daily_reports` 가 칸 47개짜리 한 표였다. **갈라 놓는다.**
-- ─────────────────────────────────────────────────────────────
create table v2.day_sheet (              -- 한 줄 = 「이 아이의 이 날 수업 한 판」
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references v2.students(id) on delete restrict,
  class_id    uuid references v2.classes(id) on delete restrict,
  date        date not null,
  attend      text not null default 'present'
              check (attend in ('present','late','absent','makeup','off')),
  closed_at   timestamptz,               -- ⭐ 마감 — 접근 규칙이 이걸 본다
  closed_by   uuid references v2.profiles(id),
  sent_at     timestamptz,
  comment     text,                      -- 부모님께 나갈 글
  staff_note  text,                      -- ⚠️ **원장님만** — 학부모 쪽 값에 안 실린다
  import_batch v2.batch,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, date, class_id)    -- 정규·특강으로 두 줄에 설 수 있다
);
comment on column v2.day_sheet.closed_at is
  '⭐ 마감. 옛 앱은 1,808줄 전부 비어 있었고 정책에 술어도 없어 **만들자마자 다 보였다**';

create table v2.day_item (               -- 판 안의 줄 — 검사·학습·숙제
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references v2.day_sheet(id) on delete cascade,
  slot       text not null check (slot in ('check','class','home','next')),  -- 검사·학원·숙제·예습
  item_id    uuid references v2.learn_items(id) on delete restrict,
  book_id    uuid references v2.books(id) on delete restrict,
  unit_id    uuid references v2.units(id) on delete restrict,   -- ⚠️ 옛 앱은 4,150줄 중 33줄만 붙어 있었다
  range_note text,                        -- 「이번에 낼 번호」
  status     text check (status in ('none','done','weak','missing','inclass')),
  done_note  text,                        -- △ 일 때 「어디까지 했나」
  carry_of   uuid references v2.day_item(id) on delete set null,  -- 조각이 원본을 가리킨다
  sort       int not null default 0,
  memo       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column v2.day_item.slot is
  '⚠️ `next`(예습)에 ○ 를 줘도 단원을 완료로 안 올린다 — 안 그러면 수업 안 한 단원이 완료로 찍힌다';

create table v2.word_test (              -- 단어시험
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references v2.day_sheet(id) on delete cascade,
  book_id    uuid references v2.books(id) on delete restrict,
  scope      text,
  total      smallint, correct smallint,
  cut_pct    smallint not null default 90,
  way        text,                        -- 객뜻·주뜻·객영·주영
  retry_of   uuid references v2.word_test(id) on delete set null,
  created_at timestamptz not null default now()
);
create table v2.unit_test (              -- 단원평가 — 교재와 무관. 문법 분류로 낸다
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  topic_id   uuid references v2.grammar_topics(id) on delete restrict,
  assigned_on date, taken_on date,
  q_count    smallint default 25,
  correct    smallint,
  state      text not null default 'todo' check (state in ('todo','made','taken','scored')),
  created_at timestamptz not null default now()
);
create table v2.late_stay (              -- 늦귀가 — 남아서 하고 간다
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references v2.day_sheet(id) on delete cascade,
  reason     text,
  until_at   time,                        -- 예상 귀가 — **약속이 된다**
  left_at    time,                        -- 실제 하원. 차이를 같이 남긴다
  sent_at    timestamptz,                 -- ⚠️ 안 보내면 학부모는 모른 채 기다린다
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['day_sheet','day_item'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t); end loop;
  foreach t in array array['day_sheet','day_item','word_test','unit_test','late_stay'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
create index on v2.day_sheet (date, student_id);
create index on v2.day_sheet (student_id, date desc);
create index on v2.day_item (sheet_id, slot, sort);
insert into v2.purge_map(tbl,col,how,note) values
  ('day_sheet','comment','null','부모님께 나간 글'),
  ('day_sheet','staff_note','null','원장 메모'),
  ('day_item','memo','null',null), ('late_stay','reason','null',null)
on conflict do nothing;
