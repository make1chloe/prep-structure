-- 0180 (어83) 출결을 안 찍어도 수업 일지가 선다 — 기본은 「아직」 · 다시 누르면 취소 — 멱등
--
-- 원장님 2026-09-18:
--  「출석지각결석 표시 다시 누르면 선택 안한 상태로, 취소가능하게 해줘.」
--  「애초에 출석처리를 안하면 검사가 불가능하게 되어있어서 그거때문에 그래.
--    그냥 체크가 안된상태를 기본으로 두고, 예정된 수업에서도 검사및 학습배정까지 가능하다면
--    미리 해놓고 출결만 당일에 찍고 싶은거임. 그리고 실수로 찍었을때 취소하려는것도 있고.」
--
-- 무엇이 잘못돼 있었나 — **판이 출결에 매여 있었다.**
--  ① attend 는 not null 이고 0101 의 CHECK 가 일곱 값만 받았다. 「아직 안 찍음」이 없었다.
--  ② 기본값이 'present' 라, 판이 서는 순간 그 아이는 **왔다고 적힌 것**이 된다.
--     그래서 앱은 판을 함부로 못 세웠고(오늘만 세웠다 · lib/day.js), 미리 검사·배정을 하려면
--     먼저 출결을 눌러야 했다. 원장님이 말씀하신 「출석처리를 안하면 검사가 불가능」이 이것이다.
--  ③ 잘못 누른 출결을 되돌릴 값이 없었다(판을 지우는 것은 대전제-6 이 막는다).
--
-- 그래서 값 하나('none')를 더하고 **기본값을 그리로 옮긴다.** 그러면 판은 「아직 아무것도
-- 안 적힌 종이」가 되어 며칠 전부터 세워 둘 수 있고, 출결은 당일에 찍으면 된다.
--
-- ⚠️ **이미 있는 줄은 안 건드린다.** 지난 판의 'present' 는 그대로 둔다 — 지난 기록을
--    조용히 고치는 것은 대전제-0 에 어긋난다(그날 화면이 말한 것과 달라진다).
--
-- 읽는 자리 — 다 그대로 산다:
--   lib/cal-plan.js  달력 아이콘  → 어느 갈래에도 안 들어 **아무 표시도 안 그린다**(맞다)
--   lib/student-plan 출결 셈      → 'none' 은 안 센다(앱에서 막았다)
--   v2.warn_days     경고         → late·absent 만 세니 그대로
--   0078 아이 등원   정책         → 아이는 present·late 로만 찍는다 · 그대로 둔다
begin;

alter table v2.day_sheet drop constraint if exists day_sheet_attend_check;
alter table v2.day_sheet add constraint day_sheet_attend_check
  check (attend in ('present', 'late', 'absent', 'early', 'online', 'makeup', 'off', 'none'));

alter table v2.day_sheet alter column attend set default 'none';

comment on column v2.day_sheet.attend is
  '출결 — none 아직 안 찍음(0180 · **기본값** · 같은 칩을 다시 누르면 여기로 돌아온다) · present 왔음 · late 지각 · absent 결석 · early 조퇴 · online 온라인 · makeup 보강으로 온 날(앱이 채운다, 0109) · off 휴강(사람이 고르지 않는다). 쓰는 길은 lib/attend.js attendanceWrite 하나(검사-②)';

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';
