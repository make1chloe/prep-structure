-- 0086: 학생이 **이미 누르고 있는 것**을 실시간으로 흘려보낸다
--
-- 원장님 (2026-08-05)
--   「내가 바꾸는 게 아니고, 학생이 자기가 뭘 다 했는지 누르면 나한테 보이는 걸 원하는 거야」
--
-- 맞다. 상태를 손으로 골라 넣게 하면 그것부터 일이 된다. 아이는 이미 누르고
-- 있다 — 학습을 시작하면 타이머가 돌고(study_sessions), 다 하면 「다 했어요」
-- 를 눌러 student_done_at 이 찍힌다(daily_report_items).
--
-- **새 표를 만들지 않는다.** 그 두 표의 변경을 실시간으로 받기만 하면 된다.
-- 무엇을 몇 개 했는지는 서버가 늘 세던 대로 세고, 알림이 오면 다시 센다.
--
-- 이게 없으면 조용히 안 온다. 화면에서는 「안 바뀐다」 로만 보이고 어디가
-- 막혔는지 알 방법이 없다 (0084 에서 같은 것을 못 박아 뒀다).

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;                       -- 수파베이스가 만들어 두는 것이라, 없으면 건너뛴다
  end if;
  foreach t in array array['daily_report_items', 'study_sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
