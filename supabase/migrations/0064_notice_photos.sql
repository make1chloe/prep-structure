-- 0064: 공지에 사진을 붙인다
--
-- 학교에서 나눠준 종이 — 학사일정, 시험 시간표, 가정통신문 — 를 옮겨 적기는
-- 번거롭고, 옮겨 적다 틀리면 그게 더 큰 일이다. **찍어서 그대로 보내면 된다.**
--
--   결석 일정 · 학교 시험 일정 · 학교 공지 …
--
-- 제목도 같이 둔다. 사진만 덜렁 있으면 무엇인지 모른다.

alter table public.notices
  add column if not exists title  text,
  add column if not exists photos text[] not null default '{}';

comment on column public.notices.photos is
  'notices 버킷 안의 경로들. 규칙: <notice_id>/<파일명>';


-- ------------------------------------------------------------
-- 이 공지를 볼 수 있는 사람인가
--
-- RLS 정책 안에서 다른 RLS 표를 읽으면 서로 물고 늘어진다.
-- 그래서 security definer 로 한 겹 감싼다 (0057 과 같은 이유).
-- ------------------------------------------------------------
create or replace function public.can_read_notice(nid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_staff()
    or exists (
      select 1
        from public.notice_receipts r
        join public.students s on s.id = r.student_id
       where r.notice_id = nid and s.profile_id = auth.uid()
    )
    or exists (
      select 1
        from public.notice_receipts r
        join public.parent_student ps on ps.student_id = r.student_id
       where r.notice_id = nid and ps.parent_profile_id = auth.uid()
    );
$$;
grant execute on function public.can_read_notice(uuid) to authenticated;

-- 경로 맨 앞 칸을 uuid 로 읽는다. 이상한 이름이면 그냥 null (= 못 본다)
create or replace function public.uuid_or_null(t text)
returns uuid
language plpgsql
immutable
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.uuid_or_null(text) to authenticated;


-- 학생·학부모도 자기에게 온 공지는 읽어야 한다 (지금은 선생님만 읽는다)
drop policy if exists notice_read_mine on public.notices;
create policy notice_read_mine on public.notices
  for select to authenticated
  using (public.can_read_notice(id));

-- 자기 앞으로 온 줄만. 남에게 무엇이 갔는지는 볼 수 없다.
drop policy if exists receipt_read_mine on public.notice_receipts;
create policy receipt_read_mine on public.notice_receipts
  for select to authenticated
  using (
    notice_receipts.student_id in (select public.my_student_ids())
  );


-- ------------------------------------------------------------
-- 사진이 들어갈 곳 — 비공개 버킷
--   경로 규칙: <notice_id>/<파일명>
--   맨 앞 칸이 공지 id 라서, 그것만 보고 볼 사람인지 가릴 수 있다.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('notices', 'notices', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    execute $p$drop policy if exists notices_staff on storage.objects$p$;
    execute $p$
      create policy notices_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'notices' and public.is_staff())
        with check (bucket_id = 'notices' and public.is_staff())
    $p$;

    -- 받는 사람은 **읽기만**
    execute $p$drop policy if exists notices_read on storage.objects$p$;
    execute $p$
      create policy notices_read on storage.objects
        for select to authenticated
        using (
          bucket_id = 'notices'
          and public.can_read_notice(public.uuid_or_null((storage.foldername(name))[1]))
        )
    $p$;
  end if;
end $$;
