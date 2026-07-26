-- 0010: 학생별 교재 배정 · 단원 진도 (순서 무관 체크)
-- 안전하게 여러 번 실행 가능합니다.
--
-- 설계 메모 (원칙1: 같은 값 두 번 입력하지 않기)
--   교재 단원은 textbook_units 한 곳에만 있다. 학생별로 복사하지 않는다.
--   학생이 "끝낸 단원"만 student_unit_progress 에 한 줄씩 쌓는다.
--   줄이 없으면 = 아직 안 한 단원. 그래서 순서와 무관하게 아무 단원이나 체크할 수 있다.

-- 학생 ← 교재 배정 (반에 교재를 붙이면 그 반 학생 전원에게 자동으로 깔린다)
create table if not exists public.student_textbooks (
  student_id  uuid not null references public.students(id) on delete cascade,
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  assigned_on date not null default current_date,
  status      text not null default 'active',   -- active | done | dropped
  primary key (student_id, textbook_id)
);
create index if not exists student_textbooks_book_idx
  on public.student_textbooks (textbook_id);

-- 학생별 단원 진도 — 완료한(또는 진행중인) 단원만 기록
create table if not exists public.student_unit_progress (
  student_id       uuid not null references public.students(id) on delete cascade,
  textbook_unit_id uuid not null references public.textbook_units(id) on delete cascade,
  status           text not null default 'done',   -- done | doing | skip
  done_on          date default current_date,
  note             text,
  primary key (student_id, textbook_unit_id)
);
create index if not exists student_unit_progress_unit_idx
  on public.student_unit_progress (textbook_unit_id);

do $$
declare t text;
begin
  foreach t in array array['student_textbooks','student_unit_progress'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;
