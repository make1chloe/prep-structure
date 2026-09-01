-- ─────────────────────────────────────────────────────────────
-- 0006 · 학교 · 시험 회차
-- ⚠️ 전국 시험(수능·학력평가)은 **학교를 안 붙인다** (원장님 절 ㊲).
--    나이스가 학교마다 한 줄씩 내려주므로 학교 5곳이면 같은 학평이 다섯 줄로 들어온다.
-- ─────────────────────────────────────────────────────────────
create table v2.schools (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  level        text not null check (level in ('elem','middle','high')),
  neis_code    text,
  site_url     text,
  state        text not null default 'active' check (state in ('active','closed')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table v2.students add constraint students_school_fk
  foreign key (school_id) references v2.schools(id) on delete restrict;

-- 한 줄 = 「이 시험 하나」 --------------------------------------
create table v2.exams (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('national','school')),
  school_id    uuid references v2.schools(id) on delete restrict,
  grade        smallint,
  name         text not null,                     -- 「2학기 중간」 「10월 학력평가」
  term_from    date,                              -- 나이스가 주는 시험 **기간**
  term_to      date,
  english_on   date,                              -- ⚠️ **안 온다.** 손으로 한 줄
  source       text check (source in ('neis','site','manual')),
  source_key   text,                              -- 다시 받아도 한 줄
  state        text not null default 'active' check (state in ('active','done','cancelled')),
  import_batch v2.batch,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 전국은 학교가 비어야 하고, 학교 시험은 학교가 있어야 한다
  constraint exam_scope_school check (
    (scope='national' and school_id is null) or (scope='school' and school_id is not null)),
  -- 밖에서 받아온 것은 한 줄만. ⚠️ 손으로 넣은 것은 출처가 비어 제약에 안 걸린다
  unique nulls not distinct (source, source_key)
);
comment on column v2.exams.english_on is
  '⚠️ 나이스는 기간만 준다. 이 한 줄이 없으면 루틴을 안 세운다 — 기간 끝으로 잡으면 배부가 사흘 늦는다';

-- 시험 회차마다 교재 멈춤 며칠 전부터 (원장님 확정: 고 6주 · 중 4주)
create table v2.stop_rule (
  id         uuid primary key default gen_random_uuid(),
  level      text unique check (level in ('elem','middle','high')),
  weeks      smallint not null,
  updated_at timestamptz not null default now()
);
insert into v2.stop_rule(level, weeks) values ('high',6),('middle',4),('elem',4)
on conflict (level) do nothing;

do $$ declare t text; begin
  foreach t in array array['schools','exams','stop_rule'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t);
  end loop;
  foreach t in array array['schools','exams','stop_rule'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t);
  end loop;
end $$;
