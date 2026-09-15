-- 0166 (어44) 출결 사유 · 원장님 2026-09-15 「출결에 지각 결석 사유 필요헤 질병 진료 가족일정 학교일정 학교일정 진료 선택시 경고 누적 안되게해줘」
--   ① v2.day_sheet.attend_reason · 지각·결석의 까닭 넷(sick 질병 · clinic 진료 · family 가족 일정 · school 학교 일정) · 비면 없음.
--      쓰는 길은 lib/attend.js attendReasonWrite 하나(검사-②) · 출석으로 돌리면 까닭도 비운다.
--   ② 규칙 warn.excused · 경고에 안 세는 까닭(쉼표로 · 기본 clinic,school). 규칙 줄이라 원장님이 바꾼다(뼈대-5).
--   ③ v2.warn_days · 지각이라도 까닭이 warn.excused 에 들면 그날은 지각으로 안 센다. 반환형 그대로(warn_states 는 안 건드린다) · 0106 의 셈 그대로에 한 줄만.
--   ④ 14 학생 판(student_board)의 출결 줄은 이번엔 안 건드린다(까닭은 01 · 07 · 09 · 달력 · 부모님께 글에서 보인다).
alter table v2.day_sheet add column if not exists attend_reason text;
alter table v2.day_sheet drop constraint if exists day_sheet_attend_reason_choice;
alter table v2.day_sheet add constraint day_sheet_attend_reason_choice check (attend_reason is null or attend_reason in ('sick', 'clinic', 'family', 'school'));
comment on column v2.day_sheet.attend_reason is '(어44) 지각·결석 까닭 · sick 질병 · clinic 진료 · family 가족 일정 · school 학교 일정 · 비면 없음 · 경고에 안 세는 까닭은 규칙 warn.excused';

insert into v2.rule (key, value, note) values ('warn.excused', 'clinic,school', '(어44) 경고에 안 세는 지각·결석 까닭(쉼표로) · 기본 진료·학교 일정 · 원장님 9/15')
  on conflict (key) do nothing;

create or replace function v2.warn_days(p_student uuid, p_from date, p_to date)
returns table (date date, why text)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'warn.weak_from') weak_from,
                    string_to_array(coalesce((select value from v2.rule where key = 'warn.excused'), ''), ',') excused),
  d as (
    select s.date,
           bool_or(s.attend = 'late' and not (coalesce(s.attend_reason, '') = any (r.excused))) late,   -- (어44) 까닭이 진료·학교 일정이면 그날 지각은 안 센다
           count(*) filter (where i.slot = 'check' and i.status = 'missing') missing,
           count(*) filter (where i.slot = 'check' and i.status = 'weak') weak
      from v2.day_sheet s left join v2.day_item i on i.sheet_id = s.id, r
     where s.student_id = p_student and s.date between p_from and p_to
     group by s.date),
  q as (
    select q.taken_on date, count(*) n from v2.quiz q
     where q.student_id = p_student and q.kind = 'word' and q.retry_of is null
       and q.taken_on between p_from and p_to and v2.quiz_passed(q.id) is false
     group by q.taken_on)
  select x.date,
         concat_ws(' · ', case when x.late then '지각' end,
                          case when x.missing >= 1 then '숙제 미제출' end,
                          case when x.weak >= r.weak_from then '미흡 ' || x.weak || '건' end,
                          case when coalesce(x.fail, 0) >= 1 then '단어 미통과' end) why
    from (select coalesce(d.date, q.date) date, d.late, d.missing, d.weak, q.n fail
            from d full join q on q.date = d.date) x, r
   where x.late or x.missing >= 1 or x.weak >= r.weak_from or coalesce(x.fail, 0) >= 1
   order by 1
$$;
comment on function v2.warn_days(uuid, date, date) is '경고 하루씩(하루 1회) · 지각(까닭이 규칙 warn.excused 에 들면 안 셈 · (어44)) · 미제출 1건 · 미흡 N건부터(규칙 warn.weak_from) · 단어 미통과. 저장하지 않는다';
grant execute on function v2.warn_days(uuid, date, date) to authenticated, service_role;

-- API(PostgREST)가 새 칸(attend_reason)을 바로 보게 표 모양을 다시 읽힌다(check-sql)
notify pgrst, 'reload schema';
