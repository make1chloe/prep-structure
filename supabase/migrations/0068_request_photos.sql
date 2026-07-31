-- 0068: 학생·학부모가 사진으로 알린다
--
-- 결석을 알릴 때 "가족 여행" 이라고 적는 것과, 학교에서 나눠준 종이를 찍어
-- 보내는 것은 다르다.
--
--   · 체험학습 신청서 · 학교 행사 안내문   → 결석 사유가 종이에 그대로 있다
--   · 학교 시험 시간표                     → 옮겨 적으면 틀린다. 틀리면 큰일이다
--   · 학교 가정통신문                      → 사진 한 장이면 끝난다
--
-- 옮겨 적게 하지 말고 찍어서 보내게 한다.
--
-- 파일은 비공개 버킷에 넣는다. 경로 맨 앞 칸이 학생 id 라서, 그것만 보고
-- 누구 것인지 가릴 수 있다 (0044 와 같은 규칙).
-- 다만 여기는 **학부모도 올린다.** 결석을 알리는 건 대개 학부모다.

alter table public.requests
  add column if not exists photos text[] not null default '{}';

comment on column public.requests.photos is
  'requests 버킷 안의 경로들. 규칙: <student_id>/<파일명>';


do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('requests', 'requests', false, 26214400)   -- 25MB
    on conflict (id) do nothing;

    -- 선생님은 전부 본다
    execute $p$drop policy if exists requests_staff on storage.objects$p$;
    execute $p$
      create policy requests_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'requests' and public.is_staff())
        with check (bucket_id = 'requests' and public.is_staff())
    $p$;

    -- 학생 본인과 그 학부모만, 그 아이 폴더에.
    -- my_student_ids() 가 둘 다를 한 번에 답해준다 (0057).
    execute $p$drop policy if exists requests_own on storage.objects$p$;
    execute $p$
      create policy requests_own on storage.objects
        for all to authenticated
        using (
          bucket_id = 'requests'
          and public.uuid_or_null((storage.foldername(name))[1])
              in (select public.my_student_ids())
        )
        with check (
          bucket_id = 'requests'
          and public.uuid_or_null((storage.foldername(name))[1])
              in (select public.my_student_ids())
        )
    $p$;
  end if;
end $$;
