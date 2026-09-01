-- ─────────────────────────────────────────────────────────────
-- 0012 · 발송 · 알림 · 자동화 뼈대
-- ⚠️ 밖으로 나가는 길은 **함수 한 곳**에서만 막는다. 화면마다 판단하게 두면
--    언젠가 리포트가 문자로 나간다.
-- ─────────────────────────────────────────────────────────────
create table v2.push_sub (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references v2.profiles(id) on delete cascade,
  student_id uuid references v2.students(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  agreed_at timestamptz not null default now(),      -- 「언제 동의했나」
  revoked_at timestamptz,                            -- 「언제 껐나」
  created_at timestamptz not null default now()
);
create table v2.notify_log (                          -- 알림 자취
  id bigserial primary key,
  profile_id uuid references v2.profiles(id) on delete set null,
  student_id uuid references v2.students(id) on delete set null,
  kind text not null, title text, url text, tag text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz, opened_at timestamptz, open_count int not null default 0,
  failed_at timestamptz, fail_why text,
  sink text not null                                  -- off · self · live
);
comment on column v2.notify_log.sink is
  'NOTIFY_SINK. 미리보기는 구조적으로 off — 안 그러면 리허설 발송이 학부모 폰에 진짜로 뜬다';

create table v2.msg_template (                        -- 문구
  id uuid primary key default gen_random_uuid(),
  kind text not null unique, title text, body text not null,
  updated_at timestamptz not null default now()
);
create table v2.notice (                              -- 공지 — 세 축의 조합
  id uuid primary key default gen_random_uuid(),
  title text not null, body text,
  to_role text not null check (to_role in ('student','parent','both')),
  ring boolean not null default true,                 -- 지금 울리나
  place text not null default 'app' check (place in ('app','banner')),
  class_id uuid references v2.classes(id) on delete set null,
  school_id uuid references v2.schools(id) on delete set null,
  publish_at timestamptz, sent_at timestamptz,
  created_by uuid references v2.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table v2.notice_read (                         -- 읽음 — **서버가 찍는다**
  notice_id uuid not null references v2.notice(id) on delete cascade,
  profile_id uuid not null references v2.profiles(id) on delete cascade,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(),
  open_count int not null default 1,
  primary key (notice_id, profile_id)
);
-- 자동화 뼈대 (계획 1-1 (e)) ------------------------------------
create table v2.job_queue (
  id bigserial primary key, kind text not null,
  state text not null default 'wait' check (state in ('wait','taking','done','fail')),
  tries int not null default 0, next_at timestamptz not null default now(),
  locked_at timestamptz, last_error text, payload jsonb,
  created_at timestamptz not null default now()
);
comment on table v2.job_queue is
  '⚠️ 「보낸 때」 한 칸을 자물쇠로 쓰면 실패해도 도장을 찍어야 무한 반복을 막을 수 있어 **재시도가 원리적으로 불가능**하다';

create table v2.auto_rule (                           -- 되풀이·자동 생성 규칙
  id uuid primary key default gen_random_uuid(),
  kind text not null, name text not null,
  cron text, threshold jsonb, active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table v2.auto_key (                            -- 「이미 만들었나」 — 글자로 잇지 않는다
  rule_id uuid not null references v2.auto_rule(id) on delete cascade,
  student_id uuid references v2.students(id) on delete cascade,
  book_id uuid references v2.books(id) on delete cascade,
  unit_id uuid references v2.units(id) on delete cascade,
  round smallint, nth int,
  base_date date,                                     -- ⚠️ 없으면 매주/매달이 **한 번만** 생기고 만다
  made_at timestamptz not null default now(),
  unique nulls not distinct (rule_id, student_id, book_id, unit_id, round, nth, base_date)
);
create table v2.day_ran (                             -- 「오늘 이거 이미 돌았나」
  kind text not null, ran_on date not null, primary key (kind, ran_on)
);
do $$ declare t text; begin
  foreach t in array array['msg_template','notice','auto_rule'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t); end loop;
  foreach t in array array['push_sub','notice','msg_template','auto_rule'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
create index on v2.job_queue (state, next_at);
create index on v2.notify_log (sent_at desc);
insert into v2.purge_map(tbl,col,how,note) values
  ('notify_log','title','null','굳은 글에 이름이 남는다'),
  ('notice','body','null',null)
on conflict do nothing;
