-- ─────────────────────────────────────────────────────────────
-- 0007 · 교재 · 단원
--
-- ⚠️ 옛 앱에서 배운 것: `student_unit_progress.textbook_unit_id` 가
--    **on delete CASCADE** 였다. 단원을 지우면 **진도가 같이 지워진다.**
--    (3300제 중복 18줄을 지울 때 진도 32줄이 걸려 있었다.)
--    → 새 앱은 **RESTRICT**. 대전제 6 대로 **지우지 않고 상태로 내린다.**
-- ─────────────────────────────────────────────────────────────
create table v2.books (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,                        -- G020 · R011 — **이름이 아니라 이걸로 잇는다**
  name         text not null,
  area         text check (area in ('문법','의미덩어리','독해','영작','내신','블록구문')),
  publisher    text, pub_year smallint,            -- ⚠️ 개정판 가리기 — 재활용 판정에 쓴다
  level        text, price int, buy_url text,
  -- 배정 겹 — 「한 번에 나가는 덩어리가 어느 겹인가」 (교재마다 한 번 정한다)
  chunk_depth  text not null default 'sub' check (chunk_depth in ('chapter','mid','sub')),
  -- 도는 차례 — 대단원 기준이면 **본책 전부 → 워크북 전부** (원장님 ㉙)
  order_basis  text not null default 'sub' check (order_basis in ('chapter','sub')),
  unit_test    boolean not null default false,     -- 단원평가를 보는 교재인가
  state        text not null default 'active' check (state in ('active','paused','stopped')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on column v2.books.order_basis is
  '⚠️ 엑셀 줄 차례는 워크북 있는 11권이 전부 소단원 기준이다. 이 칸이 없으면 「대단원 기준」이 영영 안 걸린다';

-- 교재를 부르는 다른 이름 — **어느 이름도 다른 이름을 덮지 않는다**
create table v2.book_alias (
  book_id uuid not null references v2.books(id) on delete restrict,
  alias   text not null,
  source  text,                                    -- 단원표 · 교재안내 · 루틴 · 옛앱
  primary key (book_id, alias)
);

-- 한 줄 = 「이 교재의 이 단원 한 줄」 ----------------------------
-- 계층은 **대 › 중 › 소 세 겹으로 고정**. 깊이 무제한 나무를 안 만든다
create table v2.units (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references v2.books(id) on delete restrict,
  chapter      text not null,                      -- 대단원
  mid          text,                               -- 중단원
  sub          text,                               -- 소단원 (⚠️ 활동명을 복사하지 않는다)
  activity     text not null,                      -- 활동명 — 본책/워크북/Practice…
  is_workbook  boolean not null default false,     -- 갈래 — 대단원 기준의 차례가 이걸로 갈린다
  sort         int not null,
  page_start   int, page_end int, q_count int, q_range text,
  gist         text,
  state        text not null default 'active' check (state in ('active','hidden')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  -- ⚠️ 순번을 열쇠로 쓰지 않는다. 가운데를 지우면 뒤 번호가 밀려 남의 기록에 붙는다
  unique nulls not distinct (book_id, chapter, mid, sub, activity)
);
comment on table v2.units is
  '한 줄 = 이 교재의 이 단원 한 줄. ⚠️ 지우기는 restrict — 진도가 걸려 있으면 못 지운다';

-- 단원평가의 「단원」 = 문법 분류 (교재와 무관하다 · 원장님 ⑲)
create table v2.grammar_topics (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,                       -- 접속사 · 관계대명사 · 관계부사 …
  sort int not null default 0
);
create table v2.unit_topic (                       -- 교재 단원 ↔ 문법 분류
  unit_id  uuid not null references v2.units(id) on delete restrict,
  topic_id uuid not null references v2.grammar_topics(id) on delete restrict,
  primary key (unit_id, topic_id)
);

do $$ declare t text; begin
  foreach t in array array['books','units'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t);
  end loop;
  foreach t in array array['books','book_alias','units','grammar_topics','unit_topic'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t);
  end loop;
end $$;
create index on v2.units (book_id, sort);
