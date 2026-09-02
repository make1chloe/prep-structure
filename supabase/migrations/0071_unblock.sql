-- 0071 · 막힌 것 넷 담당이 요청한 DB (검증자 확인)

-- ══ [발송 손] 늦귀가를 「보낸 것만」 가족이 볼 수 있게 하는 함수 (마이그레이션 새 파일, 예: supabase/migrations/0071_late_family.sql)
-- 왜: **실측**: 늦귀가를 보내고 학부모가 알림을 눌러 들어와도 **0줄**이 보인다 (마감 뒤에야 1줄). 접근 규칙 `v2.sheet_visible()` 이 `closed_at` 을 요구하는데, 늦귀가는 **마감 몇 시간 전에 보내는 것**이라 어긋난다. 그러면 「앱에서 확인해주세요」를 눌러도 아무것도 없고, 학부모는 앱이 고장 난 줄 안다. ⚠️ 표 정책을 넓히지 않고 **보낸 줄만** 돌려주는 security definer 함수 한 개로 막는다 — 판(day_sheet)은 그대로 마감해야 보인다(사고 #7 의 방벽을 안 건드린다). 진짜 DB 에서 돌려 보고 되돌렸다: 마감 전에 학부모가 「재시험 남음 · 21:00」을 보고, 표를 직접 읽으면 여전히 0줄이다. ⚠️ 접근 규칙은 내 담당이 아니라 마이그레이션을 넣지 않았다 — 검토 후 넣어야 한다.
-- 0071 · 늦귀가는 **보낸 것만** 가족에게 보인다 — 마감을 기다리지 않는다
-- ⚠️ 까닭: 늦귀가 안내는 마감 몇 시간 전에 나간다. 지금은 알림을 눌러 들어와도
--    v2.sheet_visible() 이 closed_at 을 요구해 **0줄**이라 아무것도 안 보인다(실측).
-- ⚠️ 표 정책은 안 넓힌다 — 판(day_sheet)은 그대로 마감해야 보인다(사고 #7).
--    보낸 늦귀가 한 줄만 돌려주는 함수로 좁게 연다.
-- ⚠️ 원장·강사는 staff_all 로 이미 다 본다. 이 함수는 v2.my_students() 를 지나므로
--    원장이 부르면 0줄이다 — 원장 화면에서 쓰라고 만든 것이 아니다.
create or replace function v2.late_for_family()
returns table (id uuid, student_id uuid, student_name text, on_date date,
               reason text, until_at time, left_at time, sent_at timestamptz)
language sql stable security definer set search_path = v2, public as $$
  select l.id, s.student_id, st.name, s.date, l.reason, l.until_at, l.left_at, l.sent_at
    from v2.late_stay l
    join v2.day_sheet s on s.id = l.sheet_id
    join v2.students st on st.id = s.student_id
   where l.sent_at is not null
     and s.student_id in (select v2.my_students())
$$;
grant execute on function v2.late_for_family() to authenticated;
comment on function v2.late_for_family() is
  '보낸 늦귀가만 가족에게. 마감을 기다리지 않는다 — 안 그러면 알림을 눌러도 아무것도 안 보인다';

-- ══ [속도] v2.cursors_of(학생 uuid, 날짜 date) — 한 아이의 교재 커서를 한 판에 주는 함수
-- 왜: 지금은 교재 한 권마다 v2.cursor_of 를 따로 부른다(장원우 6권 = 조회 6번). lib/fast.js 가 지금은 같은 일을 lateral 로 앱 쪽에서 하고 있는데(왕복은 이미 하나), 이 함수가 서면 그 SQL 이 DB 안으로 들어가 다른 화면도 그대로 부를 수 있다. ⚠️ 커서 차례를 다시 짜지 않는다 — 안에서 v2.cursor_of 를 부르기만 한다(계획 ㊻ · 사고 118). ⚠️ 두 칸짜리(오늘 기준)를 부른다 — 세 칸짜리(날짜 받는 것)로 바꾸면 지난 날짜 판의 답이 달라지므로 여기서 슬쩍 바꾸지 않는다. 트랜잭션 안에서 실제로 만들어 돌려 봤고(위 proof 5) 지금 lib 이 쓰는 SQL 과 줄이 글자까지 같았다. 이 함수가 DB 에 서면 check-fast.mjs ⑥ 이 「DB 에는 있는데 lib 이 아직 안 쓴다」로 빨개진다 — 그때 lib/fast.js 의 Q_CURSORS 를 `select book_id, round, chapter, is_workbook, left_in_chapter from v2.cursors_of($1::uuid, $2::date)` 한 줄로 갈아 끼우면 된다.
-- ══ [숙제 차리기 · 속도] `v2.cursors_of(학생, 날짜)` — 한 아이의 **교재 커서를 한 판에**
-- 왜: 지금은 교재 한 권마다 `v2.cursor_of` 를 따로 부른다. 교재 6권짜리 아이 하나를 열면
--     그것만 조회 6번이다(실측 2026-09-02 장원우 · `routineNext` 통째로는 27번).
-- ⚠️⚠️ **커서 차례를 다시 짜지 않는다.** 이 함수는 `v2.cursor_of` 를 lateral 로 **부르기만** 한다 —
--     정렬 셋(대단원 차례 → 갈래 → 줄 차례) 중 하나만 옮겨 적다 빠뜨려도 오류가 안 나고
--     **조용히 틀린 차례**로 나간다(계획 ㊻ · 사고 118 · 0022 가 이미 한 번 겪은 자리).
-- ⚠️ 커서는 **두 칸짜리**(오늘 기준)를 부른다 — 지금 앱이 그렇게 읽고 있고, 세 칸짜리(날짜 받는 것)로
--     바꾸면 지난 날짜 판의 **답이 달라진다**. 그건 따로 정할 일이라 여기서 슬쩍 바꾸지 않는다.
-- 교재를 고르는 조건은 `lib/routine.js` 의 `booksOf` 와 **글자 그대로 같다**.
create or replace function v2.cursors_of(p_student uuid, p_on date)
returns table (book_id uuid, round smallint, chapter text, is_workbook boolean, left_in_chapter int)
language sql stable as $$
  select sb.book_id, c.round, c.chapter, c.is_workbook, c.left_in_chapter
    from v2.student_book sb
    cross join lateral v2.cursor_of(p_student, sb.book_id) c
   where sb.student_id = p_student
     and sb.from_date <= p_on
     and (sb.to_date is null or sb.to_date >= p_on)
$$;
comment on function v2.cursors_of is
  '한 아이의 교재 커서를 한 판에. ⚠️ 차례는 v2.cursor_of 것을 그대로 쓴다 — 여기서 다시 짜면 조용히 틀린다';
grant execute on function v2.cursors_of(uuid, date) to authenticated;

-- ══ [설정 화면] `v2.stop_rule.weeks` 에 값 제약 한 줄
-- 왜: 계획 (d) 「고르는 값은 DB 에도 건다 — 엑셀이 화면 제약을 뚫는 유일한 길이다」. 실측으로 확인했다: 트랜잭션 안에서 `update v2.stop_rule set weeks = 999 where level='high'` 가 **1줄 들어갔다.** 화면은 0~52 로 막지만 엑셀·SQL 로 오면 그냥 들어간다. 내 검사가 매번 이 자리를 재서 「코드로는 못 고치는 것」에 세운다 — 이 SQL 이 들어오면 그 줄이 사라진다.
alter table v2.stop_rule
  add constraint stop_rule_weeks_ok check (weeks between 0 and 52);

-- ══ [설정 화면] (조건부) `v2.progress_open_days()` 를 「켠 날이 1일째」로
-- 왜: ⚠️ **원장님 확인 전에는 넣지 마라.** 실측 — 켠 날이 오늘이면 이 함수가 **0** 을 준다. 대시보드가 그 값에 「일째」를 붙이므로 켠 날 화면에 「진도 체크가 0일째 열려 있습니다」가 뜬다. 한국어 「N일째」는 켠 날이 1일째다. 다만 계획서 ㊶ 의 보기(「12일째」)는 오늘 값과도 맞아 어느 쪽인지 못 가른다. 「0일째」가 이상하다고 원장님이 확인해 주시면 이 한 줄이다. 넣으면 대시보드와 설정 두 화면이 같이 바뀐다(둘 다 같은 함수를 부른다).
create or replace function v2.progress_open_days() returns integer
language sql stable as $$
  select case when is_open then (v2.today() - opened_on) + 1 else null end
  from v2.progress_edit where scope='academy'
$$;
