-- ─────────────────────────────────────────────────────────────
-- 0010 · 루틴 — 기본루틴 + 학생루틴 (원장님 ㉒)
-- ⚠️ 루틴은 **교재가 아니라 영역**에 붙는다. 교재 37권이어도 루틴은 6벌.
--    그리고 「다섯 걸음 고정」은 폐기했다 — 순서가 학생마다 다르고 생략도 한다.
-- ─────────────────────────────────────────────────────────────
create table v2.learn_items (            -- 기본루틴 = 모든 항목을 다 넣어 둔 목록
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  method   text,                          -- 하는 법
  tool     text,                          -- 준비물
  checks   text[],                        -- 대괄호 안이 곧 체크리스트 (입해석·낭독·녹음)
  state    text not null default 'active' check (state in ('active','retired')),
  sort     int not null default 0,
  import_batch v2.batch,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column v2.learn_items.state is
  '⚠️ 지우지 않는다. retired 는 새 루틴에 안 뜨고 지난 기록에는 그대로 남는다';

create table v2.area_routine (           -- 영역 루틴 — 원장님이 채운 39줄이 여기
  id       uuid primary key default gen_random_uuid(),
  area     text not null check (area in ('문법','의미덩어리','독해','영작','내신','블록구문')),
  item_id  uuid not null references v2.learn_items(id) on delete restrict,
  place    text not null check (place in ('class','home','both')),   -- 학원·숙제·둘 다
  required boolean not null default false,
  sort     int not null,
  import_batch v2.batch,
  unique (area, item_id)
);

create table v2.student_routine (        -- 학생루틴 — 고르고·차례를 짜고·뺀 것
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  area       text not null,
  item_id    uuid not null references v2.learn_items(id) on delete restrict,
  place      text not null check (place in ('class','home','both')),
  sort       int not null,
  gate_prev  boolean not null default false,   -- 앞엣것을 끝내야 열린다 (모든 줄이 아니다)
  count_n    smallint,                          -- 오답노트 갯수처럼 매번 다른 것
  import_batch v2.batch,
  created_at timestamptz not null default now(),
  unique (student_id, area, item_id)
);
do $$ declare t text; begin
  foreach t in array array['learn_items'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t); end loop;
  foreach t in array array['learn_items','area_routine','student_routine'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
