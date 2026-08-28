-- **적는 중 내용의 잠정 노출 차단** (마이그1 v2 §1-2 — #7. 원장 확정
-- 8/27: 「할 일은 실시간, 리포트는 마감 전 통째 비노출」·점수는 공개).
--
-- 지금은 원장이 판에 적는 순간 검사 결과·공지가 학부모/학생 화면에
-- 실시간으로 뜬다 — 적다 만 문장·정정 전 판정이 그대로 새는 사고(#7).
-- 게이트: 학생·학부모에게는
--   할 일(assigned·inclass·plan_next 화이트리스트) = 항상 보임
--   검사 3상태(done·weak·missing) = **마감(report_written) 후에만**
--   숨긴 판(0168 archived) = 아예 안 보임
-- notice·report_text 칸은 RLS 로 못 가리므로(행 단위) 화면 쪽
-- (lib/homeworkView loadReports·/parent 조회)에서 같은 게이트를 탄다.
--
-- closed_at 칸은 그라운드만 — 마감의 정본을 report_written 에서
-- closed_at 으로 옮기는 공사는 별도(그때 report_gate 몸통만 교체하면
-- 정책은 무수정).
--
-- ── 2026-08-28: 위의 「점수는 공개」 를 원장이 뒤집었다 ──────────
--
-- 원장 확정 8/28 — **「무조건 마감된 것만 학생·학부모에게 공개한다」.**
-- 위 8/27 확정 문구는 그때의 판단이라 지우지 않고 그대로 남긴다.
--
-- 이 파일(SQL)은 **안 고친다.** 남아 있던 구멍은 전부 **칸 단위**라
-- 행 단위인 RLS 로는 가릴 수가 없기 때문이다:
--   · 단어·문법 점수(word_*·sent_*) · 진도(own_progress) — daily_reports 의 칸
--   · 월간리포트 문구 — 원장 눈(is_staff)으로 세던 것이라 정책이 안 걸린다
-- 행을 통째로 막는 길은 없다 — 그 행에 오늘 나간 숙제(assigned)와 출결이
-- 같이 붙어 있어서, 막으면 아이 화면에서 오늘 숙제가 통째로 사라진다.
--
-- 그래서 같은 뜻의 판정을 화면 쪽에 **한 벌**로 두었다 — `lib/closeGate.js`
-- 의 `isClosed()` 가 아래 report_gate() 와 같은 뜻이다. 셈하는 자리
-- (lib/monthly summarize)와 읽는 자리(lib/homeworkView loadReports,
-- /parent · /monthly 조회)가 그것을 탄다. 마감의 정본을 closed_at 으로
-- 옮길 때는 **아래 report_gate 몸통과 lib/closeGate 둘 다** 고친다.
--
-- 되돌리기:
--   (구 정책 복원 — 0090/0158 판 원문)
--   drop function if exists public.report_gate(public.daily_reports);
--   drop function if exists public.close_gate_on();
--   alter table public.daily_reports drop column if exists closed_at,
--     drop column if exists closed_reason;
--   + 이 파일 아래 두 정책을 0090 원문으로 재생성

alter table public.daily_reports
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

-- 마감 판정 한 곳 — 나중에 closed_at 이관 때 이 몸통만 바꾼다
create or replace function public.report_gate(r public.daily_reports)
returns boolean
language sql stable as $$
  select r.report_written or r.closed_at is not null
$$;

drop policy if exists student_self_reports on public.daily_reports;
create policy student_self_reports on public.daily_reports
  for select to authenticated
  using (
    public.is_staff()
    or (
      daily_reports.student_id in (select public.my_student_ids())
      and daily_reports.archived_at is null            -- 휴지통 판 비노출 (0168)
    )
  );

drop policy if exists student_self_items on public.daily_report_items;
create policy student_self_items on public.daily_report_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.daily_reports r
       where r.id = daily_report_items.daily_report_id
         and r.student_id in (select public.my_student_ids())
         and r.archived_at is null
         and (
           -- 할 일은 실시간 (화이트리스트 — 미래 status 자동 공개 방지)
           daily_report_items.status in ('assigned','inclass','plan_next')
           -- 검사 결과는 마감 후에만 (원장 확정 — 리포트 부분 통째)
           or public.report_gate(r)
         )
    )
  );

create or replace function public.close_gate_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.close_gate_on() to authenticated;
