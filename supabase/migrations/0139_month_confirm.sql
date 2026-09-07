-- 0139 4단계-3b(9/7 ㉚ 「예상수업일정보내기 기능 필요없음 무조건확정후 알림」) — 다음 달 일정 도장은 **확정 하나**(안내·확인 없음 · 예상 일정 보내기 없음) · 확정하면 반 아이마다 학부모에게 「수업 일정 안내」 한 통 · 휴강이 들어오면 풀린다(0075 방아쇠 그대로) · 20일부터 대시보드가 부른다 — 멱등
-- ① 규칙 줄(뼈대-5) — 다음 달 확정을 며칠부터 재촉하나
insert into v2.rule (key, value, note) values
  ('schedule.confirm_from_day', '20', '다음 달 일정을 이 날부터 「아직 확정 안 함」으로 대시보드에 띄운다(㉚ 9/7). 풀린 것(휴강이 들어옴)은 날짜와 상관없이 띄운다')
on conflict (key) do nothing;

-- ② 갈래 제약을 다시 건다(표-6 · NOT VALID — 새 줄만 막는다). 갈래 열셋 = lib/notify-plan LABEL
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule')) not valid;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule')) not valid;

-- ③ 확정 도장 — 살아 있는 반마다 한 줄(step 3 = 확정 · 1·2 는 안 쓴다) · 다시 확정하면 같은 줄을 되살린다(지우지 않는다 · 대전제-6). 학원 사람만 · 알림은 앱(lib/schedule.js confirmMonth)이 보낸다
create or replace function v2.confirm_month(p_ym char(7)) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare ids uuid[]; n int;
begin
  if not v2.is_staff() then raise exception '학원 사람만 확정합니다'; end if;
  if p_ym !~ '^[0-9]{4}-[0-9]{2}$' then raise exception '달이 이상합니다: %', p_ym; end if;
  select coalesce(array_agg(c.id order by c.created_at), '{}') into ids from v2.classes c where c.state = 'active';
  insert into v2.month_confirm (ym, class_id, step, at, by_who)
    select p_ym, x, 3, now(), auth.uid() from unnest(ids) x
  on conflict (ym, class_id, step) do update set at = now(), by_who = excluded.by_who, undone_at = null, undone_by = null;
  n := coalesce(array_length(ids, 1), 0);
  return jsonb_build_object('classes', n, 'class_ids', to_jsonb(ids));
end $$;
comment on function v2.confirm_month(char) is '그 달 일정 확정 도장(4단계-3b · ㉚) — 살아 있는 반마다 month_confirm step 3 한 줄(다시 확정하면 되살린다 · undone_at 을 비운다). 학원 사람만. 알림은 앱이 보낸다';
grant execute on function v2.confirm_month(char) to authenticated, service_role;

-- ④ 일정 판 한 벌에 확정 도장(그 달 · 반마다 · 푼 때 · 누가)과 「알림 N명」(자취 꼬리표 month-달-아이)을 얹는다 — 되돌림 타입은 그대로(jsonb)
create or replace function v2.schedule_board(p_ym char(7), p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with span as (select ((p_ym || '-01')::date - 7) f, ((p_ym || '-01')::date + interval '1 month' + interval '7 day')::date t, (p_ym || '-01')::date m1)
  select jsonb_build_object(
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname,
                  'weekdays', s.weekdays, 'start_time', s.start_time, 'end_time', s.end_time,
                  'members', (select count(*) from v2.class_roster(c.id, greatest(span.m1, p_on)) r),
                  'sessions', v2.session_count(c.id, p_ym), 'extra', v2.class_extra_days(c.id, p_ym)) order by s.start_time, c.created_at), '[]'::jsonb)
                 from v2.classes c, span
                 left join lateral (select * from v2.class_schedule x where x.class_id = c.id and x.from_date <= span.t and (x.to_date is null or x.to_date >= span.m1) order by x.from_date desc limit 1) s on true
                where c.state = 'active'),
    'holidays', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'date', h.date, 'class_id', h.class_id, 'reason', h.reason, 'state', h.state) order by h.date), '[]'::jsonb)
                  from v2.holiday h, span where h.date between span.f and span.t),
    'makeups', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'student_id', m.student_id, 'name', st.name, 'of_date', m.of_date, 'on_date', m.on_date, 'at_time', m.at_time, 'state', m.state, 'reason', m.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(m.student_id, p_on) sc)) order by coalesce(m.of_date, m.on_date), st.name), '[]'::jsonb)
                 from v2.makeup m join v2.students st on st.id = m.student_id, span
                where m.state <> 'cancelled' and ((m.of_date between span.f and span.t) or (m.on_date between span.f and span.t))),
    'lates', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'student_id', l.student_id, 'name', st.name, 'date', l.date, 'minutes', l.minutes, 'reason', l.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(l.student_id, p_on) sc)) order by l.date, st.name), '[]'::jsonb)
               from v2.late_plan l join v2.students st on st.id = l.student_id, span
              where l.cancelled_at is null and l.date between span.f and span.t),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source) order by coalesce(e.term_from, e.english_on)), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id, span
              where e.state = 'active' and ((e.term_from <= span.t and e.term_to >= span.f) or (e.english_on between span.f and span.t))),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'name', st.name) order by t.due_on, t.due_time), '[]'::jsonb)
               from v2.todo t left join v2.students st on st.id = t.student_id, span
              where t.state in ('todo', 'doing') and t.due_on between span.f and span.t),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'schedule.%'),
    'confirm', (select coalesce(jsonb_agg(jsonb_build_object('class_id', m.class_id, 'at', m.at, 'undone_at', m.undone_at, 'by', pr.name) order by m.at), '[]'::jsonb)
                 from v2.month_confirm m left join v2.profiles pr on pr.id = m.by_who where m.ym = p_ym and m.step = 3),
    'confirm_sent', (select count(distinct l.student_id)::int from v2.notify_log l where l.kind = 'schedule' and l.tag like 'month-' || p_ym || '-%')
  ) where v2.is_staff()
$$;
comment on function v2.schedule_board(char, date) is '일정 12 가 읽는 한 벌 — 그 달(앞뒤 7일)의 반·회차(요일×달−휴강+반 보강일) · 휴강 · 결석·보강 · 지각 예정 · 시험 · 할 일 · 규칙 · 확정 도장(반마다 · 푼 때)과 알림 받은 아이 수. 학원 사람만';

-- ⑤ 대시보드 잡동사니 한 조회에 다음 달 확정 상태까지(파도 20 상한을 안 넘긴다 — 되돌림 타입이 바뀌어 다시 만든다)
drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb, confirm_next jsonb)
language sql stable security definer set search_path = v2, public as $$
  with nm as (select to_char((date_trunc('month', p_on::timestamp) + interval '1 month')::date, 'YYYY-MM') ym)
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null),
         (select is_open from v2.progress_edit where scope = 'academy'),
         (select opened_on from v2.progress_edit where scope = 'academy'),
         (select count(*)::int from v2.progress where not confirmed),
         (select count(*)::int from v2.progress_flag where seen_at is null),
         (select layout from v2.screen_pref where profile_id = auth.uid() and screen = 'dash'),
         (select jsonb_build_object('ym', nm.ym,
            'all', (select count(*) from v2.classes c where c.state = 'active'),
            'ok', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is null),
            'undone', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is not null),
            'from_day', (select value from v2.rule where key = 'schedule.confirm_from_day')) from nm)
   where v2.is_staff()
$$;
comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태(반 수 · 찍힌 수 · 풀린 수 · 규칙 날). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;
