-- 0023: 숙제 · 데일리리포트에 댓글
--
-- 지금은 학부모가 문자를 받고 **답장할 데가 없다.** 전화나 카톡으로 오면
-- 기록이 흩어진다. 그래서 리포트 한 줄에 댓글을 붙인다.
--
-- 속성 정리 (원칙4-1)
--   daily_report_id  어느 날 어느 학생의 리포트인가            필수
--   student_id       RLS 를 단순하게 하려고 같이 둔다          필수
--   author_id        쓴 사람 (profiles)                        필수
--   author_role      staff | student | parent — 화면 구분용    필수
--   body             내용                                      필수
--   read_at          선생님이 읽은 시각 (안 읽은 것만 보려고)
--   제외: 대댓글(스레드), 첨부, 수정 이력 — 지금 필요 없다
--
-- 학생·학부모는 **자기 것만** 읽고 쓴다. 남의 리포트는 보이지 않는다.

create table if not exists public.report_comments (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  author_role     text not null default 'staff',   -- staff | student | parent
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists report_comments_report_idx
  on public.report_comments (daily_report_id, created_at);
create index if not exists report_comments_unread_idx
  on public.report_comments (read_at, created_at);

alter table public.report_comments enable row level security;

-- 선생님은 전부
drop policy if exists staff_all on public.report_comments;
create policy staff_all on public.report_comments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 자기 것만 읽기
drop policy if exists own_comments_read on public.report_comments;
create policy own_comments_read on public.report_comments
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = report_comments.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = report_comments.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 학생·학부모는 자기 것에만 쓰기 (author_id 를 남의 것으로 못 적게 같이 검사)
drop policy if exists own_comments_write on public.report_comments;
create policy own_comments_write on public.report_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.students s
              where s.id = report_comments.student_id and s.profile_id = auth.uid())
      or exists (select 1 from public.parent_student ps
                 where ps.student_id = report_comments.student_id
                   and ps.parent_profile_id = auth.uid())
    )
  );

-- 자기가 쓴 댓글은 지울 수 있다 (잘못 쓴 경우)
drop policy if exists own_comments_delete on public.report_comments;
create policy own_comments_delete on public.report_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- 학부모가 자기 자녀 연결을 확인할 수 있게 (없으면 댓글 권한 판정이 막힌다)
drop policy if exists own_parent_link on public.parent_student;
create policy own_parent_link on public.parent_student
  for select to authenticated
  using (parent_profile_id = auth.uid() or public.is_staff());
