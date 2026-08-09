-- ============================================================
-- 0113. 「지금 붙잡고 있는 일」 — 할일 칸반의 가운데 칸
--
-- 원장님 (2026-08-09) — academy-video 벤치마킹
--   「할일 / 진행중 / 완료 3컬럼 드래그」
--
-- ── 왜 status 값을 안 늘리는가 ───────────────────────────
--
-- 곧이곧대로 하면 status 에 'doing' 을 하나 더 넣으면 된다. 그러면 안 된다.
--
-- tasks 는 할일만 쓰는 표가 아니다 — 학사일정 · 수업 · 보강이 같이 산다.
-- 그리고 앱 곳곳이 **`status = 'open'` 이면 남은 일**이라고 읽는다:
-- 메뉴 배지, 대시보드 「남은 일」, 달력, 필터 — 아홉 파일 쉰세 군데다.
--
-- 'doing' 을 넣으면 그 줄들은 open 도 done 도 아니게 된다. 그러면
-- **진행중으로 옮긴 할일이 배지에서도 달력에서도 통째로 사라진다.**
-- 오류는 안 난다. 원장님은 「어? 아까 그거 어디 갔지」 하시게 된다.
-- 이 앱에서 제일 자주 물린 함정이 바로 이 「조용히 안 세짐」 이다.
--
-- ── 그래서 칸 하나 ──────────────────────────────────────
--
-- 진행중은 **끝난 것이 아니라 손댄 것**이다. 그러니 status 는 'open' 그대로
-- 두고, 손댄 때만 따로 적는다.
--
--   할일   = status open · started_at 없음
--   진행중 = status open · started_at 있음      ← 여전히 open 이다
--   완료   = status done
--
-- 쉰세 군데는 한 줄도 안 건드린다. 배지도 달력도 진행중을 그대로 센다 —
-- 그게 맞다. 시작했다고 일이 없어지지는 않으니까.
--
-- 언제 손댔는지도 같이 남는다 — 「사흘째 붙잡고 있는 일」 을 나중에 볼 수 있다.
--
-- 여러 번 돌려도 같다.
-- ============================================================

alter table public.tasks
  add column if not exists started_at timestamptz;

comment on column public.tasks.started_at is
  '손대기 시작한 때 (0113). 진행중 = status open + started_at 있음 — status 는 그대로 open 이라 배지·달력이 계속 센다';

-- 진행중만 빨리 찾기 (칸반 가운데 칸)
create index if not exists tasks_started_idx
  on public.tasks (started_at)
  where started_at is not null;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.task_started_on()
returns boolean language sql immutable as $$ select true $$;
