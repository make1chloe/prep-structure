-- 0072: 성적 관리
--
-- 지금 앱이 아는 성적은 **학원 안**의 것뿐이다 — 단어시험, 숙제, 단원평가.
-- 그런데 학부모가 정말 궁금한 것은 **학교 성적**이다. 그게 어디에도 없어서
-- 상담 때마다 물어보고 종이에 적는다.
--
-- 세 가지를 담는다.
--   내신     학교 시험 점수와 등급. 학교마다 등급컷이 다르다
--   모의고사 전국 시험. 원점수 · 등급 · 백분위
--   단원평가 학원에서 보는 문법 단원평가 (이건 이미 monthly 에 일부 있다)
--
-- **틀린 문제까지 남긴다.** 점수만 남기면 "몇 점이었다" 로 끝나고, 다음에
-- 무엇을 다시 볼지는 또 기억에 기댄다.
--
-- 학생이 직접 낸다. 노션 설문지 링크를 걸어두고, 원장님은 들어온 것을 확인만 한다.

-- ---------- 성적 한 건 ----------
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,

  kind        text not null default 'school',   -- school(내신) | mock(모의고사) | unit(단원평가)
  taken_on    date,                             -- 시험 본 날
  year        int,                              -- 학년도 (2026)
  term        text,                             -- 1학기 중간고사 · 3월 학평 · Unit 5 …
  subject     text not null default '영어',

  raw_score   numeric,                          -- 원점수
  full_score  numeric,                          -- 만점 (보통 100)
  grade       int,                              -- 등급 (1~9)
  percentile  numeric,                          -- 백분위 (모의고사)
  rank_in     int,                              -- 석차
  rank_of     int,                              -- 전체 인원

  -- 학교마다 등급컷이 다르다. 그 학교 그 시험의 컷을 같이 적어두면
  -- 다음 시험 때 "몇 점이면 몇 등급인지" 를 알 수 있다.
  school      text,                             -- 어느 학교 시험인가 (학생 학교와 다를 수 있다)
  cuts        numeric[],                        -- 1등급컷부터 순서대로 [90, 84, 77, …]

  note        text,
  source      text,                             -- 어디서 왔나 (form = 학생이 낸 것)
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists scores_student_idx on public.scores (student_id, taken_on desc);
create index if not exists scores_kind_idx    on public.scores (kind, taken_on desc);


-- ---------- 틀린 문제 ----------
-- 점수만 남기면 "몇 점이었다" 로 끝난다. 무엇을 틀렸는지가 남아야
-- 다음에 무엇을 다시 볼지 정할 수 있다.
create table if not exists public.score_wrongs (
  id         uuid primary key default gen_random_uuid(),
  score_id   uuid not null references public.scores(id) on delete cascade,
  question   text,                              -- 문제 번호 (12번)
  topic      text,                              -- 무엇이 문제였나 (관계대명사 · 빈칸추론)
  reason     text,                              -- 왜 틀렸나 (단어를 몰라서 · 시간 부족)
  note       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists score_wrongs_score_idx on public.score_wrongs (score_id, sort);


-- ---------- 학생이 직접 내는 자리 ----------
-- 노션 설문지 링크를 걸어둔다. 앱에서 폼을 새로 만들지 않는다 —
-- 원장님이 이미 노션을 쓰시고, 문항을 바꾸는 일이 잦기 때문이다.
insert into public.integrations (id, enabled, config) values
  ('score_form', true, '{"school":"","mock":"","unit":""}'::jsonb)
on conflict (id) do nothing;


-- ---------- 권한 ----------
do $$
declare t text;
begin
  foreach t in array array['scores','score_wrongs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- 학생·학부모는 **자기 것만** 본다
drop policy if exists score_own on public.scores;
create policy score_own on public.scores
  for select to authenticated
  using (scores.student_id in (select public.my_student_ids()));

-- 학생 본인은 직접 낼 수 있다 (학부모는 읽기만 — 대신 내주면 기록이 거짓이 된다)
drop policy if exists score_own_insert on public.scores;
create policy score_own_insert on public.scores
  for insert to authenticated
  with check (
    exists (select 1 from public.students s
             where s.id = scores.student_id and s.profile_id = auth.uid())
  );

drop policy if exists wrong_own on public.score_wrongs;
create policy wrong_own on public.score_wrongs
  for select to authenticated
  using (
    exists (select 1 from public.scores sc
             where sc.id = score_wrongs.score_id
               and sc.student_id in (select public.my_student_ids()))
  );

drop policy if exists wrong_own_insert on public.score_wrongs;
create policy wrong_own_insert on public.score_wrongs
  for insert to authenticated
  with check (
    exists (select 1 from public.scores sc
             join public.students s on s.id = sc.student_id
            where sc.id = score_wrongs.score_id and s.profile_id = auth.uid())
  );
