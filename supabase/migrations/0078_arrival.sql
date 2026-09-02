-- 0078 · 아이가 등원 찍기 — 담당이 요청하고 검증자가 확인한 DB 다섯
-- ⚠️ **몇 번을 돌려도 같은 결과**여야 한다 — 전환 전날 재적재가 이것을 다시 돈다.

-- ══ [아이가 등원 찍기] v2.day_sheet 에 **학생용 insert 규칙**을 넣는다 (아이가 찍으면 그날 판이 서게)
-- 왜: ⚠️⚠️ **가장 급하다 — 이것 없이는 기능이 절반만 돈다.** 실측 2026-09-02: 아이 자격으로 판을 세우면 `new row violates row-level security policy for table "day_sheet"` (42501). 권한(GRANT INSERT/SELECT/UPDATE)은 이미 있고 **규칙만 없다.** 지금은 아이가 찍으면 v2.arrival 에는 남는데 원장님 오늘 화면에는 **안 뜬다.** 옛 앱은 이 자리를 security definer 함수로 우회했지만 그러면 판단이 SQL 로 새므로 안 했다. 규칙은 최대한 좁혔다 — 제 아이만 · 오늘만 · present/late 만 · 마감·발송 전만 · **실제로 등원을 찍은 날만**(v2.arrival 에 그날 줄이 있어야 한다). update 는 일부러 안 열었다(unknowns 참고).
-- 아이가 등원을 찍으면 그날 판이 선다 — **아이가 세울 수 있는 판은 이것뿐이다**
-- ⚠️ update 는 열지 않는다. 원장님이 미리 찍어 둔 결석·지각 예정을 아이가 덮을지는 아직 안 정했다.
drop policy if exists own_arrival_sheet on v2.day_sheet;
create policy own_arrival_sheet on v2.day_sheet
  for insert to authenticated
  with check (
    student_id in (select v2.my_own_student())          -- 제 아이만 (학부모의 아이는 안 든다)
    and date = v2.today()                                -- 오늘만. 앞날·지난날은 못 세운다
    and attend in ('present','late')                     -- 결석·휴강은 아이가 못 찍는다
    and closed_at is null and sent_at is null            -- 마감·발송한 판은 못 만든다
    and comment is null and staff_note is null           -- 부모님께 나갈 글은 아이가 못 쓴다
    and exists (select 1 from v2.arrival a               -- **실제로 찍은 날만**
                 where a.student_id = day_sheet.student_id and a.date = day_sheet.date)
  );

comment on policy own_arrival_sheet on v2.day_sheet is
  '아이가 등원을 찍으면 그날 판이 선다 (lib/arrival.js → lib/attend.js attendanceWrite via=arrival). '
  '⚠️ 오늘·제 아이·present|late·마감 전만. 등원을 실제로 찍은 날에만 선다';

-- ══ [아이가 등원 찍기] v2.arrival 의 insert 규칙을 **제 아이만**으로 좁힌다 (지금은 학부모도 찍을 수 있다)
-- 왜: 지금 `mine_ar` 은 `student_id in (select v2.my_students())` 인데 `my_students()` 에는 **학부모의 아이가 들어 있다**(실측 — my_students 는 자기 학생 union parent_student). 그러면 **학부모가 집에서 아이 등원을 찍을 수 있다.** 앱(lib/arrival.js)은 `my_own_student()` 로 막지만 PostgREST 로 직접 찌르면 뚫린다. 「학원 아이피로 접속해야 하는 조건」이 뜻을 잃는 자리라 규칙 쪽에서도 막아야 한다.
-- ⚠️ 학부모가 집에서 아이 등원을 찍는 길을 막는다 — 등원은 **아이 본인**이 찍는다
drop policy if exists mine_ar on v2.arrival;
drop policy if exists mine_ar on v2.arrival;
create policy mine_ar on v2.arrival
  for insert to authenticated
  with check (student_id in (select v2.my_own_student()));

comment on policy mine_ar on v2.arrival is
  '⚠️ my_students() 가 아니라 my_own_student() 다 — 앞엣것은 학부모의 아이까지 들어 '
  '학부모가 집에서 등원을 찍을 수 있었다 (2026-09-02)';

-- ══ [아이가 등원 찍기] v2.arrival.step 에 1·2·3 제약과 뜻(주석)을 붙인다
-- 왜: 실측: `v2.arrival` 에 check 제약이 **0개**다. `step` 이 smallint not null 일 뿐이라 9번째 걸음도, -1 도 그대로 들어간다. 그러면 화면이 못 그리는 줄이 조용히 쌓인다. 그리고 걸음의 뜻이 지금 **코드 주석에만** 있다 — 표 쪽에 남겨야 다음 사람이 옛 앱을 뒤지지 않는다 (뜻의 출처: 옛 public.arrival_checks 의 phone_at·attend_at·homework_at 과 옛 0039 주석).
-- 등원은 세 걸음뿐이다 (표-유도: 「하루에 세 줄까지」)
alter table v2.arrival drop constraint if exists arrival_step_1_3;
alter table v2.arrival add constraint arrival_step_1_3 check (step in (1,2,3));

comment on column v2.arrival.step is
  '등원 걸음 — 1 핸드폰 제출 · 2 출석 체크 · 3 숙제 제출. '
  '⚠️ 뜻은 옛 public.arrival_checks 의 phone_at·attend_at·homework_at 에서 그대로 왔다(옛 0039). '
  '하원(옛 leave_at)은 여기 없다';

comment on column v2.arrival.at is
  '⚠️ **이 표에서 저장하는 유일한 사실.** 아이가 찍은 그 시각이 곧 도착 시각이다(원장님 2026-09-02). '
  '지각 여부와 몇 분 늦었는지는 반 시각(v2.class_schedule.start_time)과 견주어 **세어 나온다** — '
  '아무 데도 저장하지 않는다(원칙 5). 세는 자리는 lib/arrival.js 의 lateOf() 한 곳이다';

-- ══ [아이가 등원 찍기] v2.integration 에 `arrival` 설정 한 줄을 세운다 (학원 IP 대역 · 유예 분)
-- 왜: 지금 그 줄이 **없다**(실측 — integration 에 academy·anthropic·message·missing·neis·purge·push·schedule·score_form·solapi·tuition·warning·webhook 뿐). 없으면 내 관문은 **아이를 막는다**(「그냥 통과」로 두지 않았다 — 옛 앱이 그랬고 그 결과 옛 academy_net 은 0줄인 채 조건이 이름만 있었다). 이 줄은 **모양과 기본값을 굳히는 것**이고, 실제로 여는 것은 **원장님이 학원에서 `POST /api/arrival {act:"allow"}` 를 한 번 누르는 것**이다(그때 그 자리 IP 가 ips 에 들어간다). ⚠️ 여기에 IP 를 미리 적지 않는다 — 학원 회선 주소를 나는 모른다(지어내지 않는다).
-- 등원 설정 한 줄. ⚠️ ips 는 **비워 둔다** — 원장님이 학원에서 한 번 눌러 채우신다
-- (POST /api/arrival {"act":"allow","note":"학원 와이파이"} — 그 자리의 IP 가 들어간다)
-- ⚠️ 비어 있는 동안 아이는 등원을 **못 찍는다.** 그것이 「그냥 통과」보다 맞다:
--    통과로 두면 아이가 집에서·오는 길에 찍고 그 시각이 그대로 도착 시각이 된다.
--    원장·강사는 이 관문을 안 지나므로 그동안에도 손으로 찍어 줄 수 있다.
insert into v2.integration (id, config)
values ('arrival', jsonb_build_object(
          'ips',      '[]'::jsonb,   -- 학원 회선 주소들 (IPv6 는 앞 4덩어리=/64 로 견준다)
          'graceMin', 0,             -- 몇 분까지는 정시로 볼까 (⚠️ 원장님이 안 정하셔서 0)
          'note',     ''))
on conflict (id) do nothing;

comment on table v2.integration is
  '바깥 서비스 연동 한 줄 (알림 VAPID · 문자 · 나이스 · AI · 수강료·경고 기준 · 등원 학원회선). '
  '⚠️ **평문 열쇠가 든다** — 원장·강사만 본다. 아이·학부모에게 한 줄도 안 나간다';

-- ══ [아이가 등원 찍기] v2.holiday 에 읽기 규칙을 넣는다 (아이가 제 반 휴강을 볼 수 있게)
-- 왜: 실측: `v2.holiday` 의 규칙은 `staff_all` 뿐이라 학생으로 갈아타면 **0줄**이다. 그래서 아이가 등원을 찍을 때 「휴강이 없다」와 「휴강을 못 읽었다」를 못 가른다 — 휴강일에 찍으면 반이 있는 것처럼 세어 엉뚱한 반에 판이 설 수 있다. 권한(SELECT)은 이미 있고 규칙만 없다. 실제 영향은 작지만(휴강일에 아이가 와서 찍을 일이 드물다) 「못 봤다」를 남겨 두지 않는 쪽이 맞다.
-- 아이·학부모가 **제 반 휴강**만 본다 (학원 전체 휴강은 누구나)
drop policy if exists own_holiday_read on v2.holiday;
create policy own_holiday_read on v2.holiday
  for select to authenticated
  using (
    class_id is null                                    -- 학원 전체 휴강
    or class_id in (select m.class_id from v2.class_member m
                     where m.student_id in (select v2.my_students()))
  );

comment on policy own_holiday_read on v2.holiday is
  '⚠️ 이 규칙이 없으면 아이 자격으로 휴강이 0줄로 읽혀 「휴강 없음」과 「못 읽음」이 같아 보인다 '
  '(lib/arrival.js classOfDay, 2026-09-02)';
