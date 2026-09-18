-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0181~0181 · 1개 · 2026-09-18 만듦)
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

begin;

-- 시간제한을 이 트랜잭션 동안만 푼다 — 편집기 기본값(짧다)에 걸리면 통째로 되돌아간다.
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = 0;

-- 문지기 — ① 이미 들어갔나 ② 앞 조각이 다 들어갔나. 엉뚱한 오류 대신 사람 말로 멈춘다.
do $guard$
declare 든것 int; 앞것 int;
begin
  select count(*) into 든것 from v2.migration where file = any(array['0181_dash_due.sql']);
  if 든것 = 1 then
    raise exception '0181~0181 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql', '0177_item_app.sql', '0178_quick_memo.sql', '0179_todo_kind.sql', '0180_attend_none.sql']);
  if 앞것 <> 81 then
    raise exception '앞 파일 0100~0180 이 아직 다 안 들어갔습니다 (81개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0181_dash_due.sql
-- ─────────────────────────────────────────────────────────────
-- 0181 (어84) 대시보드 맨 위 「⏰ 마감 필요」 — 오늘 안 끝난 것을 한 자리에 — 멱등
--
-- 원장님 2026-09-18: 「대시보드에 최상단에 새로운 목록 만들어서 알려줘. 이름은 마감 필요.
--  당일 처리할 업무(일지작성후발송, 숙제검사발송 출결처리등)이 안된 것을 모달로 바로바로 처리할 수 있게 목록화해놔」
--  「b로 하되 서로 구별되게 두파트로 나눠서 제시 페이지여백없게」 → 아이 파트 · 업무 파트 둘로 나눈다.
--
-- ⚠️ **새 조회를 만들지 않는다.** 대시보드는 조회 20개가 상한이고(속도-상한 · lib/dash.js 「다음 조회는
--    판으로 묶는다」) 이미 차 있다. 그래서 0140·0153 이 그랬듯 dash_ops 한 조회에 얹는다(속도-1).
--    반환 꼴이 바뀌니 drop → create 한다 — **앞 열은 전부 그대로**고 due 하나가 뒤에 붙는다(0153 과 같은 뜻).
--
-- 무엇을 「안 끝난 것」으로 보나 — 화면(01)이 아이마다 이미 아는 넷 그대로다(원칙-1 · lib/day-plan pendingOf):
--   출결을 아직 안 찍음(0180 의 none) · 검사 줄에 아직 안 본 항목 · 마감 안 함 · 학부모께 발송 안 함.
--   ⚠️ 마감은 그날 하는 것이라 **오늘 판만** 본다. 지난 판을 여기 올리면 목록이 영영 안 비어 쓸모가 없어진다.
-- 업무 파트는 **오늘까지가 마감인데 안 끝난 05 업무** — 지난 것도 올린다(마감이 지난 것이 더 급하다).
--   학교 행사(show_in='schedule')는 업무가 아니라 일정이라 뺀다(0179).
begin;

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
           'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'due_on', t.due_on) order by t.due_on, t.created_at), '[]'::jsonb)
               from v2.todo t left join v2.todo_kind k on k.kind = t.kind
              where t.state in ('todo', 'doing') and t.due_on is not null and t.due_on <= p_on
                and coalesce(k.show_in, 'todo') in ('todo', 'both')))
   where v2.is_staff()
$$;

comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태 · 규칙 dash.* · (처) 이 달 정규반의 회차 · (어84) due(⏰ 마감 필요 — 오늘 판에서 출결·검사·마감·발송이 안 끝난 아이 + 오늘까지가 마감인 안 끝난 업무). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0181_dash_due.sql', 'ed234ff5d9b99b4e')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
