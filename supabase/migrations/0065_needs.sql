-- 0065 · 진도·숙제 담당이 요청한 DB (검증자가 캔 것 포함)
-- ⚠️ PostgREST 노출은 여기 안 넣는다 — **v2 밖 설정**이라 지금 건드리면 구앱을 만진다.
--    계획 0단계 9번 · 6단계 전환일 체크리스트로 넘긴다.

-- ══ [진도 올리기] v2.progress 에 marked_on(마지막으로 만진 날) 칸
-- 왜: 지금 done_on 은 ○ 일 때만 찬다 — ◐ 에는 날짜가 아예 없다. 그래서 ⑴ 리포트의 「오늘 나간 진도」에서 ◐ 인 단원이 빠져 원장님이 손으로 다시 쓰고, ⑵ ✕ 가 「오늘 찍은 ◐」인지 몰라 못 내린다(지금은 안 건드리는 쪽으로 두었다 — lib/progress.js:249-251 에 ⚠️ 로 적어 두었다). 칸이 생기면 그 두 줄만 marked_on 을 보게 고치면 된다
alter table v2.progress add column marked_on date;
update v2.progress set marked_on = done_on where done_on is not null;
comment on column v2.progress.marked_on is
  '마지막으로 만진 날. ⚠️ done_on 은 ○ 일 때만 찬다 — ◐ 에 날짜가 없으면 「오늘 나간 진도」에서 빠지고, ✕ 가 「오늘 찍은 ◐」인지 몰라 못 내린다';

-- ══ [진도 올리기] v2.progress 에 skip_why(건너뛴 까닭) 칸
-- 왜: 계획 1102줄은 「학생 × 단원 × 사유」 한 줄을 요구하는데 지금은 status='skip' 낱말만 있고 사유 칸이 없다. 사유가 없으면 「지운 것」과 「안 한 채로 넘어간 것」이 진도율·월간 리포트에서 구별이 안 된다. (실측 skip 줄은 아직 0)
alter table v2.progress add column skip_why text;
comment on column v2.progress.skip_why is
  '건너뛴 까닭 (계획 1102). ⚠️ 지운 것이 아니라 「안 한 채로 넘어간 것」이라 진도율·월간 리포트에서 구별된다';
insert into v2.purge_map(tbl,col,how,note) values
  ('progress','skip_why','null','원장이 쓴 말') on conflict do nothing;

-- ══ [진도 올리기] 「확인 기다리는 중」 대기열 부분 인덱스
-- 왜: 절 ㊶ ④ 「아이가 찍은 것 14개」를 한 자리에 띄우는 조회(lib/progress.js Q.pending)가 progress 3천 줄을 다 훑는다. progress_flag 에는 seen_at IS NULL 부분 인덱스가 이미 있는데 progress 쪽에는 짝이 없다
create index if not exists progress_pending_idx
  on v2.progress (updated_at desc)
  where last_by = 'student' and confirmed = false;
comment on index v2.progress_pending_idx is
  '아이가 찍고 원장님이 아직 확인 안 한 줄 — 절 ㊶ ④ 「한 번에 확인/되돌림」이 이걸 탄다';

-- ══ [진도 올리기] v2.progress_part 에 같은 조각 두 번 막는 제약
-- 왜: 지금 열쇠가 id 하나뿐이라 같은 조각을 두 번 저장해도 DB 가 안 막는다. lib 쪽에서는 넣기 전에 같은 줄이 있는지 보고(Q.partSeen) 쪽 목록을 Set 으로 세므로 덮음 판정이 부풀지는 않지만, 옆문으로 들어온 중복 줄은 못 막는다. (실측 progress_part 0줄 · 겹치는 조각 0줄이라 지금 걸면 그냥 걸린다)
alter table v2.progress_part add constraint progress_part_one_span
  unique nulls not distinct (student_id, unit_id, round, q_from, q_to, page_from, page_to);
comment on constraint progress_part_one_span on v2.progress_part is
  '같은 조각을 두 번 남기지 않는다 — 겹친 조각이 분량을 부풀리면 원본이 잘못 완료로 올라간다';

-- ══ [숙제 차리기] 루틴 `place` 에 「예습(next)」 자리를 더한다
-- 왜: ⚠️ **가장 급하다.** 계획 ⑨ 의 루틴 세 칸은 `등원 · 숙제 · 예습숙제-다음단원` 인데 0010 이 만든 place 는 class·home·both **셋뿐**이라 예습 칸이 없다. 지금 lib/routine.js 는 **항목 이름에 「예습」이 들었나**로 가르고 있다(실측 「교재예습」 한 종류, 단어·독해). 원장님이 항목 이름을 「미리보기」 같은 말로 바꾸시면 그 줄이 **조용히 숙제 묶음으로 간다** — 오류도 안 나고 예습이 사라진 것을 아무도 모른다. 이 SQL 이 들어오면 isPreview() 의 첫 줄(place==='next')만 살고 이름으로 가르는 줄은 지운다.
-- 0064 · 루틴에 「예습」 자리를 더한다 (계획 ⑨)
alter table v2.area_routine drop constraint area_routine_place_check;
alter table v2.area_routine add constraint area_routine_place_check
  check (place in ('class','home','both','next'));
alter table v2.student_routine drop constraint student_routine_place_check;
alter table v2.student_routine add constraint student_routine_place_check
  check (place in ('class','home','both','next'));

-- 실측: 「교재예습」 2줄(단어·독해)만 옮겨진다
update v2.area_routine r set place = 'next'
  from v2.learn_items li
 where li.id = r.item_id and li.name like '%예습%' and r.place = 'home';

comment on column v2.area_routine.place is
  '학원(class) · 숙제(home) · 둘 다(both) · **다음 단원 예습(next)**. '
  '⚠️ 예습을 항목 이름으로 가르면 이름을 바꾸는 순간 그 줄이 조용히 숙제로 샌다';

-- ══ [숙제 차리기] 「이 교재가 지금 멈춰 있나」를 한 곳에서 판단하는 `v2.book_stop()`
-- 왜: ⚠️ 같은 판단이 두 벌이다(원칙 1 위반). 0037 의 `word_test_on` 은 `stop_until` 만 보고 **`stop_exam_id` 를 안 본다** — 시험에 묶어 멈춘 교재는 **시험이 끝나도 단어시험만 영영 안 나간다.** 오류가 안 나고 화면도 멀쩡하다. 지금 lib/routine.js 는 stopOf() 로 세 길(손·날짜·시험)을 다 보는데, 이 함수가 서면 둘 다 그것 하나를 부른다. (아래 질의는 진짜 DB 에 읽기로 돌려 봤다 — 돈다.)
-- 0065 · 멈춤 판단을 한 곳으로 (⑬ · ㊺-b)
create or replace function v2.book_stop(p_student uuid, p_book uuid, p_on date default null)
returns text language sql stable as $$
  select case
    when sb.stop_mode = 'running' then 'running'
    when sb.stop_until is not null
         and sb.stop_until < coalesce(p_on, v2.today()) then 'running'
    when e.id is not null
         and coalesce(e.term_to, e.english_on) < coalesce(p_on, v2.today()) then 'running'
    else sb.stop_mode end
  from v2.student_book sb
  left join v2.exams e on e.id = sb.stop_exam_id
  where sb.student_id = p_student and sb.book_id = p_book
    and sb.from_date <= coalesce(p_on, v2.today())
    and (sb.to_date is null or sb.to_date >= coalesce(p_on, v2.today()))
  order by sb.from_date desc limit 1
$$;
comment on function v2.book_stop is
  '돌아감·숙제멈춤·교재멈춤. 푸는 길 셋(손·날짜·시험)을 **여기 한 곳에서만** 본다';
grant execute on function v2.book_stop(uuid,uuid,date) to authenticated;

-- ⚠️ 단어시험도 같은 문을 지나게 한다 (0037 을 이 함수 위로 옮긴다)
create or replace function v2.word_test_on(p_student uuid, p_book uuid, p_on date default null)
returns boolean language sql stable as $$
  select coalesce(v2.book_stop(p_student, p_book, p_on), '없음') not in ('book_off','없음')
$$;
comment on function v2.word_test_on is
  '⚠️ book_off 면 시험도 안 나간다(원장님 9/2). hw_off 는 시험을 안 막는다. '
  '판단은 v2.book_stop 하나 — 시험에 묶은 멈춤도 시험이 끝나면 여기서 같이 풀린다';

-- ══ [숙제 차리기] 「이 교재, 3회 연속 메모로만 갔습니다」를 앱이 세는 `v2.memo_only_streak()`
-- 왜: ㊳ — 메모가 습관이 되면 **진도가 실제보다 앞선다.** 교재를 안 폈는데 소단원이 ○ 로 쌓이고 몇 달 뒤 그 단원만 구멍인 채 교재가 끝난다(예습 사고와 같은 모양). 계획은 「앱이 세어서 먼저 부른다 — 원장님이 세지 않는다(대전제 3)」이고 **막지는 않는다.** 지금 lib/routine.js 는 이걸 못 부른다. (아래 질의 본문은 진짜 DB 에 읽기로 돌려 봤다 — 돈다. 지금 값은 0.)
-- 0066 · 메모로만 간 날이 몇 번 이어졌나 (㊳ — 부르기만 하고 막지 않는다)
create or replace function v2.memo_only_streak(p_student uuid, p_book uuid)
returns int language sql stable as $$
  with d as (
    select s.date,
           bool_and(i.item_id is null and i.memo is not null) as memo_only
      from v2.day_item i
      join v2.day_sheet s on s.id = i.sheet_id
      join v2.units u on u.id = i.unit_id
     where s.student_id = p_student and u.book_id = p_book
       and i.slot in ('class','home')
     group by s.date),
  last_real as (select max(date) as d from d where not memo_only)
  select count(*)::int from d
   where memo_only
     and (date > (select d from last_real) or (select d from last_real) is null)
$$;
comment on function v2.memo_only_streak is
  '⚠️ 3 이상이면 대시보드가 부른다 — **막지는 않는다.** 정말 그런 달이 있다';
grant execute on function v2.memo_only_streak(uuid,uuid) to authenticated;

-- ══ [크론] 예약 발송을 훑는 자리에 부분 인덱스
-- 왜: 크론이 날마다 「때가 된 예약 발송」을 센다. 지금은 줄이 0개라 못 재봤지만(⚠️ 확인 안 됨), 쌓이면 날마다 전수 훑기가 된다. 안 만들어도 크론은 돈다 — 늦어질 뿐이다
create index if not exists scheduled_send_due_idx on v2.scheduled_send (at) where sent_at is null and cancelled_at is null;

-- ══ [크론] 파기 기한이 온 파일을 찾는 자리에 부분 인덱스
-- 왜: 크론이 날마다 v2.file 에서 purge_on 이 온 줄을 찾는다(lib/purge.js filesDueSql). 숙제 사진이 쌓이는 표라 여기가 제일 먼저 커진다. 이것도 지금은 줄이 없어 못 재봤다 (⚠️ 확인 안 됨)
create index if not exists file_purge_due_idx on v2.file (purge_on) where state = 'active' and purge_on is not null;
