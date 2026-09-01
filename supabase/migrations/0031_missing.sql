-- ─────────────────────────────────────────────────────────────
-- 0031 · 전수 대조로 찾은 **빠뜨린 표 8가지**
-- ⚠️ 옛 표 85개를 하나씩 견줘서 찾았다. 계획에는 다 있는데 스키마에서 빠졌다.
-- ─────────────────────────────────────────────────────────────

-- ① 클래스카드 — 확장이 받아 적는 곳 (옛 517줄). **없으면 확장이 보낼 데가 없다**
create table v2.cc_student (                    -- 우리 아이 ↔ 클래스카드 아이디
  student_id uuid primary key references v2.students(id) on delete cascade,
  cc_user_idx text not null, cc_login_id text, updated_at timestamptz not null default now()
);
create table v2.cc_planner (                    -- 그날 마감 세트와 결과
  id bigserial primary key,
  student_id uuid not null references v2.students(id) on delete cascade,
  date date not null, set_name text, set_type smallint,   -- 1 단어 · 2 문장
  complete boolean, learn_status smallint, cards int,
  goals jsonb, got jsonb,                       -- ⚠️ 확장이 **목표·실제 점수를 이미 보낸다**(실측)
  fetched_at timestamptz not null default now(),
  unique (student_id, date, set_name)
);
create table v2.cc_due (                        -- 마감일 달력 (감시용)
  student_id uuid not null references v2.students(id) on delete cascade,
  date date not null, primary key (student_id, date)
);
create table v2.integration (                   -- 연동 열쇠 — 나이스·유튜브·앤트로픽·클래스카드
  id text primary key, config jsonb, last_ok_at timestamptz, last_error text,
  updated_at timestamptz not null default now()
);
comment on table v2.integration is
  '⚠️ 열쇠가 든다. 접근 규칙이 뚫리면 **나이스·유튜브·앤트로픽 열쇠가 통째로 샌다** — 옛 앱에서는 막혀 있었다';

-- ② 문구 본보기 (옛 344줄) — AI 브리핑이 **원장님 말투**를 배우는 재료
create table v2.comment_sample (
  id bigserial primary key, body text not null, tag text,
  created_at timestamptz not null default now()
);
comment on table v2.comment_sample is
  '⚠️ AI 가 쓴 글을 그대로 안 내보낸다. 이 본보기가 말투를 잡아 준다 — 344줄이 이미 있다';

-- ③ 예약 발송 (옛 15줄) — **내가 아예 안 적었다**
create table v2.scheduled_send (
  id uuid primary key default gen_random_uuid(),
  kind text not null, student_id uuid references v2.students(id) on delete cascade,
  body text, at timestamptz not null, sent_at timestamptz, cancelled_at timestamptz,
  created_by uuid references v2.profiles(id), created_at timestamptz not null default now()
);
comment on table v2.scheduled_send is
  '⚠️ 옛 앱은 「화면이 열리면 예약이 나간다」가 **렌더 안에서** 돌아 여는 사람이 기다렸다.
   새 앱은 크론이 돌리고 화면은 안 막는다';

-- ④ 월간 리포트 — **보낼 때 그때 나간 글을 굳힌다**
create table v2.monthly_report (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete restrict,
  ym char(7) not null, body text, frozen jsonb,        -- 그때 숫자를 굳혀 둔다
  sent_at timestamptz, created_at timestamptz not null default now(),
  unique (student_id, ym)
);
comment on column v2.monthly_report.frozen is
  '⚠️ 세어 나오는 값이라도 **보낸 뒤에는 굳힌다** — 학부모가 본 숫자가 나중에 바뀌면 안 된다.
   이관 대조에서 「기존 앱이 뱉은 숫자가 남아 있는 유일한 자리」이기도 하다';
create table v2.month_confirm (                 -- 다음 달 일정 확정 도장 셋
  ym char(7) not null, class_id uuid references v2.classes(id) on delete cascade,
  step smallint not null check (step in (1,2,3)),  -- 안내 → 확인 → 확정
  at timestamptz not null default now(), by_who uuid references v2.profiles(id),
  primary key (ym, class_id, step)
);

-- ⑤ 등원 세 걸음 (옛 8줄)
create table v2.arrival (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references v2.students(id) on delete cascade,
  date date not null, step smallint not null, at timestamptz not null default now(),
  ip inet, unique (student_id, date, step)
);
comment on column v2.arrival.ip is
  '⚠️ 학원 회선이 IPv6 면 앞 4덩어리 비교가 실제로 맞는지 **아이 실물 리허설에서 터야** 한다';

-- ⑥ 학부모·아이 요청·질문 (옛 6줄) — 카톡으로 새던 것
create table v2.request (
  id uuid primary key default gen_random_uuid(),
  by_profile uuid references v2.profiles(id) on delete set null,
  student_id uuid references v2.students(id) on delete cascade,
  kind text not null check (kind in ('question','makeup','absence','other')),
  body text, at timestamptz not null default now(),
  seen_at timestamptz, answered_at timestamptz, answer text,
  state text not null default 'open' check (state in ('open','answered','closed'))
);
comment on column v2.request.seen_at is
  '⚠️ 「원장이 봤나」를 따로 남긴다 — **답 안 한 문의를 찾아내는 유일한 길**이다';

-- ⑦ 화면 설정 — 카드 순서는 **사람마다** 다르다
create table v2.screen_pref (
  profile_id uuid not null references v2.profiles(id) on delete cascade,
  screen text not null, layout jsonb,
  updated_at timestamptz not null default now(), primary key (profile_id, screen)
);
create table v2.app_asset (id text primary key, url text, updated_at timestamptz not null default now());

-- ⑧ 경고·재촉 자취 (옛 28줄)
create table v2.warning_action (
  id bigserial primary key, student_id uuid references v2.students(id) on delete cascade,
  kind text not null, at timestamptz not null default now(), note text,
  by_who uuid references v2.profiles(id)
);

do $$ declare t text; begin
  foreach t in array array['cc_student','cc_planner','cc_due','integration','comment_sample',
    'scheduled_send','monthly_report','month_confirm','arrival','request','screen_pref',
    'app_asset','warning_action'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format($f$create policy staff_all on v2.%I for all to authenticated
                      using (v2.is_staff()) with check (v2.is_staff())$f$, t);
    execute format('create trigger %I_audit after insert or update or delete on v2.%I
                    for each row execute function v2.audit_row()', t, t);
  end loop;
end $$;
-- 아이·부모가 보는 것만 연다
create policy own_cc  on v2.cc_planner    for select to authenticated using (student_id in (select v2.my_students()));
create policy own_mr  on v2.monthly_report for select to authenticated
  using (student_id in (select v2.my_students()) and sent_at is not null);
create policy own_ar  on v2.arrival       for select to authenticated using (student_id in (select v2.my_students()));
create policy mine_ar on v2.arrival       for insert to authenticated with check (student_id in (select v2.my_students()));
create policy own_rq  on v2.request       for select to authenticated using (by_profile = auth.uid());
create policy mine_rq on v2.request       for insert to authenticated
  with check (by_profile = auth.uid() and seen_at is null and answered_at is null);
create policy own_sp  on v2.screen_pref   for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy read_aa on v2.app_asset     for select to authenticated using (true);
-- ⚠️ integration 은 **원장만** — 열쇠가 든다. 정책을 안 만든다

grant select on all tables in schema v2 to authenticated;
grant insert, update on v2.arrival, v2.request, v2.screen_pref to authenticated;
revoke insert, update, delete on v2.integration from authenticated;
insert into v2.purge_map(tbl,col,how,note) values
  ('request','body','null',null), ('request','answer','null',null),
  ('monthly_report','body','null','그때 나간 글'),
  ('comment_sample','body','null','원장님 말투 본보기에 이름이 든다'),
  ('scheduled_send','body','null',null), ('warning_action','note','null',null)
on conflict do nothing;
