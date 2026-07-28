-- 0044: 학생이 숙제를 제출한다
--
-- 지금은 "학습 완료" 를 누르는 것이 전부다. 정말 했는지는 등원해서
-- 공책을 봐야 안다. 그런데 원장님 루틴에는 **녹음으로 내는 구두테스트**가
-- 이미 있다 — 그건 종이로 받을 수가 없다.
--
--   · 사진  — 문제 푼 것, 워크북, 오답노트
--   · 녹음  — 구두테스트 (집에서 하는 것)
--   · 글    — 짧은 답이나 한마디
--
-- 파일은 Supabase Storage 의 비공개 버킷에 넣는다. 주소를 알아도 못 연다 —
-- 볼 때마다 짧은 시간짜리 링크를 새로 만들어 연다.

create table if not exists public.homework_submissions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null default (now() at time zone 'Asia/Seoul')::date,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  report_item_id   uuid references public.daily_report_items(id) on delete cascade,
  kind             text not null default 'photo',   -- photo / audio / text
  path             text,                            -- storage 안의 위치 (글이면 비어 있다)
  body             text,                            -- 글로 낸 것
  bytes            int,
  seconds          int,                             -- 녹음 길이
  checked_at       timestamptz,                     -- 선생님이 본 시각
  created_at       timestamptz not null default now()
);

create index if not exists submissions_student_idx on public.homework_submissions (student_id, date);
create index if not exists submissions_date_idx    on public.homework_submissions (date);
create index if not exists submissions_open_idx    on public.homework_submissions (date)
  where checked_at is null;

alter table public.homework_submissions enable row level security;

drop policy if exists staff_all on public.homework_submissions;
create policy staff_all on public.homework_submissions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 내고 본다
drop policy if exists own_all on public.homework_submissions;
create policy own_all on public.homework_submissions
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = homework_submissions.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = homework_submissions.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.homework_submissions;
create policy parent_read on public.homework_submissions
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = homework_submissions.student_id
              and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 저장 공간 — 비공개 버킷
--   경로 규칙: submissions/<student_id>/<date>/<파일명>
--   맨 앞 칸이 학생 id 라서, 그것만 보고 누구 것인지 가릴 수 있다.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('submissions', 'submissions', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    -- 선생님은 전부 본다
    execute $p$drop policy if exists submissions_staff on storage.objects$p$;
    execute $p$
      create policy submissions_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'submissions' and public.is_staff())
        with check (bucket_id = 'submissions' and public.is_staff())
    $p$;

    -- 학생은 자기 폴더에만 넣고, 자기 것만 본다
    execute $p$drop policy if exists submissions_own on storage.objects$p$;
    execute $p$
      create policy submissions_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'submissions'
          and exists (select 1 from public.students s
                       where s.profile_id = auth.uid()
                         and s.id::text = (storage.foldername(name))[1])
        )
        with check (
          bucket_id = 'submissions'
          and exists (select 1 from public.students s
                       where s.profile_id = auth.uid()
                         and s.id::text = (storage.foldername(name))[1])
        )
    $p$;
  end if;
end $$;
