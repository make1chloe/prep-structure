-- 0151 (어) 월간 리포트·수강료 안내도 예약 발송(확정-㉕ 「고르고 · 한 번에 · 예약」 — 4단계-2a·2b 는 「예약은 아직」이었다).
-- 예약 갈래에 fee · 아이·달로 매는 예약(body = 달 'YYYY-MM') · 살아 있는 예약은 아이·갈래·달마다 하나 · 발송 판(send_board)의 예약 줄에 아이 이름.
-- 때가 되면 크론(promoteScheduled)이 그때 상태로 보낸다 — 이미 보낸 리포트 · 이미 받은 수강료는 건너뛴다(lib/report sendMonthlyDue · lib/fee remindFeeDue).
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','fee')) not valid;   -- 예약 갈래 = 알림 갈래(0131) + fee
create unique index if not exists scheduled_send_one_other_idx on v2.scheduled_send (kind, student_id, body) where sent_at is null and cancelled_at is null and kind in ('monthly', 'fee');
comment on column v2.scheduled_send.body is '(어) 월간 리포트·수강료 안내 예약은 여기에 달(YYYY-MM) — 때가 되면 그 달 것을 보낸다(이미 보냈거나 받았으면 건너뛴다) · 데일리리포트 예약은 sheet_id';

-- send_board 다시 냄(0118 본 그대로 + 예약 줄에 student_name) — 검사-74: 앞 정의의 열쇠를 전부 품는다
create or replace function v2.send_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'jobs',      (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from v2.send_jobs((p_on::timestamp at time zone 'Asia/Seoul')) j),
    'logs',      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from v2.sent_log((p_on::timestamp at time zone 'Asia/Seoul')) l),
    'scheduled', (select coalesce(jsonb_agg((to_jsonb(s) || jsonb_build_object('student_name', st.name)) order by s.at), '[]'::jsonb) from v2.scheduled_send s left join v2.students st on st.id = s.student_id where s.sent_at is null and s.cancelled_at is null),   -- (어) 월간·수강료 예약은 판이 없어 아이 이름을 여기서
    'reach',     (select to_jsonb(r) from v2.parent_reach() r),
    'rules',     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'send.%')
  ) where v2.is_staff()
$$;
