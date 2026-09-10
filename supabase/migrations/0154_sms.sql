-- 0154 (커) 등록 안내 문자 — 솔라피 · 틀은 화면에서 고친다.
-- 원장님 2026-09-10: 「등록 전에 안내문자 말하는거지? 어플주소도 알려주고 해야하니까 그런거. 솔라피」
--                  「최초 등록안내 에는 여러 가지 학원 규정이라거나 교재안내, 시간표 등 그리고 학생별로 특이 안내 사항이 있을 수 있어 기본 틀은 너가 짜 돼 내가 자유롭게 내용을 추가 수정 할 수 있게 해 줘」(확정-71)
-- ① 자취(notify_log)에 길(channel: push · sms)과 가린 받는 번호(to_phone) — 문자도 같은 자취 한 줄(대전제-7: 나가는 길은 lib/notify.js 한 곳).
-- ② 문구(msg_template) 둘 — sms_welcome(첫 등원 안내: 앱 주소 · 아이디 · 처음 비밀번호 · 수업 · 교재 · 규정 · 아이마다 덧붙임) · sms_guide(18 상담 안내).
--    **원장님이 발송 10 「✉️ 문자 문구」에서 고친다** — 여기 글은 처음 한 벌일 뿐이고, 이미 있으면 안 덮는다(on conflict do nothing).
-- ③ 치환 자리(뼈대-8 표) · 알림 갈래에 guide · sent_log(발송 10)·mine_board(09)·send_board(문구 카드)를 다시 낸다(앞 열쇠는 전부 그대로 — 검사-74).
-- 열쇠는 연동(v2.integration) 'solapi' 줄 — key · secret · from(솔라피에 등록한 발신번호). 여기엔 없다(대전제-9: 열쇠는 코드·마이그레이션에 안 적는다).
alter table v2.notify_log add column if not exists channel text not null default 'push';
alter table v2.notify_log add column if not exists to_phone text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notify_log_channel_choice') then
    alter table v2.notify_log add constraint notify_log_channel_choice check (channel in ('push', 'sms')) not valid;
  end if;
end $$;
comment on column v2.notify_log.channel  is '(커) 어느 길로 나갔나 — push(앱 알림 · 기본) · sms(솔라피 문자)';
comment on column v2.notify_log.to_phone is '(커) 문자를 받은 번호 — 가려서(010-****-1234) · 앱 알림은 비어 있다. 번호를 그대로 쌓지 않는다';

-- 알림 갈래 = lib/notify-plan LABEL 열(0131 · 0133 · 0139) + guide(상담 안내) — 자취와 예약이 같은 열
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule','guide')) not valid;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule','guide')) not valid;   -- 0131 이 걸 때 score·schedule 이 빠져 있었다(0133·0139 가 자취 쪽만 고쳤다) — 셋을 같은 열로(check-rules-db 가 지킨다)

-- ══ 문구 둘 — 처음 한 벌(원장님이 화면에서 고친다 · 이미 있으면 안 덮는다)
insert into v2.msg_template (kind, title, body) values
  ('sms_welcome', '첫 등원 안내', E'[{{학원명}}] {{학생명}} 학생의 등록을 환영합니다.\n\n■ 앱에서 보십니다\nhttps://chloe-english.vercel.app\n학부모 아이디 {{학부모아이디}}\n학생 아이디 {{학생아이디}}\n처음 비밀번호 {{첫비밀번호}}\n(첫 로그인 때 비밀번호를 바꿔 주세요)\n오늘 수업·숙제·시험·수강료를 앱에서 보십니다.\n\n■ 수업\n{{반이름}}\n첫 등원 {{첫등원일}}\n\n■ 교재\n{{교재목록}}\n\n■ 안내\n· 결석·지각은 앱 「남기실 말」이나 전화로 미리 알려 주세요.\n· 숙제는 수업마다 앱에 올라갑니다.\n· 수강료는 매월 앱 안내를 보고 결제선생으로 보내 주세요.\n\n{{덧붙임}}'),
  ('sms_guide',   '상담 안내',   E'[{{학원명}}] {{이름}} 학생 문의 감사합니다.\n상담 일정은 곧 연락드리겠습니다.\n\n학원 앱 https://chloe-english.vercel.app\n\n{{덧붙임}}')
on conflict (kind) do nothing;
comment on table v2.msg_template is '(커) 나가는 글의 틀 — 발송 10 「✉️ 문자 문구」에서 원장님이 고친다. {{ }} 치환 자리는 v2.placeholder(뼈대-8) · 「덧붙임」은 비면 그 줄이 사라진다(아이마다 다른 말)';
alter table v2.msg_template enable row level security; alter table v2.msg_template force row level security;
drop policy if exists staff_all on v2.msg_template;
create policy staff_all on v2.msg_template for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.msg_template to authenticated, service_role;

-- ══ 치환 자리(뼈대-8 표) — 발송 10 의 「{{ }} 치환 자리」 목록에 선다
insert into v2.placeholder (key, note, example, sort) values
  ('이름', '문의한 아이 이름(상담 안내)', '강민서', 40),
  ('학부모아이디', '학부모 계정 아이디(= 전화번호)', '01012345678', 41),
  ('학생아이디', '학생 계정 아이디', 'chloe5678', 42),
  ('첫비밀번호', '앱이 발급한 처음 비밀번호(첫 로그인 때 바꾼다)', '0000', 43),
  ('반이름', '들어간 반 — 이름과 요일·시각', '월수 5시 · 월·수 17:00', 44),
  ('첫등원일', '첫 등원하는 날', '2026-09-15', 45),
  ('덧붙임', '이 아이에게만 덧붙이는 말(등록 전환에서 적는다) — 비면 그 줄이 사라집니다', '셔틀은 3시 20분에 정문에서 탑니다', 46)
on conflict (key) do nothing;

-- ══ sent_log(발송 10 「오늘 나간 것」) — 0118 그대로 + channel · to_phone(반환 꼴이 바뀌어 drop → create · 앞 열은 전부 그대로)
drop function if exists v2.sent_log(timestamptz);
create function v2.sent_log(p_from timestamptz)
returns table (id bigint, profile_id uuid, student_id uuid, student_name text, kind text, title text, sink text,
               created_at timestamptz, sent_at timestamptz, delivered_at timestamptz, opened_at timestamptz, last_opened_at timestamptz,
               open_count int, failed_at timestamptz, fail_why text, why jsonb, sheet_id uuid, job_id bigint, channel text, to_phone text)
language sql stable security definer set search_path = v2, public as $$
  select l.id, l.profile_id, l.student_id, st.name, l.kind, l.title, l.sink, l.created_at, l.sent_at, l.delivered_at, l.opened_at,
         l.last_opened_at, l.open_count, l.failed_at, l.fail_why, l.why, l.sheet_id, l.job_id, l.channel, l.to_phone
    from v2.notify_log l left join v2.students st on st.id = l.student_id
   where l.created_at >= p_from and v2.is_staff()
   order by l.created_at desc
$$;
comment on function v2.sent_log(timestamptz) is '발송 10 「오늘 나간 것」 — 자취(notify_log)에 아이 이름을 붙여서 · (커) 길(channel)과 가린 번호. 읽음은 서버가 찍은 opened_at';
grant execute on function v2.sent_log(timestamptz) to authenticated, service_role;

-- ══ send_board — 0151 그대로 + 'templates'(발송 10 「✉️ 문자 문구」 · 조회를 늘리지 않고 판에 얹는다 — 속도-상한 발송 6) · 검사-74
create or replace function v2.send_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'jobs',      (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from v2.send_jobs((p_on::timestamp at time zone 'Asia/Seoul')) j),
    'logs',      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from v2.sent_log((p_on::timestamp at time zone 'Asia/Seoul')) l),
    'scheduled', (select coalesce(jsonb_agg((to_jsonb(s) || jsonb_build_object('student_name', st.name)) order by s.at), '[]'::jsonb) from v2.scheduled_send s left join v2.students st on st.id = s.student_id where s.sent_at is null and s.cancelled_at is null),   -- (어) 월간·수강료 예약은 판이 없어 아이 이름을 여기서
    'reach',     (select to_jsonb(r) from v2.parent_reach() r),
    'rules',     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'send.%'),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'title', t.title, 'body', t.body, 'updated_at', t.updated_at) order by t.kind), '[]'::jsonb) from v2.msg_template t where t.kind like 'sms\_%'),   -- (커) 문자 문구 — 원장님이 여기서 고친다
    'sms_ready', (select coalesce((i.config->>'key') <> '' and (i.config->>'secret') <> '' and (i.config->>'from') <> '', false) from v2.integration i where i.id = 'solapi')
  ) where v2.is_staff()
$$;

-- ══ mine_board(09 「보낸 것」) — 0150 그대로 + notices 에 channel · to_phone(검사-74)
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
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'url', l.url, 'created_at', l.created_at, 'sent_at', l.sent_at, 'opened_at', l.opened_at, 'sink', l.sink, 'failed_at', l.failed_at, 'channel', l.channel, 'to_phone', l.to_phone) order by l.created_at desc), '[]'::jsonb)
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

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다 — 안 하면 「Could not find the ... column ... in the schema cache」
-- (원장님 2026-09-10 밤: 0154 를 돌리신 뒤 문자 시험에서 그 오류가 났다). 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';
