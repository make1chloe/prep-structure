-- 0147: 빠른 메모에 사진·파일을 붙인다
--
-- 원장님 (2026-08-22) — 「어제 만든 퀵메모에 클립보드에 저장된 사진 올리기,
-- 파일, 사진 추가 가능하게 해주라」.
--
-- 수업 중 떠오른 것은 글자만이 아니다 — 칠판 사진, 받아둔 파일, 화면 캡처.
-- 빠른 메모는 오늘 할일(tasks, kind='todo')로 들어가므로, 첨부도 그 줄에 둔다.
-- 공지(0064)·알림(0068)과 같은 규칙 — 비공개 버킷, 볼 때마다 짧은 링크.
-- 다만 여기는 **선생님만** 쓰는 자리라 버킷도 staff 전용이다.

alter table public.tasks
  add column if not exists photos text[] not null default '{}';

comment on column public.tasks.photos is
  'tasks 버킷 안의 경로들. 규칙: <날짜>/<시각>-<무작위>-<원래 이름>';


-- ------------------------------------------------------------
-- 첨부가 들어갈 곳 — 비공개 버킷 (선생님 전용)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('tasks', 'tasks', false, 26214400)   -- 25MB (0064·0068 과 같은 상한)
    on conflict (id) do nothing;

    execute $p$drop policy if exists tasks_staff on storage.objects$p$;
    execute $p$
      create policy tasks_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'tasks' and public.is_staff())
        with check (bucket_id = 'tasks' and public.is_staff())
    $p$;
  end if;
end $$;
