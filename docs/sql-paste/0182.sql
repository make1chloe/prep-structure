-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0182~0182 · 1개 · 2026-09-18 만듦)
--
-- 어디서 왔나 : supabase/migrations/*.sql 을 **번호 차례대로** 이어 붙인 것이다.
--               규칙은 docs/개발자-인수인계.md 3절 「실 DB 에 돌리는 법」.
-- 어디에 넣나 : Supabase → SQL Editor → New query → 통째로 붙여넣고 Run.
--
-- ⚠️ v2 스키마만 건드린다 — public · auth · storage 는 한 줄도 안 건드린다(check-v2only 가 잰다).
-- ⚠️ 전환일 파일(9000 · 9001)은 여기 **없다** — 그날 따로 돌린다.
-- ⚠️ 통째로 **한 트랜잭션**이다 — 하나라도 틀리면 아무것도 안 들어간다.
--     그래서 실패했으면 고치고 **그대로 다시** 붙여넣으면 된다(들어간 것이 없으니 처음과 같다).
-- ⚠️ 반대로 **다 들어간 뒤에 또 돌리면** 0106·0114·0128 에서 멈춘다 — 뒤 파일(0108·0119·0129·0131)이
--     같은 함수를 다른 반환형으로 다시 냈기 때문이다(2026-09-07 실측). 파일 하나하나는 멱등이지만
--     **줄 전체를 처음부터 다시 도는 것**은 멱등이 아니다. 그럴 일이 없게 아래 문지기가 먼저 막는다.

-- 0182 · 대시보드 「⏰ 마감 필요」의 업무 줄이 **분류 이름**을 받는다 ((어88) · 2026-09-18)
--
-- 사고: 0181 은 `t.kind`(열쇠)만 실어 보냈고 화면은 `kindName(t.kind)` 를 **분류 표 없이** 불렀다.
--       씨앗(lib/todo-plan KINDS)에 없는 분류 — 곧 **원장님이 05 에서 직접 만드신 분류** — 는 이름을 못 찾아
--       열쇠가 그대로 보인다(`u3f9a2b1c`). 0179 로 분류를 원장님이 만드시게 한 순간 생긴 구멍이다.
-- 고침: **이미 join 하고 있던** v2.todo_kind 에서 이름을 같이 싣는다 — 새 조회가 아니다(속도-1).
--       분류를 지우셨거나 표가 아직 없으면 이름이 null 이라 화면이 씨앗으로 떨어진다(대전제-27).
-- 멱등: 0181 과 같은 drop → create 꼴. 앞 열은 전부 그대로다.

drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb, confirm_next jsonb, rules jsonb, classes jsonb, due jsonb)
language sql stable security definer set search_path = v2, public as $$
  with nm as (select to_char((date_trunc('month', p_on::timestamp) + interval '1 month')::date, 'YYYY-MM') ym),
       cm as (select to_char(p_on, 'YYYY-MM') ym, date_trunc('month', p_on::timestamp)::date d1, (date_trunc('month', p_on::timestamp) + interval '1 month - 1 day')::date d2)
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
            'from_day', (select value from v2.rule where key = 'schedule.confirm_from_day')) from nm),
         (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'dash.%'),
         (select jsonb_build_object('ym', cm.ym, 'target', (select value from v2.rule where key = 'schedule.sessions_per_month'),
            'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nickname', c.nickname, 'kind', c.kind,
                       'weekdays', (select s.weekdays from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1) order by s.from_date desc limit 1),
                       'start_time', (select s.start_time from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1) order by s.from_date desc limit 1),
                       'sessions', v2.session_count(c.id, cm.ym::char(7)), 'extra', v2.class_extra_days(c.id, cm.ym::char(7))) order by c.created_at), '[]'::jsonb)
                       from v2.classes c where c.state = 'active' and c.kind = 'regular'
                        and exists (select 1 from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1))) ) from cm),
         -- (어84) ⏰ 마감 필요 — 아이 파트 · 업무 파트
         jsonb_build_object(
           'students', (select coalesce(jsonb_agg(jsonb_build_object(
                 'sheet_id', d.id, 'student_id', d.student_id, 'name', st.name, 'class_id', d.class_id,
                 'attend', coalesce(d.attend, 'none'),
                 'left', (select count(*)::int from v2.day_item i where i.sheet_id = d.id and i.slot = 'check' and not i.off and coalesce(i.status, 'none') = 'none'),
                 'closed', d.closed_at is not null, 'sent', d.sent_at is not null) order by st.name), '[]'::jsonb)
               from v2.day_sheet d join v2.students st on st.id = d.student_id
              where d.date = p_on
                and (coalesce(d.attend, 'none') = 'none'
                  or d.closed_at is null or d.sent_at is null
                  or exists (select 1 from v2.day_item i where i.sheet_id = d.id and i.slot = 'check' and not i.off and coalesce(i.status, 'none') = 'none'))),
           'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'kind_name', k.name, 'due_on', t.due_on) order by t.due_on, t.created_at), '[]'::jsonb)
               from v2.todo t left join v2.todo_kind k on k.kind = t.kind
              where t.state in ('todo', 'doing') and t.due_on is not null and t.due_on <= p_on
                and coalesce(k.show_in, 'todo') in ('todo', 'both')))
   where v2.is_staff()
$$;

comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태 · 규칙 dash.* · (처) 이 달 정규반의 회차 · (어84)(어88) due(⏰ 마감 필요 — 오늘 판에서 출결·검사·마감·발송이 안 끝난 아이 + 오늘까지가 마감인 안 끝난 업무). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
