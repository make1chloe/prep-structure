-- ─────────────────────────────────────────────────────────────
-- 0015 · 자료함 — 학부모·학생 ↔ 원장 (원장님 ㊸)
-- ⚠️ 겹치는 것을 막지 않는다 — **사진 화질이 다르다**(원장님 9/2).
--    「이미 있습니다」로 막으면 먼저 온 흐린 것만 남는다.
-- ─────────────────────────────────────────────────────────────
create table v2.file (
  id uuid primary key default gen_random_uuid(),
  by_profile uuid references v2.profiles(id) on delete set null,
  student_id uuid references v2.students(id) on delete set null,   -- 형제면 **물어서** 정한다
  orig_name text not null, mime text not null, bytes int not null,
  path text not null unique,
  shrunk boolean not null default false,        -- 사진은 긴 변 1600px. pdf 는 안 줄인다
  uploaded_at timestamptz not null default now(),
  purge_on date,                                 -- 파기 예정일
  state text not null default 'active' check (state in ('active','hidden','purged'))
);
create table v2.file_bin (                       -- 자료함 묶음
  id uuid primary key default gen_random_uuid(),
  school_id uuid references v2.schools(id) on delete restrict,
  grade smallint, term text,                     -- 26-1
  kind text not null check (kind in ('수행평가','시험 안내','수업자료','학사일정','가정통신문','그 밖')),
  unique nulls not distinct (school_id, grade, term, kind)
);
create table v2.file_link (                      -- 파일이 붙은 곳 — 목록·JSON 이 아니라 짝 표
  file_id uuid not null references v2.file(id) on delete cascade,
  bin_id uuid references v2.file_bin(id) on delete cascade,
  day_item_id uuid references v2.day_item(id) on delete cascade,
  notice_id uuid references v2.notice(id) on delete cascade,
  consult_id uuid references v2.consult(id) on delete cascade,
  seen_by_child text check (seen_by_child in ('saved','skip')),   -- 💾 저장 · ✓ 안 보기
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (file_id, bin_id, day_item_id, notice_id, consult_id)
);
comment on column v2.file_link.seen_by_child is
  '아이가 누르면 그 줄에서 없어진다. ⚠️ 아이 쪽 보관은 **1달**, 원장님 자료함은 계속(원장님 9/2)';
do $$ declare t text; begin
  foreach t in array array['file','file_bin','file_link'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
insert into v2.purge_map(tbl,col,how,note) values
  ('file','orig_name','mask','파일 이름에 아이 이름이 든다'),
  ('file','path','row','Storage 파일도 같이 지운다')
on conflict do nothing;
