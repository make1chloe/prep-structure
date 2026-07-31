-- 0065: 영상 배정 · 본 기록
--
-- 문법 강의, 쇼츠, 발음 영상. 지금은 링크를 카톡으로 보내고 "봤니?" 하고
-- 물어봐야 안다. 물어보면 다들 봤다고 한다.
--
-- 그래서 **연 시각을 기계가 적는다.** 아이가 화면에서 영상을 열면 그 순간
-- 기록이 남는다. 다 보고 나서 「다 봤어요」를 누르면 끝난 것으로 친다.
--   · 아예 안 연 아이     — 기록이 없다
--   · 열긴 열었는데 안 끝낸 아이 — 연 기록만 있다
--   · 다 본 아이           — 끝낸 시각까지 있다
--
-- 이 셋은 완전히 다른 이야기다. 지금은 셋 다 "봤어요" 로 들어온다.
--
-- 영상 자체는 유튜브에 있고, 우리는 **주소만** 들고 있는다.

create table if not exists public.video_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid references public.video_folders(id) on delete set null,
  title      text not null,
  url        text not null,
  provider   text,                    -- youtube | vimeo | 기타
  vid        text,                    -- 유튜브 영상 id (미리보기 그림에 쓴다)
  note       text,
  active     boolean not null default true,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists videos_folder_idx on public.videos (folder_id, sort);

-- 누구에게 냈나
create table if not exists public.video_assignments (
  video_id    uuid not null references public.videos(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  assigned_on date not null default (now() at time zone 'Asia/Seoul')::date,
  due_on      date,
  primary key (video_id, student_id)
);
create index if not exists video_assign_student_idx
  on public.video_assignments (student_id, assigned_on);

-- 봤나
--   opened_at   처음 연 시각 (기계가 적는다)
--   opens       몇 번 열었나
--   done_at     「다 봤어요」를 누른 시각
create table if not exists public.video_views (
  video_id   uuid not null references public.videos(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  opened_at  timestamptz,
  last_at    timestamptz,
  opens      int not null default 0,
  done_at    timestamptz,
  primary key (video_id, student_id)
);
create index if not exists video_views_student_idx on public.video_views (student_id);


-- ------------------------------------------------------------
-- 누가 무엇을 보나
--   선생님   전부
--   학생·학부모  **자기에게 배정된 것만.** 남이 무엇을 받았는지는 안 보인다
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['video_folders','videos','video_assignments','video_views'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- 배정: 내 것만 읽는다
drop policy if exists assign_read_mine on public.video_assignments;
create policy assign_read_mine on public.video_assignments
  for select to authenticated
  using (video_assignments.student_id in (select public.my_student_ids()));

-- 영상: 나에게 배정된 것만 읽는다
drop policy if exists video_read_mine on public.videos;
create policy video_read_mine on public.videos
  for select to authenticated
  using (
    exists (
      select 1 from public.video_assignments a
       where a.video_id = videos.id
         and a.student_id in (select public.my_student_ids())
    )
  );

drop policy if exists folder_read_mine on public.video_folders;
create policy folder_read_mine on public.video_folders
  for select to authenticated
  using (
    exists (
      select 1
        from public.videos v
        join public.video_assignments a on a.video_id = v.id
       where v.folder_id = video_folders.id
         and a.student_id in (select public.my_student_ids())
    )
  );

-- 본 기록: 자기 것만 쓰고 읽는다.
-- 학부모는 읽기만 — 아이 대신 「다 봤어요」를 눌러주면 기록이 거짓이 된다.
drop policy if exists view_own on public.video_views;
create policy view_own on public.video_views
  for all to authenticated
  using (
    exists (select 1 from public.students s
             where s.id = video_views.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
             where s.id = video_views.student_id and s.profile_id = auth.uid())
  );

drop policy if exists view_parent_read on public.video_views;
create policy view_parent_read on public.video_views
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
             where ps.student_id = video_views.student_id
               and ps.parent_profile_id = auth.uid())
  );
