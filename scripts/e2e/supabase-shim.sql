-- Supabase 가 미리 만들어 두는 것들 — 로컬 Postgres 에는 없다.
--
-- 우리 SQL 은 이것들이 있다고 치고 쓴다 (auth.users 를 참조하고, RLS 가
-- auth.uid() 를 본다). **흉내만 낸다** — 진짜와 다른 점은 아래에 적어둔다.
--
--   auth.uid()   진짜는 JWT 의 sub 를 읽는다. 여기서도 같게 만든다 —
--                PostgREST 가 요청마다 request.jwt.claims 를 심어준다.
--   storage      아예 없다. 표만 만들어 두어 SQL 이 안 깨지게 한다
--                (사진은 이 검사로 못 본다 — 검사 결과에 그렇게 적는다).

create extension if not exists pgcrypto;

-- Supabase 의 세 역할
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  -- 새 앱 마이그레이션이 읽는 칸들 (0075_screens: last_sign_in_at) — 진짜 auth.users 와 이름을 맞춘다
  last_sign_in_at timestamptz,
  confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

/**
 * **누가 부르고 있나.**
 *
 * PostgREST 는 요청마다 JWT 를 풀어 `request.jwt.claims` 에 넣어준다.
 * 진짜 Supabase 와 같은 자리다 — 그래서 RLS 규칙을 하나도 안 고치고 쓴다.
 */
-- ⚠️ 진짜 Supabase 처럼 빈 글자를 먼저 거른다 — 트랜잭션 안 set_config 가 되돌려지면 값이 NULL 이 아니라 '' 로 남아 ''::json 이 터진다(2026-09-05 check-v2-rls 가 audit_row 안에서 죽었다)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'anon')
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb)
$$;

-- Storage — 표만. 사진은 이 검사 밖이다
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false, file_size_limit bigint
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

-- PostgREST 의 db-pre-request 자리 — 아무것도 안 한다.
-- (없는 함수를 가리키면 모든 요청이 500 이 된다)
create or replace function public.e2e_noop() returns void
language sql as $$ select $$;
