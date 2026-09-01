-- ─────────────────────────────────────────────────────────────
-- 0032 · 로그인 — 아이디와 비밀번호
--
-- 실측 (auth.users) — 역할마다 아이디가 다르다:
--   원장·강사  **진짜 이메일**            bdyj10@gmail.com
--   학생      **아이디**@chloe-eng.internal   chloe0515@…
--   학부모    **전화번호**@chloe-eng.internal  01020593256@…
--
-- ⚠️ 가짜 도메인(`.internal`)을 쓰는 까닭 — Supabase 인증은 이메일 자리를 요구하는데
--    아이들에게 이메일이 없다. **주소가 바뀌어도 이 아이디는 안 바뀐다.**
-- ⚠️ **대전제 12** — 재원생·학부모의 진짜 비밀번호는 전환일까지 **한 번도 안 건드린다.**
--    여기서는 **칸만** 만든다. `auth` 는 손대지 않는다.
-- ─────────────────────────────────────────────────────────────
alter table v2.profiles
  add column if not exists login_id       text,          -- 학생 아이디 · 학부모는 전화번호
  add column if not exists must_change_pw boolean not null default false,
  add column if not exists menu_hidden    text[],
  add column if not exists menu_order     text[];
create unique index if not exists profiles_login_id_key on v2.profiles(login_id) where login_id is not null;

comment on column v2.profiles.login_id is
  '학생은 아이디, 학부모는 **전화번호**. auth 에는 login_id||''@chloe-eng.internal'' 로 들어간다';
comment on column v2.profiles.must_change_pw is
  '⚠️ 임시 비밀번호는 `0000` 하나뿐이다. **이 표시를 켜는 것이 곧 초기화**다 —
   리허설 목적으로 다시 켜면 그 아이가 그날 옛 앱에 못 들어간다(대전제 12)';

-- 학생·학부모 아이디를 이관한다 (auth 는 안 건드린다 — 읽기만)
update v2.profiles p set
  login_id = split_part(u.email, '@', 1),
  must_change_pw = coalesce(o.must_change_pw, false),
  menu_hidden = o.menu_hidden, menu_order = o.menu_order
from auth.users u, public.profiles o
where u.id = p.id and o.id = p.id and p.import_batch='import'
  and u.email like '%@chloe-eng.internal';

-- 원장·강사는 진짜 이메일이라 아이디를 안 만든다
update v2.profiles p set login_id = null
where p.role in ('principal','instructor');

-- 계정을 잇는 코드 (옛 `student_link_codes` — 0줄이지만 길은 남긴다)
create table if not exists v2.link_code (
  code text primary key,
  student_id uuid not null references v2.students(id) on delete cascade,
  expires_at timestamptz not null, used_at timestamptz, used_by uuid,
  created_by uuid references v2.profiles(id), created_at timestamptz not null default now()
);
alter table v2.link_code enable row level security;
alter table v2.link_code force row level security;
create policy staff_all on v2.link_code for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());
insert into v2.purge_map(tbl,col,how,note) values
  ('profiles','login_id','mask','⚠️ 학부모 아이디는 **전화번호**다 — 파기 대상')
on conflict do nothing;
