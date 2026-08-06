-- ============================================================
-- 0103. 보강 없음 — 결석했지만 보강을 안 하기로 한 것
--
-- 원장님 (2026-08-06)
--   「Dashboard 에 보강일정 잡으라는데 아직 결석 안 했고 사전연락 없는데
--    뭐지. 대시보드에서 보강 없음 버튼도 만들어줘」
--
-- ── 왜 필요한가 ──────────────────────────────────────────
--
-- 「보강 잡을 것」 은 **결석 줄이 있는데 보강 줄이 없으면** 뜬다. 그래서
-- 보강을 안 하기로 한 결석은 **영원히 목록에 남는다.** 치우는 길이
-- 「없는 보강을 억지로 잡기」 밖에 없었다 — 그러면 출결 기록이 거짓이 된다.
--
-- 결석은 결석대로 남기고, **보강은 안 한다**는 것만 따로 적는다.
-- 지우지 않는 이유는 늘 같다: 회차·수강료가 그 결석을 세고 있다.
--
-- 흔한 경우
--   · 당일 결석 (원장님 규칙상 보강 없음)
--   · 시험 기간 결석 예정을 한꺼번에 넣었는데 실제로는 안 빠진 아이
--   · 노션에서 옮겨온 옛 결석 — 이미 지난 일이라 보강할 것이 없다
-- ============================================================

alter table public.attendance add column if not exists makeup_waived boolean not null default false;

comment on column public.attendance.makeup_waived is
  '보강을 안 하기로 한 결석 (0103). 결석 기록은 그대로 두고 「보강 잡을 것」 에서만 내린다';

-- 「보강 잡을 것」 을 셀 때 쓰는 길
create index if not exists attendance_makeup_waived_idx
  on public.attendance (status, makeup_waived) where status = 'absent';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.makeup_waived_on()
returns boolean language sql immutable as $$ select true $$;
