-- 클래스카드 연동 저장소 (docs/클래스카드-연동-설계.md, 원장님 2026-08-16).
--
-- 크롬 확장이 원장님 세션으로 클카 플래너를 읽어 앱으로 보낸다. 앱은
-- 「오늘 마감 세트의 완료 여부」 와 「마감일 달력」 만 저장한다 — 세트
-- 내용 미러링은 안 한다 (플래너가 원본, 원칙 1).

-- 클카 학생 명단 (확장이 보내주는 것). login_id 로 앱 학생과 잇는다.
create table if not exists public.classcard_students (
  user_idx   text primary key,          -- 클카 내부 학생 번호
  login_id   text,                      -- 클카 아이디 (대부분 앱 아이디와 같다)
  user_name  text,
  seen_at    timestamptz not null default now()
);

-- 학생×날짜 — 그날 마감 세트들과 완료 여부 (배열 그대로, 판정은 lib 한 곳)
create table if not exists public.classcard_day (
  user_idx   text not null,
  date       date not null,
  sets       jsonb not null default '[]',   -- [{name, complete, status, cards}]
  fetched_at timestamptz not null default now(),
  primary key (user_idx, date)
);

-- 학생×달 — 마감일 달력 (감시②: 플래너 소진)
create table if not exists public.classcard_planner (
  user_idx   text not null,
  month      text not null,              -- 'YYYY-MM'
  days       jsonb not null default '[]',   -- ['YYYY-MM-DD', ...]
  fetched_at timestamptz not null default now(),
  primary key (user_idx, month)
);

-- 학교에서 이미 만든 계정이라 **아이디가 다른 학생** (원장님 2026-08-16)
-- — 재원생 정보에 클카 아이디를 적으면 그걸로 잇는다. 비면 앱 아이디로.
alter table public.students add column if not exists classcard_login text;

do $$ declare t text;
begin
  foreach t in array array['classcard_students','classcard_day','classcard_planner'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated
      using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

create or replace function public.classcard_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.classcard_on() to authenticated;
