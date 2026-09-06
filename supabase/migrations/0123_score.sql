-- 0123 · 성적 16 — 아이가 넣고 원장님이 확인. 회차의 등급컷(exams.cuts) · 시험지 문항표(exam_question — 틀린 번호에 영역이 저절로 붙는다) · 아이의 성적 공개 기본값(students.score_show, 14 의 「성적 공개」) ·
--        틀린 문항 바꾸기 한 곳(set_score_wrong — 지우는 권한은 아무에게도 없어 정의자 함수가 한다) · 문항표 적기 한 곳 · 성적 판 한 벌(score_board)
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.

-- ══ ① 등급컷은 회차의 것(영어시험-특징 §3) — 그 회차를 본 아이 전부의 등급이 이 한 벌로 세어 나온다(대전제-5: 등급은 저장하지 않고 센다 · 학교가 발표한 등급이 있으면 score.grade 가 이긴다)
alter table v2.exams add column if not exists cuts smallint[];
comment on column v2.exams.cuts is '등급컷 — 1등급컷부터 높은 순서(내신에만 · 모의고사는 전국 등급이 온다). 중학교는 비면 절대평가 90·80·70·60 으로 센다(A~E). 판단은 lib/score-plan gradeByCuts 한 곳';

-- ══ ② 아이의 성적 공개 기본값(14 「성적 공개 — 학생 ✓ · 학부모 ✓」) — 원장님이 확인하는 순간 그 줄의 show_to 가 이 값이 된다
alter table v2.students add column if not exists score_show text not null default 'both';
alter table v2.students drop constraint if exists students_score_show_ck;
alter table v2.students add constraint students_score_show_ck check (score_show in ('staff','student','parent','both'));
comment on column v2.students.score_show is '성적 공개 기본값(14) — 확인하는 순간 score.show_to 가 이 값이 된다. 줄마다 따로 바꿀 수 있다(16)';
grant update (score_show) on v2.students to authenticated;

-- ══ ③ 시험지 문항표 — 번호마다 영역. 확정-⑤ 「문항표는 엑셀」 — 지금은 글로 적는다(「1-5 듣기, 6-20 독해」)
create table if not exists v2.exam_question (
  exam_id uuid not null references v2.exams(id) on delete restrict,
  q_no    smallint not null,
  kind    text not null,
  primary key (exam_id, q_no)
);
comment on table v2.exam_question is '한 줄 = 「이 회차 시험지의 N번은 이 영역」(듣기·독해·어법·어휘·서술형·기타). 성적 16·07·09 의 틀린 문항 영역 셈이 여기서 나온다 — 성적 줄엔 번호만 적는다(score_wrong)';
alter table v2.exam_question enable row level security;
alter table v2.exam_question force row level security;
drop policy if exists staff_all on v2.exam_question;
create policy staff_all on v2.exam_question for all using (v2.is_staff()) with check (v2.is_staff());
drop policy if exists read_question on v2.exam_question;
create policy read_question on v2.exam_question for select to authenticated using (true);   -- 영역 이름은 비밀이 아니다 — 아이·학부모 카드가 영역을 센다
grant select, insert, update on v2.exam_question to authenticated;
drop trigger if exists exam_question_audit on v2.exam_question;
create trigger exam_question_audit after insert or update or delete on v2.exam_question for each row execute function v2.audit_row();

-- 아이가 제 「안 봄」 줄을 읽는다 — 07 성적 카드가 넣을 회차를 고를 때 뺀다
drop policy if exists own_skip on v2.exam_skip;
create policy own_skip on v2.exam_skip for select to authenticated using (student_id in (select v2.my_students()));

-- ══ ④ 틀린 문항 바꾸기 한 곳 — 학원 사람 · 또는 제 성적(아이가 넣은 것 · 확인 전)만. 번호를 통째로 바꾼다(지우고 넣는다 — 0017 이 지우기를 아무에게도 안 줘서 정의자가 한다)
create or replace function v2.set_score_wrong(p_score uuid, p_qs int[]) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int; ok boolean;
begin
  select v2.is_staff() or exists (select 1 from v2.score sc join v2.students st on st.id = sc.student_id
                                    where sc.id = p_score and sc.by_who = 'student' and not sc.confirmed and st.profile_id = auth.uid()) into ok;
  if not coalesce(ok, false) then raise exception '이 성적의 틀린 문항은 못 바꿉니다(원장님이 넣었거나 이미 확인한 성적)'; end if;
  delete from v2.score_wrong where score_id = p_score;
  insert into v2.score_wrong (score_id, q_no) select distinct p_score, q from unnest(coalesce(p_qs, '{}'::int[])) q where q > 0;
  get diagnostics n = row_count;
  return n;
end $$;
comment on function v2.set_score_wrong(uuid, int[]) is '틀린 문항 번호를 통째로 바꾼다 — 학원 사람 · 또는 아이가 넣고 아직 확인 전인 제 성적. 영역은 저장하지 않는다(exam_question 이 준다)';
grant execute on function v2.set_score_wrong(uuid, int[]) to authenticated, service_role;

create or replace function v2.set_exam_questions(p_exam uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  if not v2.is_staff() then raise exception '학원 사람만 문항표를 적습니다'; end if;
  delete from v2.exam_question where exam_id = p_exam;
  insert into v2.exam_question (exam_id, q_no, kind)
    select p_exam, (r->>'q_no')::smallint, r->>'kind' from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
     where (r->>'q_no') ~ '^[0-9]+$' and coalesce(r->>'kind', '') <> '' on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
comment on function v2.set_exam_questions(uuid, jsonb) is '회차의 문항표를 통째로 바꾼다 — [{q_no, kind}]. 학원 사람만';
grant execute on function v2.set_exam_questions(uuid, jsonb) to authenticated, service_role;

-- ══ ⑤ 성적 판 한 벌(속도-상한: 로그인 1 · 주소 인자 · 오늘 1 · 이것 1 = 4단) — 고른 회차(비면 가장 최근에 본 것: 등급컷 · 문항표) · 보는 아이(공개 기본값) · 그 회차 성적(틀린 번호까지) · 고를 수 있는 회차(지난 넉 달 ~ 다음 달 · 보는 아이 수 · 낸 수 · 확인 안 한 수). 학원 사람만
create or replace function v2.score_board(p_exam uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_exam, (select e.id from v2.exams e where e.state = 'active' and not e.hidden and coalesce(e.english_on, e.term_from) <= p_on
                                          order by coalesce(e.english_on, e.term_from) desc limit 1)) eid)
  select jsonb_build_object(
    'today', p_on,
    'exam', (select jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'level', sc.level, 'grade', e.grade, 'name', e.name,
                                       'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'cuts', e.cuts, 'hidden', e.hidden, 'source', e.source,
                                       'questions', (select coalesce(jsonb_agg(jsonb_build_object('q_no', q.q_no, 'kind', q.kind) order by q.q_no), '[]'::jsonb) from v2.exam_question q where q.exam_id = e.id))
               from v2.exams e left join v2.schools sc on sc.id = e.school_id, pick where e.id = pick.eid),
    'takers', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'score_show', st.score_show) order by st.name), '[]'::jsonb)
                 from pick, v2.exam_takers(pick.eid) t join v2.students st on st.id = t.student_id),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'student_id', s.student_id, 'raw', s.raw, 'full_score', s.full_score, 'grade', s.grade, 'percentile', s.percentile,
                                                            'by_who', s.by_who, 'confirmed', s.confirmed, 'show_to', s.show_to, 'note', s.note, 'created_at', s.created_at, 'updated_at', s.updated_at,
                                                            'wrongs', (select coalesce(jsonb_agg(w.q_no order by w.q_no), '[]'::jsonb) from v2.score_wrong w where w.score_id = s.id)) order by s.updated_at desc), '[]'::jsonb)
                 from v2.score s, pick where s.exam_id = pick.eid),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school', sc.name, 'level', sc.level, 'grade', e.grade, 'name', e.name, 'on', coalesce(e.english_on, e.term_from), 'hidden', e.hidden,
                                                           'takers', (select count(*) from v2.exam_takers(e.id)), 'scores', (select count(*) from v2.score s where s.exam_id = e.id),
                                                           'unconfirmed', (select count(*) from v2.score s where s.exam_id = e.id and not s.confirmed)) order by coalesce(e.english_on, e.term_from) desc), '[]'::jsonb)
                from v2.exams e left join v2.schools sc on sc.id = e.school_id
               where e.state = 'active' and coalesce(e.english_on, e.term_from) between p_on - 120 and p_on + 30)
  ) from pick where v2.is_staff()
$$;
comment on function v2.score_board(uuid, date) is '성적 16 이 읽는 한 벌 — 고른 회차(등급컷 · 문항표) · 보는 아이 · 그 회차 성적(틀린 번호) · 고를 회차 목록. 등급·영역 셈·안 낸 아이는 화면이 센다(대전제-5)';
grant execute on function v2.score_board(uuid, date) to authenticated, service_role;
