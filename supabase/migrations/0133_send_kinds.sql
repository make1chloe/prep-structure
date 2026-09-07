-- 0133 4단계-2a(9/7 「database-url 제외한 나머지 이어서해」) — 알림 갈래 둘 더(score 성적 입력 안내 · fee 수강료 안내) · 학부모가 제 아이 수강료 줄을 읽는다 · 아이·학부모 판 한 벌에 💰·📨 자취 — 멱등
-- ① 갈래 제약을 다시 건다(표-6 · NOT VALID 그대로 — 새 줄만 막는다). 갈래 열 = lib/notify-plan LABEL 열둘
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee')) not valid;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee')) not valid;
-- ② 학부모가 제 아이의 수납 줄을 읽는다(💰 카드 · 수강료 안내가 가리키는 자리). 학원 사람은 staff_all 그대로 · 아이는 못 본다
drop policy if exists own_payment on v2.payment;
create policy own_payment on v2.payment for select to authenticated
  using (exists (select 1 from v2.parent_student ps where ps.student_id = payment.student_id and ps.parent_profile_id = auth.uid()));
-- ③ mine_board — 'fee'(이 달 수납 줄) · 'notices'(내게 온 자취 — 학부모 「보낸 것」이 자취를 읽는다) 를 더한다. invoker 라 정책이 그대로
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
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;
grant execute on function v2.mine_board(uuid, date) to authenticated, service_role;
