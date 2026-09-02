-- 0083 — 하원을 **등원과 같은 자리**에 날짜별로 남긴다 (지을 것 2번)
-- 원장님 2026-09-03 ⑩: 「**재원생 출결정보에 날짜별 기록**」 · ⑪: 「등원 알림 간다. **하원도 간다**」
--
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — 전환 전날 재적재가 이것을 다시 돈다.
--
-- ══ 왜 v2.arrival 인가 (새 표를 안 만든다)
--   옛 `public.arrival_checks` 는 `leave_at` 을 **네 번째 칸**으로 갖고 있었다.
--   v2.arrival 은 (학생, 날짜, 걸음) 한 줄이라 **날짜별이 이미 구조에 있다** —
--   여기 걸음 하나를 더하면 원장님 말씀 그대로 「등원과 같은 자리에 날짜별로」가 된다.
--   새 표를 세우면 「그날 아이가 학원에 있었던 자취」가 두 곳으로 갈린다(원칙-1).

-- ══ ① 하원은 네 번째 걸음이다
alter table v2.arrival drop constraint if exists arrival_step_1_3;
alter table v2.arrival drop constraint if exists arrival_step_1_4;
alter table v2.arrival add constraint arrival_step_1_4 check (step in (1,2,3,4));

comment on column v2.arrival.step is
  '등원 세 걸음 + 하원 — 1 핸드폰 제출 · 2 출석 체크 · 3 숙제 제출 · **4 하원(집에 감)**. '
  '⚠️ 1·2·3 의 뜻은 옛 public.arrival_checks 의 phone_at·attend_at·homework_at 에서 그대로 왔다(옛 0039). '
  '⚠️ 4 는 걸음이 아니라 **나가는 것**이다 — lib/arrival.js 의 STEPS 에 안 든다. '
  '등원을 찍은 날에만 찍히고(판단은 lib), (학생,날짜,4) 열쇠라 **하루에 한 번**이다';

-- ══ ② ⚠️⚠️ 표-10 — 「했다」의 시각은 **서버가 정한다**
-- 왜: `mine_ar`(아이 insert 규칙)은 student_id 만 본다. `at` 도 `date` 도 안 본다.
--     그래서 아이가 PostgREST 로 직접 찌르면 `at='08:00'` · `date=아무날` 로 넣을 수 있고,
--     **지각이 정시가 된다**(도착 시각이 곧 지각 판정의 유일한 재료다).
--     앱(lib/arrival.js)은 at 을 안 보내지만 **앱을 안 거치는 길이 뚫려 있다.**
--     하원도 같은 자리라 같은 자물쇠가 필요하다 — 「몇 시에 갔다」를 아이가 정하면 안 된다.
-- ⚠️ 허용 목록이 아니라 **덮어쓰기**다 — 칸이 늘어도 안 빠뜨린다(표-9 와 같은 결).
create or replace function v2.arrival_stamp() returns trigger
  language plpgsql security definer set search_path = v2, public as $fn$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️ 검사·마이그레이션·이관은 지나간다 (0082 에서 같은 자리에 다쳤다 —
  --    누구도 아닌 채로 도는 postgres 를 막으면 검사가 통째로 죽는다)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;      -- 원장·강사는 손으로 고칠 수 있다

  if tg_op = 'UPDATE' then
    raise exception '찍은 시각은 아이 손으로 못 고친다 (arrival)' using errcode = '42501';
  end if;
  -- **아이가 보낸 시각·날짜를 안 믿는다.** 서버가 제 시계로 덮는다
  new.at   := now();
  new.date := v2.today();
  return new;
end $fn$;

drop trigger if exists arrival_stamp on v2.arrival;
create trigger arrival_stamp before insert or update on v2.arrival
  for each row execute function v2.arrival_stamp();

comment on function v2.arrival_stamp() is
  '표-10 — 「했다」는 서버가 시각을 정한다. 아이가 보낸 at·date 를 now()·v2.today() 로 덮고, '
  '아이의 update 는 거절한다. ⚠️ auth.uid() 가 null 이면(검사·이관) 그냥 지나간다';

-- ══ ③ ⚠️ 하원이 **두 벌이 되지 않게** — v2.late_stay.left_at 을 걷어낸다 (원칙-1)
-- 왜: `late_stay.left_at`(「실제 하원. 차이를 같이 남긴다」, 0011)은 **같은 사실의 두 번째 집**이다.
--     둘을 두면 오늘 화면은 left_at 을, 출결 기록은 arrival 을 읽어 **같은 날 하원이 두 시각**이 된다.
--     늦귀가 카드가 보여 주던 「예상과 실제의 차이」는 그대로다 —
--     until_at(약속)은 late_stay 에 남고, 실제 하원만 arrival 에서 읽어 온다.
-- ⚠️ **센 값이다**(2026-09-03 실측): v2.late_stay 0줄 · left_at 이 든 줄 0줄 · v2.arrival 0줄.
--     지울 기록이 없다 — 대전제-6 이 지키려는 「아이가 한 일」이 이 칸에는 한 줄도 없다.
--     한 줄이라도 있었으면 옮겨 심고 나서 걷어냈어야 한다.
alter table v2.late_stay drop column if exists left_at;

comment on table v2.late_stay is
  '늦귀가 — 남아서 하고 간다. reason(사유) · until_at(**예상 귀가 = 약속**) · sent_at(보냈나). '
  '⚠️ **실제 하원은 여기 없다** — v2.arrival 의 step 4 하나뿐이다(0083, 원칙-1). '
  '「예상과 실제의 차이」는 그 둘을 견주어 **세어 나온다**(원칙-5)';
