-- 0047: 숙제 파일이 안 올라가던 것
--
-- 학생이 녹음을 내면 "new row violates row-level security policy" 가 났다.
--
-- 0044 의 저장소 규칙은 정책 안에서 public.students 를 직접 뒤졌다.
--
--   exists (select 1 from public.students s
--            where s.profile_id = auth.uid()
--              and s.id::text = (storage.foldername(name))[1])
--
-- 이 조회는 **부르는 사람 권한으로** 돈다. 그래서 students 의 잠금(RLS)에
-- 한 번 더 걸리고, 그 안에서 또 다른 표를 보게 되면 조용히 거짓이 된다.
-- 정책 안에서 다른 표를 뒤지는 것 자체가 약한 설계였다.
--
-- 그래서 **"지금 나는 어느 학생인가" 를 돌려주는 함수 하나**로 바꾼다.
-- 이 함수는 security definer 라 잠금을 타지 않는다. 정책은 값 하나만 비교한다.

create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.profile_id = auth.uid() limit 1;
$$;

revoke all on function public.my_student_id() from public;
grant execute on function public.my_student_id() to authenticated;


-- ------------------------------------------------------------
-- 숙제 제출 표 — 정책을 함수 하나로 단순화
-- ------------------------------------------------------------
drop policy if exists own_all on public.homework_submissions;
create policy own_all on public.homework_submissions
  for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());


-- ------------------------------------------------------------
-- 저장소 — 경로 맨 앞이 내 학생 id 인 것만
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'objects') then

    execute $p$drop policy if exists submissions_own on storage.objects$p$;
    execute $p$
      create policy submissions_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'submissions'
          and (storage.foldername(name))[1] = public.my_student_id()::text
        )
        with check (
          bucket_id = 'submissions'
          and (storage.foldername(name))[1] = public.my_student_id()::text
        )
    $p$;

    -- 선생님은 전부 (체험 모드로 대신 낼 때도 여기로 통과한다)
    execute $p$drop policy if exists submissions_staff on storage.objects$p$;
    execute $p$
      create policy submissions_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'submissions' and public.is_staff())
        with check (bucket_id = 'submissions' and public.is_staff())
    $p$;
  end if;
end $$;


-- 버킷이 아직 없으면 만든다 (0044 에서 못 만들었을 수도 있다)
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('submissions', 'submissions', false, 26214400)
    on conflict (id) do nothing;
  end if;
end $$;
