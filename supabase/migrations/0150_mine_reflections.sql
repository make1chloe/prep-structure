-- 0150 (서) 학부모 09 「수업」 카드의 붙는 줄이 01 미리보기와 같은 한 벌(다음 시간 시험 · 귀가 예정 · 반성문 처분).
-- 반성문 처분을 따로 부르면 학부모 화면 조회가 상한 20 을 넘어(게이트 88 · 속도-상한) 이미 파도에 있는 mine_board 에 얹는다 — 0138 본 그대로 + 'reflections'(검사-74).
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
    'board', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'to_role', n.to_role, 'sent_at', n.sent_at, 'class', c.nickname, 'school', sc.name, 'read_at', r.first_at,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.notice_id = n.id)) order by n.sent_at desc), '[]'::jsonb)
                from v2.notice n left join v2.classes c on c.id = n.class_id left join v2.schools sc on sc.id = n.school_id left join v2.notice_read r on r.notice_id = n.id and r.profile_id = auth.uid()
               where n.sent_at is not null and n.sent_at >= (p_lo::timestamp at time zone 'UTC')
                 and (n.class_id is null or exists (select 1 from v2.class_member m where m.class_id = n.class_id and m.student_id = p_student and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today())))
                 and (n.school_id is null or exists (select 1 from v2.students s where s.id = p_student and s.school_id = n.school_id))),   -- 📢 이 아이(집)에게 온 공지(4단계-6 · 읽기 규칙 read_notice 가 역할·반·학교를 본다)
    'prefs', (select coalesce(jsonb_object_agg(sp.screen, sp.layout), '{}'::jsonb) from v2.screen_pref sp where sp.profile_id = auth.uid()),   -- 카드 순서(확정-⑮ · 4단계-6 · own_sp)
    'reflections', (select coalesce(jsonb_agg(jsonb_build_object('asked_on', f.asked_on, 'disposal', f.disposal) order by f.asked_on desc), '[]'::jsonb) from v2.reflection f where f.student_id = p_student and f.asked_on >= p_lo),   -- (서) 그날 반성문 처분 — 09 수업 카드의 붙는 줄(01 미리보기와 같은 attached) · 읽기는 RLS reflection_own(0106)
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;
