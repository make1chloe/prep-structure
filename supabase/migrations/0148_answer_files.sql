-- 0148: 파일형 답지 — 원장이 제출을 확인해야 학생에게 열린다
--
-- 원장님 (2026-08-22) — 「답지가 DB화되지 않았을 때 업로드도 가능해야 해」
-- 「답지 없으면 그냥 제출까지, 답지 있으면 채점하라는 메시지까지 나오기」
--
-- 수업 없는 날 학생이 숙제를 내면 원장이 원격으로 「확인」 을 누르고, 그
-- 순간 답지가 열려 학생이 미리 채점해 온다 (내신 프린트가 주 용도다).
--
-- **배정 줄(daily_report_items)에 두면 안 된다** — 그 줄은 저장할 때마다
-- 통째로 지우고 다시 넣는다(saveStudentDay). 답지를 거기 붙이면 저장 한 번에
-- 날아간다. 그래서 (학생 · 학습항목 · 배정일)을 열쇠로 하는 별도 표다.

create table if not exists public.answer_files (
  student_id       uuid not null references public.students(id) on delete cascade,
  homework_item_id uuid not null references public.homework_items(id) on delete cascade,
  date             date not null,                 -- 숙제를 배정한 날
  paths            text[] not null default '{}',  -- answers 버킷 안의 경로들
  opened_at        timestamptz,                   -- 원장 확인으로 답지가 열린 시각
  created_at       timestamptz not null default now(),
  primary key (student_id, homework_item_id, date)
);

comment on table public.answer_files is
  '숙제에 붙인 파일형 답지. 원장이 제출을 확인(opened_at)해야 학생에게 열린다';
comment on column public.answer_files.paths is
  'answers 버킷 안의 경로들. 규칙: <student_id>/<homework_item_id>/<date>/<시각>-<무작위>-<원래 이름>';

alter table public.answer_files enable row level security;

drop policy if exists staff_all on public.answer_files;
create policy staff_all on public.answer_files
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 줄, 열린 것만** 읽는다. 열리기 전에는 줄 자체가 안 보인다 —
-- 「있다」 는 것만 아래 my_answer_flags 가 알려준다 (경로는 새지 않는다).
-- 학부모 정책은 일부러 없다 — 답지는 학생에게만 열린다.
drop policy if exists answers_student_read on public.answer_files;
create policy answers_student_read on public.answer_files
  for select to authenticated
  using (student_id = public.my_student_id() and opened_at is not null);

-- 「제출하면 선생님 확인 후 답지가 열려요」 힌트는 열리기 **전**에도 보여야
-- 한다. 줄을 통째로 열어주는 대신, 있고 없음·열림만 내주는 함수를 둔다
-- (0047·0064 처럼 security definer — 정책 잠금을 안 탄다).
create or replace function public.my_answer_flags(d date)
returns table(homework_item_id uuid, opened boolean)
language sql
stable
security definer
set search_path = public
as $$
  select af.homework_item_id, (af.opened_at is not null)
    from public.answer_files af
   where af.student_id = public.my_student_id()
     and af.date = d;
$$;
revoke all on function public.my_answer_flags(date) from public;
grant execute on function public.my_answer_flags(date) to authenticated;

-- 저장소 읽기 판정 — 정책 안에서 RLS 걸린 표를 직접 읽으면 조용히 거짓이
-- 된다 (0047 에서 실제로 그랬다). security definer 함수 하나로 감싼다.
create or replace function public.can_read_answer(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.answer_files af
     where af.student_id = public.my_student_id()
       and af.opened_at is not null
       and p = any(af.paths)
  );
$$;
revoke all on function public.can_read_answer(text) from public;
grant execute on function public.can_read_answer(text) to authenticated;

-- ------------------------------------------------------------
-- 답지가 들어갈 곳 — 비공개 버킷
--   쓰기는 선생님만. 학생은 **열린 자기 답지만** 읽는다 (볼 때마다 짧은 링크).
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then

    insert into storage.buckets (id, name, public, file_size_limit)
    values ('answers', 'answers', false, 26214400)   -- 25MB (0064·0147 과 같은 상한)
    on conflict (id) do nothing;

    execute $p$drop policy if exists answers_staff on storage.objects$p$;
    execute $p$
      create policy answers_staff on storage.objects
        for all to authenticated
        using (bucket_id = 'answers' and public.is_staff())
        with check (bucket_id = 'answers' and public.is_staff())
    $p$;

    execute $p$drop policy if exists answers_read on storage.objects$p$;
    execute $p$
      create policy answers_read on storage.objects
        for select to authenticated
        using (bucket_id = 'answers' and public.can_read_answer(name))
    $p$;
  end if;
end $$;
