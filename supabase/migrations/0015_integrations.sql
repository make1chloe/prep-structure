-- 0015: 연동 설정 (문자 발송 · 웹훅 · 학원 정보)
--
-- 환경변수 대신 앱에서 바꾼다. 값이 바뀌어도 재배포가 필요 없다.
--   id      solapi | webhook | academy
--   enabled 이 연동을 쓸지
--   config  jsonb — 키·번호·URL 등 (비밀값 포함, 화면에는 가려서 보여준다)
--
-- 보안: 원장만 읽고 쓸 수 있다. 비밀값은 서버에서만 읽고 화면으로 내려보내지 않는다.

create table if not exists public.integrations (
  id         text primary key,
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.integrations enable row level security;
drop policy if exists principal_all on public.integrations;
create policy principal_all on public.integrations
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  );

-- 발송 결과를 남긴다 (성공/실패 사유)
alter table public.report_sends add column if not exists channel text;   -- copy | sms | webhook
alter table public.report_sends add column if not exists ok boolean;
alter table public.report_sends add column if not exists detail text;
alter table public.report_sends add column if not exists to_phone text;

insert into public.integrations (id, enabled, config) values
  ('academy', true, '{"name":"클로이영어"}'::jsonb)
on conflict (id) do nothing;
