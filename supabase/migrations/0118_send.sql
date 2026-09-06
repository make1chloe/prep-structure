-- 0118 · 발송 10 — 알림 자취에 「왜 생겼는지」 · 아이·학부모가 알림을 켤 공개키 문 · 발송 판이 읽는 한 벌 둘 · 방해금지·예약 시각 규칙 · 예약 표 쓰기 권한
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① v2.notify_log — 「왜 생겼는지」(뼈대-3: 큐 payload.why 와 같은 꼴 {table,id}) · 판(sheet_id) · 큐 일(job_id)
alter table v2.notify_log add column if not exists why jsonb;
alter table v2.notify_log add column if not exists sheet_id uuid references v2.day_sheet(id) on delete set null;
alter table v2.notify_log add column if not exists job_id bigint;
create index if not exists notify_log_sheet_idx on v2.notify_log (sheet_id);
create index if not exists notify_log_job_idx on v2.notify_log (job_id);
-- ⚠️ 0012 의 sent_at 기본값(now())이 남아 있었다 — 0069 는 not null 만 걷었다. 그대로면 자취를 남기는 순간 「보냈다」가 된다(리허설도 보낸 것처럼). 기본값을 걷는다 — 보낸 때는 lib/notify.js 가 실제로 나갔을 때만 적는다
alter table v2.notify_log alter column sent_at drop default;
comment on column v2.notify_log.why is '왜 생겼는지 {table,id} — 큐(job_queue.payload.why)와 같은 꼴(뼈대-3). 「다시 보내기」가 같은 why 로 큐에 다시 넣는다';
comment on column v2.notify_log.sheet_id is '데일리리포트·늦귀가 안내가 가리키는 판 — 「이 판은 나갔나」를 여기서 센다(발송 10 📨 마감하면 나갑니다)';
comment on column v2.notify_log.job_id is '이 자취를 만든 큐 일(v2.job_queue.id) — 다시 시도해도 자취를 또 만들지 않고 이 줄을 채운다';

-- ══ ② 규칙 줄(뼈대-5) — 방해금지(원장님 2026-08-07 「오후 11시부터 오전 9시까지로 기본설정」 옛 앱 답 그대로) · 예약 단추 시각(확정-㉕ 「오늘 21:00 · 내일 9:00」)
insert into v2.rule (key, value, note) values
  ('send.quiet_from', '23:00', '방해금지 시작 — 이 사이에 나갈 가족 알림은 끝나는 때로 미룬다(큐 next_at). 시작·끝이 같으면 방해금지 없음'),
  ('send.quiet_to',   '09:00', '방해금지 끝 — 미룬 알림이 나가는 때'),
  ('send.evening',    '21:00', '발송 10 예약 단추 「오늘 21:00」의 시각'),
  ('send.morning',    '09:00', '발송 10 예약 단추 「내일 9:00」의 시각')
on conflict (key) do nothing;

-- ══ ③ 공개키 문 — 아이·학부모가 알림을 켤 때 공개키 한 칸만(비밀키는 서버 자신만). integration 표는 원장만 읽는다(0031) — 옛 앱 사고 「허용 눌렀는데 이래」(0110)
create or replace function v2.push_public_key() returns text
language sql stable security definer set search_path = v2, public as $$
  select config->>'publicKey' from v2.integration where id = 'push'
$$;
comment on function v2.push_public_key() is '알림 켜기의 공개키 한 칸 — 이것만으로는 아무에게도 못 보낸다(보내는 비밀키는 서버 자신이 integration 에서 읽는다)';
grant execute on function v2.push_public_key() to authenticated;

-- ══ ④ 발송 판이 읽는 큐 — 가족 알림 일들에 아이 이름을 붙여서(학원 사람만). 화면이 학생 표를 따로 읽지 않게(속도-상한 발송 6 · 2단)
create or replace function v2.send_jobs(p_from timestamptz)
returns table (id bigint, kind text, state text, tries int, next_at timestamptz, locked_at timestamptz, last_error text,
               created_at timestamptz, payload jsonb, student_id uuid, student_name text)
language sql stable security definer set search_path = v2, public as $$
  with j as (
    select q.*, coalesce((q.payload->>'student_id')::uuid,
                         (select s.student_id from v2.day_sheet s where s.id = (q.payload->>'sheet_id')::uuid)) as sid
      from v2.job_queue q
     where q.kind in ('daily_report','late_notice','arrival_notice','leave_notice','attend_plan_notice')
       and (q.created_at >= p_from or q.state in ('wait','taking','fail'))
  )
  select j.id, j.kind, j.state, j.tries, j.next_at, j.locked_at, j.last_error, j.created_at, j.payload, j.sid, st.name
    from j left join v2.students st on st.id = j.sid
   where v2.is_staff()
   order by j.created_at
$$;
comment on function v2.send_jobs(timestamptz) is '발송 10 이 읽는 큐 — 가족 알림 다섯 갈래의 일(오늘 생긴 것 + 아직 안 끝난 것)에 아이 이름을 붙여서. 학원 사람만';

-- ══ ⑤ 오늘 나간 것 — 자취에 아이 이름을 붙여서(학원 사람만)
create or replace function v2.sent_log(p_from timestamptz)
returns table (id bigint, profile_id uuid, student_id uuid, student_name text, kind text, title text, sink text,
               created_at timestamptz, sent_at timestamptz, delivered_at timestamptz, opened_at timestamptz, last_opened_at timestamptz,
               open_count int, failed_at timestamptz, fail_why text, why jsonb, sheet_id uuid, job_id bigint)
language sql stable security definer set search_path = v2, public as $$
  select l.id, l.profile_id, l.student_id, st.name, l.kind, l.title, l.sink, l.created_at, l.sent_at, l.delivered_at, l.opened_at,
         l.last_opened_at, l.open_count, l.failed_at, l.fail_why, l.why, l.sheet_id, l.job_id
    from v2.notify_log l left join v2.students st on st.id = l.student_id
   where l.created_at >= p_from and v2.is_staff()
   order by l.created_at desc
$$;
comment on function v2.sent_log(timestamptz) is '발송 10 「오늘 나간 것」 — 자취(notify_log)에 아이 이름을 붙여서. 읽음은 서버가 찍은 것(mark_notify_seen)만. 학원 사람만';
grant execute on function v2.send_jobs(timestamptz), v2.sent_log(timestamptz) to authenticated, service_role;

-- ══ ⑤b 발송 판 한 벌 — 큐 · 오늘 자취 · 살아 있는 예약 · 닿는 길 · 규칙(send.*)을 한 조회로(속도-상한 발송 6: 껍질 1 · 로그인 1 · 오늘 1 · 오늘 판 1 · 이것 1 = 5)
create or replace function v2.send_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'jobs',      (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from v2.send_jobs((p_on::timestamp at time zone 'Asia/Seoul')) j),
    'logs',      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from v2.sent_log((p_on::timestamp at time zone 'Asia/Seoul')) l),
    'scheduled', (select coalesce(jsonb_agg(to_jsonb(s) order by s.at), '[]'::jsonb) from v2.scheduled_send s where s.sent_at is null and s.cancelled_at is null),
    'reach',     (select to_jsonb(r) from v2.parent_reach() r),
    'rules',     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'send.%')
  ) where v2.is_staff()
$$;
comment on function v2.send_board(date) is '발송 10 이 읽는 한 벌 — 그날(서울 자정부터)의 큐 일 · 자취 · 살아 있는 예약 · 닿는 길 · send.* 규칙. 학원 사람만(아니면 null)';
grant execute on function v2.send_board(date) to authenticated, service_role;

-- ══ ⑥ 예약 표 — 학원 사람이 쓴다(규칙 staff_all 은 0031 에 있는데 쓰기 권한이 없었다 — check-grants 가 잡는 그 사고)
grant insert, update on v2.scheduled_send to authenticated;

-- ══ ⑦ 자취는 서버만 쓴다(0017) — 그대로. 읽기는 staff_all(0016) + 제 것(학부모 화면 「보낸 것」이 뒤에 읽는다 — 본문 칸이 없어 새는 것이 없다)
drop policy if exists own_log on v2.notify_log;
create policy own_log on v2.notify_log for select to authenticated using (profile_id = auth.uid());
