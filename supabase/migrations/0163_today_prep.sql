-- 0163 (어21) 01 을 안 떠난다 — 오늘 오는 아이의 「멈춘 교재의 시험」과 그 시험 자료(이 아이 배정 여부)를 한 벌로 준다.
--   원장님 2026-09-14 「수업 중 01 을 안 떠납니다 — 이게 내가 원하는거야」 · 「pc화면을 3단으로 — 학생목록 - 업무목록 - 구체적내용」.
--   데이터만 준다 — 멈췄나(stopOn) · 단계 · 줄 것 · 안 줌 은 lib/todo-plan.js · lib/routine-plan.js 가 센다(판단 한 벌 · 원칙-1).
--   today 함수는 안 건드린다 — 01 파도(Promise.all)에 한 줄 더 탄다(속도-1). 멱등.
create or replace function v2.today_prep(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_object_agg(x.student_id, x.exams), '{}'::jsonb)
  from (
    select sb.student_id,
           jsonb_agg(jsonb_build_object(
             'id', e.id, 'name', e.name, 'school', sc.name, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
             'scopes', (select count(*) from v2.prep_scope p where p.exam_id = e.id and p.removed_on is null),
             'books', (select coalesce(jsonb_agg(jsonb_build_object('book_id', y.book_id, 'name', b.name, 'stop_mode', y.stop_mode, 'stop_from', y.stop_from, 'stop_until', y.stop_until) order by b.name), '[]'::jsonb)
                         from v2.student_book y join v2.books b on b.id = y.book_id
                        where y.student_id = sb.student_id and y.stop_exam_id = e.id and (y.to_date is null or y.to_date >= p_on)),
             'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'title', m.title, 'state', m.state, 'reuse_of', m.reuse_of,
                              'give', (select jsonb_build_object('handed_at', g.handed_at, 'got_at', g.got_at, 'stage', g.stage, 'due_on', g.due_on, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at)
                                         from v2.material_give g where g.material_id = m.id and g.student_id = sb.student_id))
                            order by ty.source, ty.sort, ty.name, m.created_at), '[]'::jsonb)
                           from v2.material m join v2.material_type ty on ty.id = m.type_id where m.exam_id = e.id and m.state <> 'dropped')
           ) order by coalesce(e.english_on, e.term_from), e.name) exams
      from (select distinct y.student_id, y.stop_exam_id
              from v2.student_book y
             where y.stop_exam_id is not null and y.stop_mode <> 'running'
               and (y.to_date is null or y.to_date >= p_on) and (y.stop_until is null or y.stop_until >= p_on)) sb
      join v2.exams e on e.id = sb.stop_exam_id and e.state = 'active'
      left join v2.schools sc on sc.id = e.school_id
     group by sb.student_id
  ) x where v2.is_staff()
$$;
comment on function v2.today_prep(date) is '(어21) 오늘 수업 01 이 읽는 한 벌 — 아이마다 멈춘 교재의 시험(범위 수 · 멈춘 교재) · 그 시험 자료(이 아이 배정 give — 없으면 null). 판단은 lib/todo-plan.js prepOf';
grant execute on function v2.today_prep(date) to authenticated, service_role;
