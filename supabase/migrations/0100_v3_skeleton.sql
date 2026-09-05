-- ════════════════════════════════════════════════════════════════════════════
-- 0100 · 새 앱 뼈대 — v3 스키마
-- 원장님 2026-09-05: 「이미 구현된 거 다 버리고 목업 그대로」 · 「데이터는 버리는 거 아니야」
-- → 코드는 새로, 표는 새 스키마 v3 에, 사람·권한은 v2 에서 옮긴다(v3.import_people — 멱등).
-- v2·public 은 여기서 **읽기만** 한다. 한 번 더 돌려도 같은 결과다.
-- ════════════════════════════════════════════════════════════════════════════
create schema if not exists v3;

-- 시간대는 하나(0-2). 날짜를 세는 모든 자리가 이것만 부른다
create or replace function v3.today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;
comment on function v3.today() is '학원의 오늘 — Asia/Seoul 하나. 서버 시계의 날짜를 쓰면 밤 9시 이후 하루가 어긋난다(0-2)';
create or replace function v3.me() returns uuid language sql stable as $$ select auth.uid() $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'v3' and t.typname = 'batch') then
    create type v3.batch as enum ('rehearsal', 'import', 'app');
  end if;
end $$;

-- ── 감사 — 자동 판정과 사람의 번복이 남는다(뼈대-4) ──
create table if not exists v3.audit (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  who     uuid,                                   -- auth.uid(). 크론·이관이면 비어 있다
  tbl     text not null,
  row_id  text not null,
  op      text not null check (op in ('insert', 'update', 'delete')),
  before  jsonb,
  after   jsonb
);
comment on table v3.audit is '누가 언제 어느 줄을 무엇으로 바꿨나 — 한 번의 바뀜이 한 줄. 사람은 읽기만 한다, 쓰는 것은 트리거(v3.audit_row)뿐';
create index if not exists audit_tbl_row on v3.audit (tbl, row_id, at desc);
create or replace function v3.audit_row() returns trigger
  language plpgsql security definer set search_path = v3, public as $$
declare k text;
begin
  k := coalesce((to_jsonb(coalesce(new, old)) ->> 'id'), (to_jsonb(coalesce(new, old)) ->> 'key'), '?');
  insert into v3.audit (who, tbl, row_id, op, before, after)
  values (auth.uid(), tg_table_name, k, lower(tg_op), to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end $$;
-- 고친 시각은 서버가 정한다(표-10) — 화면이 보낸 값을 안 믿는다
create or replace function v3.stamp() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ── 사람 ──
create table if not exists v3.profiles (
  id             uuid primary key,                -- auth.users.id 와 같다
  role           text not null check (role in ('principal', 'instructor', 'assistant', 'student', 'parent')),
  name           text not null,
  phone          text,
  state          text not null default 'active' check (state in ('active', 'paused', 'left')),
  must_change_pw boolean not null default false,
  import_batch   v3.batch,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table v3.profiles is '한 줄 = 로그인하는 사람 하나(auth.users.id 와 같다). 주인: 이관(v2) → 앱. 지우지 않는다 — state 로 말한다(대전제-6)';
comment on column v3.profiles.role is '원장 principal · 강사 instructor · 조교 assistant · 학생 student · 학부모 parent. 어디까지 여는가는 v3.role_access 가 정한다';
comment on column v3.profiles.must_change_pw is '처음 비밀번호(0000)를 아직 안 바꿨다 — 참이면 바꾸기 전엔 다음 화면으로 못 간다(목업 00). 켜는 것은 초기화가 아니다 — 비밀번호는 안 건드린다';
drop trigger if exists profiles_stamp on v3.profiles;
create trigger profiles_stamp before update on v3.profiles for each row execute function v3.stamp();
drop trigger if exists profiles_audit on v3.profiles;
create trigger profiles_audit after insert or update or delete on v3.profiles for each row execute function v3.audit_row();

-- 역할 판단 한 벌 — 화면도 접근 규칙도 이것만 부른다(대전제-4)
create or replace function v3.my_role() returns text
  language sql stable security definer set search_path = v3, public as $$
  select p.role from v3.profiles p where p.id = auth.uid() and p.state = 'active'
$$;
create or replace function v3.is_staff() returns boolean
  language sql stable security definer set search_path = v3, public as $$
  select coalesce(v3.my_role() in ('principal', 'instructor', 'assistant'), false)
$$;
-- 비밀번호를 바꿨다 — 본인 줄의 must_change_pw 만 내린다(RLS 는 칸을 못 가르므로 함수로)
create or replace function v3.password_changed() returns void
  language sql security definer set search_path = v3, public as $$
  update v3.profiles set must_change_pw = false where id = auth.uid()
$$;

-- ── 누가 무엇을 보나 — 원장님이 화면에서 켜고 끄신다(원장님 2026-09-03). 기본값은 코드에 없다 ──
create table if not exists v3.role_access (
  role       text not null check (role in ('instructor', 'assistant', 'student', 'parent')),  -- principal 은 못 들어간다: 스스로를 잠글 길을 안 만든다
  key        text not null,                        -- 열쇠 목록의 주인은 코드(lib/perm.js)다 — 여기에 CHECK 로 두 벌 두지 않는다(원칙-1)
  allowed    boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references v3.profiles(id),
  primary key (role, key)
);
comment on table v3.role_access is '한 줄 = 「이 역할에게 이 자리를 여는가」. 원장님이 화면에서 켜고 끄신다. 줄이 없으면 「안 정함」이고 v3.can 은 거짓(fail closed). principal 은 CHECK 가 막는다';
create or replace function v3.role_access_stamp() returns trigger
  language plpgsql security definer set search_path = v3, public as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
drop trigger if exists role_access_stamp on v3.role_access;
create trigger role_access_stamp before insert or update on v3.role_access for each row execute function v3.role_access_stamp();
drop trigger if exists role_access_audit on v3.role_access;
create trigger role_access_audit after insert or update or delete on v3.role_access for each row execute function v3.audit_row();

create or replace function v3.can(p_key text) returns boolean
  language sql stable security definer set search_path = v3, public as $$
  select case
    when auth.uid() is null then true                 -- 검사·이관·크론은 jwt 없이 postgres 로 돈다 — 서버 자신을 막지 않는다
    when v3.my_role() = 'principal' then true         -- 원장은 묻지 않는다
    else coalesce((select a.allowed from v3.role_access a where a.role = v3.my_role() and a.key = p_key), false)  -- 줄이 없으면 거짓
  end
$$;
comment on function v3.can(text) is '「이 사람에게 이 자리를 여는가」 한 벌. 로그인 안 했으면 참(서버 자신) · 원장은 참 · 그 밖에는 role_access 의 그 줄, 줄이 없으면 거짓';

-- ── 자동화 뼈대 ──
create table if not exists v3.queue (
  id           bigserial primary key,
  kind         text not null,                       -- 무엇을 하는 일인가 — 손은 lib/queue.js 의 handlers 에
  payload      jsonb not null default '{}'::jsonb,
  state        text not null default 'waiting' check (state in ('waiting', 'running', 'done', 'failed', 'gave_up')),
  attempts     int  not null default 0,
  next_try_at  timestamptz not null default now(),
  locked_at    timestamptz,                         -- 자물쇠는 이것이다 — 「보낸 때」가 아니다(뼈대-1)
  last_error   text,
  why_table    text,                                -- 왜 생겼나(뼈대-3) — 표 이름 + 줄 id
  why_id       text,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
comment on table v3.queue is '밖으로 나가거나 나중에 할 일 하나 — 상태·시도 횟수·다음 시도·잠금 시각·마지막 오류(뼈대-1). 자물쇠는 locked_at 이다. 왜 생겼는지는 why_table·why_id 가 가리킨다(뼈대-3)';
create index if not exists queue_due on v3.queue (next_try_at) where state in ('waiting', 'failed');

create table if not exists v3.rule (
  key        text primary key,
  value      text not null,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references v3.profiles(id)
);
comment on table v3.rule is '규칙의 임계값 하나 — 「재시험 세 번」 같은 것. 코드에 박지 않는다(뼈대-5), 원장님이 고친다. 코드는 lib/rule.js 로 읽기만 한다';
drop trigger if exists rule_stamp on v3.rule;
create trigger rule_stamp before insert or update on v3.rule for each row execute function v3.role_access_stamp();
drop trigger if exists rule_audit on v3.rule;
create trigger rule_audit after insert or update or delete on v3.rule for each row execute function v3.audit_row();

create table if not exists v3.cron_run (
  job     text not null,
  day     date not null,                            -- 학원의 오늘(v3.today()) — 크론이 인자로 받는다(뼈대-10)
  ran_at  timestamptz not null default now(),
  result  text,
  primary key (job, day)
);
comment on table v3.cron_run is '「오늘 이거 이미 돌았나」 한 줄(뼈대-6). 크론은 학원의 오늘을 인자로 받고, 새 셈을 만들지 않는다(뼈대-9·10)';

-- ── 접근 규칙 — 막는 쪽이 기본 ──
alter table v3.audit       enable row level security; alter table v3.audit       force row level security;
alter table v3.profiles    enable row level security; alter table v3.profiles    force row level security;
alter table v3.role_access enable row level security; alter table v3.role_access force row level security;
alter table v3.queue       enable row level security; alter table v3.queue       force row level security;
alter table v3.rule        enable row level security; alter table v3.rule        force row level security;
alter table v3.cron_run    enable row level security; alter table v3.cron_run    force row level security;

drop policy if exists audit_staff_read on v3.audit;
create policy audit_staff_read on v3.audit for select to authenticated using (v3.my_role() = 'principal');

drop policy if exists profiles_read on v3.profiles;
create policy profiles_read on v3.profiles for select to authenticated using (id = auth.uid() or v3.is_staff());
drop policy if exists profiles_principal_write on v3.profiles;
create policy profiles_principal_write on v3.profiles for all to authenticated
  using (v3.my_role() = 'principal') with check (v3.my_role() = 'principal');

drop policy if exists role_access_read on v3.role_access;
create policy role_access_read on v3.role_access for select to authenticated using (true);
drop policy if exists role_access_principal_write on v3.role_access;
create policy role_access_principal_write on v3.role_access for all to authenticated
  using (v3.my_role() = 'principal') with check (v3.my_role() = 'principal');

drop policy if exists queue_staff on v3.queue;
create policy queue_staff on v3.queue for all to authenticated using (v3.is_staff()) with check (v3.is_staff());

drop policy if exists rule_read on v3.rule;
create policy rule_read on v3.rule for select to authenticated using (true);
drop policy if exists rule_principal_write on v3.rule;
create policy rule_principal_write on v3.rule for all to authenticated
  using (v3.my_role() = 'principal') with check (v3.my_role() = 'principal');

drop policy if exists cron_run_principal_read on v3.cron_run;
create policy cron_run_principal_read on v3.cron_run for select to authenticated using (v3.my_role() = 'principal');

-- 권한은 표마다 딱 맞게 — 지우는 권한은 아무에게도 없다(대전제-6: 지우지 않는다, 상태로 내린다).
-- 감사·크론 기록은 사람이 못 쓴다(트리거·서버 자신만). service_role 도 delete 는 없다
grant usage on schema v3 to anon, authenticated, service_role;
grant select on v3.audit, v3.cron_run to authenticated;
grant select, insert, update on v3.profiles, v3.role_access, v3.queue, v3.rule to authenticated;
grant select, insert, update on all tables in schema v3 to service_role;
grant usage, select on all sequences in schema v3 to authenticated, service_role;
grant execute on all functions in schema v3 to authenticated, service_role;

-- ── 옮기기 — v2 의 사람과 원장님이 정하신 권한 32칸. 멱등: 이미 있는 줄은 안 덮는다(앱이 고친 것을 이관이 되돌리지 않는다) ──
create or replace function v3.import_people() returns table (people int, access int)
  language plpgsql security definer set search_path = v3, v2, public as $$
declare n1 int; n2 int;
begin
  insert into v3.profiles (id, role, name, phone, state, must_change_pw, import_batch)
  select p.id, p.role, p.name, p.phone, p.state,
         (p.role in ('student', 'parent')),           -- 아이·학부모는 처음 비밀번호(0000)일 수 있다(실측 39/41) — 한 번은 바꾸게 한다
         'import'
    from v2.profiles p
  on conflict (id) do nothing;
  get diagnostics n1 = row_count;
  insert into v3.role_access (role, key, allowed)
  select a.role, a.key, a.allowed from v2.role_access a
  on conflict (role, key) do nothing;
  get diagnostics n2 = row_count;
  return query select n1, n2;
end $$;
comment on function v3.import_people() is '사람(v2.profiles)과 권한 32칸(v2.role_access)을 v3 로 옮긴다. 멱등 — 있는 줄은 안 덮는다. 전환일 체크리스트가 한 번 더 부른다';
-- 규칙의 임계값 — 코드에 박지 않는다(뼈대-5). 원장님이 고치신 값은 안 덮는다
insert into v3.rule (key, value, note) values
  ('queue.max_attempts',    '5',              '큐 한 건을 몇 번까지 다시 해 보나 — 넘으면 gave_up 으로 원장님께 뜬다'),
  ('queue.backoff_minutes', '1,5,30,120,720', '실패 뒤 다음 시도까지(분) — 시도 횟수 순서대로'),
  ('password.min_len',      '6',              '비밀번호 최소 글자 수 — 처음 비밀번호 0000 은 못 쓴다')
on conflict (key) do nothing;

select * from v3.import_people();
