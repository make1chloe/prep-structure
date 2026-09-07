-- 0134 4단계-2b(9/7) — 📊 월간 리포트: 한 달 숫자를 세는 함수(마감한 판만 — 원장님·학부모가 같은 숫자를 본다) · 원장 판 monthly_board · 아이·학부모 판에 마지막으로 보낸 리포트 — 멱등
-- ① 한 아이의 한 달 숫자 — 마감한 판만 센다(원장 확정 2026-08-28 「무조건 마감된 것만 학생·학부모에게 공개」 · 옛 앱 lib/monthly summarize 와 같은 결). security invoker — 학부모는 제 아이 것만(정책), 성적은 공개한 것만(show_to)
create or replace function v2.month_report(p_student uuid, p_ym text) returns jsonb
language sql stable security invoker set search_path = v2, public as $$
  with m as (select (p_ym || '-01')::date f, ((p_ym || '-01')::date + interval '1 month' - interval '1 day')::date t),
       pass as (select coalesce((select value::int from v2.rule where key = 'unit_test.pass_pct'), 70) pct),
       sh as (select ds.* from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.closed_at is not null)
  select jsonb_build_object(
    'ym', p_ym,
    'closed_days', (select count(*) from sh),
    'att_present', (select count(*) from sh where sh.attend in ('present', 'late', 'early', 'online', 'makeup')),
    'att_late', (select count(*) from sh where sh.attend = 'late'),
    'att_absent', (select count(*) from sh where sh.attend = 'absent'),
    'att_total', (select count(*) from sh where sh.attend is not null and sh.attend <> 'off'),
    'hw_done', (select count(*) from v2.day_item i join sh on sh.id = i.sheet_id where i.slot = 'check' and i.status = 'done'),
    'hw_total', (select count(*) from v2.day_item i join sh on sh.id = i.sheet_id where i.slot = 'check' and i.status in ('done', 'weak', 'missing')),
    'word_pass', (select count(*) from v2.quiz q join sh on sh.id = q.taken_sheet_id where q.kind = 'word' and q.state = 'passed'),
    'word_total', (select count(*) from v2.quiz q join sh on sh.id = q.taken_sheet_id where q.kind = 'word' and q.state in ('passed', 'failed')),
    'ut_pass', (select count(*) from v2.unit_test u, m, pass where u.student_id = p_student and u.state = 'scored' and u.taken_on between m.f and m.t and u.correct * 100 >= coalesce(u.q_count, 0) * pass.pct),
    'ut_total', (select count(*) from v2.unit_test u, m where u.student_id = p_student and u.state = 'scored' and u.taken_on between m.f and m.t),
    'late_n', (select count(*) from v2.late_stay l join sh on sh.id = l.sheet_id where l.until_at is not null),
    'warn_count', coalesce((select w.count from v2.warn_states(array[p_student], least(v2.today(), (select t from m))) w limit 1), 0),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('exam', e.name, 'school', sc.name, 'raw', s.raw, 'full', s.full_score, 'grade', s.grade, 'on', coalesce(e.english_on, e.term_from)) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                 from v2.score s join v2.exams e on e.id = s.exam_id left join v2.schools sc on sc.id = e.school_id, m
                 where s.student_id = p_student and s.confirmed and s.show_to in ('parent', 'both') and coalesce(e.english_on, e.term_from) between m.f and m.t)
  );
$$;
grant execute on function v2.month_report(uuid, text) to authenticated, service_role;
-- ② 원장 판 — 재원생마다 그 달 숫자 + 리포트 줄(적어 둔 한마디 · 굳힌 숫자 · 보낸 때) + 학부모 계정 수(닿을 집)
create or replace function v2.monthly_board(p_ym text) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'ym', p_ym,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('student_id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name,
                'numbers', v2.month_report(st.id, p_ym),
                'report', (select jsonb_build_object('id', r.id, 'body', r.body, 'frozen', r.frozen, 'sent_at', r.sent_at) from v2.monthly_report r where r.student_id = st.id and r.ym = p_ym),
                'parents', (select count(*) from v2.parent_student ps where ps.student_id = st.id)) order by st.name), '[]'::jsonb)
              from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active')
  ) where v2.is_staff();
$$;
grant execute on function v2.monthly_board(text) to authenticated, service_role;
-- ③ 아이·학부모 판 한 벌에 마지막으로 보낸 리포트(정책 own_mr — 보낸 것만)
create or replace function v2.mine_board(p_student uuid, p_lo date) returns jsonb
language sql stable security invoker set search_path = v2, public as $$
  select jsonb_build_object(
    'links', (select coalesce(jsonb_agg(jsonb_build_object(
                 'file_id', fl.file_id, 'day_item_id', fl.day_item_id, 'seen_by_child', fl.seen_by_child, 'seen_at', fl.seen_at, 'created_at', fl.created_at,
                 'file', case when f.id is null then null else jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note) end,
                 'day_item', jsonb_build_object('id', di.id, 'slot', di.slot, 'range_note', di.range_note, 'item_id', di.item_id,
                               'learn_items', case when li.id is null then null else jsonb_build_object('name', li.name) end,
                               'day_sheet', jsonb_build_object('student_id', ds.student_id, 'date', ds.date))
               ) order by fl.created_at desc), '[]'::jsonb)
               from v2.file_link fl
               join v2.day_item di on di.id = fl.day_item_id
               join v2.day_sheet ds on ds.id = di.sheet_id
               left join v2.file f on f.id = fl.file_id
               left join v2.learn_items li on li.id = di.item_id
               where ds.student_id = p_student and fl.created_at >= (p_lo::timestamp at time zone 'UTC')),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note, 'uploaded_at', f.uploaded_at,
                                                          'reply', f.reply, 'replied_at', f.replied_at, 'student_id', f.student_id,
                                                          'students', case when st.id is null then null else jsonb_build_object('name', st.name) end) order by f.uploaded_at desc), '[]'::jsonb)
             from (select * from v2.file where by_profile = auth.uid() and uploaded_at >= (p_lo::timestamp at time zone 'UTC') order by uploaded_at desc limit 20) f
             left join v2.students st on st.id = f.student_id),
    'assigns', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'video_id', va.video_id, 'due_on', va.due_on, 'state', va.state, 'created_at', va.created_at,
                                                             'video', jsonb_build_object('id', v.id, 'title', v.title, 'url', v.url, 'folder', v.folder, 'seconds', v.seconds, 'state', v.state))), '[]'::jsonb)
                from v2.video_assign va join v2.video v on v.id = va.video_id where va.student_id = p_student and va.state = 'active'),
    'fee', (select jsonb_build_object('ym', p.ym, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method)
              from v2.payment p where p.student_id = p_student and p.ym = to_char(v2.today(), 'YYYY-MM') limit 1),   -- 이 달 수납 줄 — 학부모만 보인다(own_payment) · 아이는 null
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'url', l.url, 'created_at', l.created_at, 'sent_at', l.sent_at, 'opened_at', l.opened_at, 'sink', l.sink, 'failed_at', l.failed_at) order by l.created_at desc), '[]'::jsonb)
                  from (select * from v2.notify_log where profile_id = auth.uid() and student_id = p_student and created_at >= (p_lo::timestamp at time zone 'UTC') order by created_at desc limit 30) l),   -- 내게 온 자취(own_log)
    'report', (select jsonb_build_object('ym', r.ym, 'body', r.body, 'frozen', r.frozen, 'sent_at', r.sent_at) from v2.monthly_report r where r.student_id = p_student and r.sent_at is not null order by r.ym desc limit 1),   -- 📊 마지막으로 보낸 월간 리포트(own_mr)
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;
grant execute on function v2.mine_board(uuid, date) to authenticated, service_role;
