-- ════════════════════════════════════════════════════════════════════════════
-- 0100 · 새 앱 뼈대 — v2 에 이어 짓는다
-- 원장님 2026-09-05: 「이미 구현된 거 다 버리고 목업 그대로」 · 「데이터는 버리는 거 아니야」
-- → 코드는 새로, 표는 **v2 그대로**(사람·권한 32칸·교재·진도·시험이 다 여기 있다). 같은 표를 v3 에 또 세우면 두 벌이다(원칙-1).
-- 여기서 더하는 것은 새 앱이 처음 필요로 하는 셋 — 처음 비밀번호 문, 자동화 큐 뼈대, 규칙 임계값. 한 번 더 돌려도 같은 결과다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 처음 비밀번호(0000)를 아직 안 바꿨다 — 참이면 바꾸기 전엔 다음 화면으로 못 간다(목업 00) ──
alter table v2.profiles add column if not exists must_change_pw boolean not null default false;
comment on column v2.profiles.must_change_pw is '처음 비밀번호(0000)를 아직 안 바꿨다 — 참이면 바꾸기 전엔 다음 화면으로 못 간다(목업 00). 켜는 것은 초기화가 아니다 — 비밀번호는 안 건드린다';
-- 본인 줄의 이 칸만 내린다 — RLS 는 칸을 못 가르므로 함수로
create or replace function v2.password_changed() returns void
  language sql security definer set search_path = v2, public as $$
  update v2.profiles set must_change_pw = false where id = auth.uid()
$$;
comment on function v2.password_changed() is '비밀번호를 바꿨다 — 본인 줄의 must_change_pw 만 내린다';
grant execute on function v2.password_changed() to authenticated;

-- ── 규칙의 임계값 — 코드에 박지 않는다(뼈대-5). 원장님이 고치신다 ──
create table if not exists v2.rule (
  key        text primary key,
  value      text not null,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references v2.profiles(id)
);
comment on table v2.rule is '규칙의 임계값 하나 — 「재시험 세 번」 같은 것. 코드에 박지 않는다(뼈대-5), 원장님이 고친다. 코드는 lib/rule.js 로 읽기만 한다';
drop trigger if exists rule_stamp on v2.rule;
create trigger rule_stamp before insert or update on v2.rule for each row execute function v2.role_access_stamp();
drop trigger if exists rule_audit on v2.rule;
create trigger rule_audit after insert or update or delete on v2.rule for each row execute function v2.audit_row();
alter table v2.rule enable row level security; alter table v2.rule force row level security;
drop policy if exists rule_read on v2.rule;
create policy rule_read on v2.rule for select to authenticated using (true);
drop policy if exists rule_principal_write on v2.rule;
create policy rule_principal_write on v2.rule for all to authenticated
  using (v2.my_role() = 'principal') with check (v2.my_role() = 'principal');
grant select, insert, update on v2.rule to authenticated, service_role;

insert into v2.rule (key, value, note) values
  ('queue.max_attempts',    '5',              '큐 한 건을 몇 번까지 다시 해 보나 — 넘으면 gave_up 으로 원장님께 뜬다'),
  ('queue.backoff_minutes', '1,5,30,120,720', '실패 뒤 다음 시도까지(분) — 시도 횟수 순서대로'),
  ('password.min_len',      '6',              '비밀번호 최소 글자 수 — 처음 비밀번호 0000 은 못 쓴다')
on conflict (key) do nothing;

-- 아이·학부모는 처음 비밀번호(0000)일 수 있다(실측 39/41) — 한 번은 바꾸게 한다. 딱 한 번만(표시 줄로 막는다)
do $$ begin
  if not exists (select 1 from v2.rule where key = 'app.must_change_pw_seeded') then
    update v2.profiles set must_change_pw = true where role in ('student', 'parent');
    insert into v2.rule (key, value, note) values ('app.must_change_pw_seeded', '2026-09-05', '0100 이 아이·학부모 전원에게 「처음 비밀번호 바꾸기」를 한 번 켠 표시 — 지우면 다시 켠다');
  end if;
end $$;

-- ── 자동화 뼈대는 이미 있다(0012): v2.job_queue(상태·시도·다음 시도·잠금·오류) · v2.auto_rule · v2.auto_key · v2.day_ran(「오늘 돌았나」).
--    새로 세우지 않는다(원칙-1). 사람은 큐에 직접 못 쓴다(0017) — 학원 사람이 큐에 넣는 손 하나만 함수로 연다
create or replace function v2.enqueue(p_kind text, p_payload jsonb default '{}'::jsonb, p_next_at timestamptz default now())
  returns bigint language plpgsql security definer set search_path = v2, public as $$
declare v_id bigint;
begin
  if auth.uid() is not null and not v2.is_staff() then raise exception '학원 사람만 큐에 넣는다'; end if;
  insert into v2.job_queue (kind, payload, next_at) values (p_kind, coalesce(p_payload, '{}'::jsonb), coalesce(p_next_at, now())) returning id into v_id;
  return v_id;
end $$;
comment on function v2.enqueue(text, jsonb, timestamptz) is '큐에 한 건 넣는다 — 왜 생겼는지는 payload.why {table,id} 로(뼈대-3). 학원 사람만. 크론(서버 자신)은 job_queue 를 직접 쓴다';
grant execute on function v2.enqueue(text, jsonb, timestamptz) to authenticated, service_role;
