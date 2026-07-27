-- 0025: 단어시험 방식 (학생마다 · 교재마다 · 회독마다 다르다)
--
-- 단어시험은 학생마다 보는 방법이 다르다. 개수는 정해져 있지 않고,
-- **네 가지 유형이 합쳐서 100%** 가 되게 배분한다. 0인 것도 있다.
--
--   객관식 뜻      영단어를 주고 뜻을 고른다
--   주관식 뜻      영단어를 주고 뜻을 쓴다
--   객관식 영단어  뜻을 주고 영단어를 고른다
--   주관식 영단어  뜻을 주고 영단어를 쓴다 — 첫 글자 힌트가 있을 수도, 없을 수도
--
-- 언제 정하나
--   · 그 교재를 **시작할 때** 한 번
--   · 진도를 다 끝내고 **한 번 더 돌릴 때(2회독)** 다시. 보통 더 어렵게 바꾼다
--
-- 그래서 (학생, 교재, 회독) 하나에 설정 한 줄이다.

create table if not exists public.word_test_settings (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  textbook_id  uuid not null references public.textbooks(id) on delete cascade,
  round        int  not null default 1,      -- 몇 회독째

  -- 네 가지 배분 (합이 100 이 되게 화면에서 잡아준다)
  mc_meaning   int not null default 0,       -- 객관식 뜻
  sa_meaning   int not null default 0,       -- 주관식 뜻
  mc_word      int not null default 0,       -- 객관식 영단어
  sa_word      int not null default 0,       -- 주관식 영단어

  first_hint   boolean not null default false, -- 주관식 영단어 첫 글자 힌트
  started_on   date default current_date,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (student_id, textbook_id, round)
);
create index if not exists word_test_settings_student_idx
  on public.word_test_settings (student_id, textbook_id);

alter table public.word_test_settings enable row level security;
drop policy if exists staff_all on public.word_test_settings;
create policy staff_all on public.word_test_settings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모도 자기 것은 볼 수 있게 (어떻게 시험 보는지 알아야 준비한다)
drop policy if exists own_read on public.word_test_settings;
create policy own_read on public.word_test_settings
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = word_test_settings.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = word_test_settings.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 지금 몇 회독째인지 (교재를 다 끝내고 다시 돌리면 올린다)
alter table public.student_textbooks add column if not exists round int not null default 1;


-- ------------------------------------------------------------
-- 경고 기준 정정
--   단어시험은 **오답 10% 이내면 통과** 다 (맞은 비율이 아니라 틀린 비율).
--   0001 스키마의 pass_threshold_pct 주석과 같은 뜻.
--   예전에 넣어둔 wordPassPct(맞은 비율) 는 뜻이 반대라 지운다.
-- ------------------------------------------------------------
update public.integrations
   set config = (config - 'wordPassPct') || '{"wordWrongPct":10}'::jsonb
 where id = 'warning';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;
