-- ⚠️ **몇 번을 돌려도 같은 결과**여야 한다 — 전환 전날 마지막 재적재가 이것을 다시 돈다.
-- 0075 · 화면 넷(발송·일정·운영·교재) 담당이 요청한 DB — **13개**
--
-- ⚠️ 처음엔 15개를 한 파일로 돌리려다 하나가 터져(int4range ->> integer) 통째로 안 들어갔다.
--    하나씩 돌려 **13개만** 굳혔다. 이 파일은 **실제로 들어간 것과 같다.**
--
-- ⏸️ 뺀 것 둘:
--   · 「지각 얼마나」 칸 — 원장님이 지각 시간을 안 쓰기로 하셨다(2026-09-02).
--     찍은 시각이 곧 도착 시각이다. 만들면 그날부터 **죽은 칸**이다.
--   · 「지나간 구간 %」 — spans 를 jsonb 로 짐작해 터졌다. 진짜 꼴은 int4range[] 라
--     **0076 이 range_agg 로 다시 냈다.**

-- ══ [발송 화면] v2.notify_log 에 「만든 때」(created_at) 칸을 더한다
-- 왜: 스위치가 off 면 `sent_at` 이 **null 로 박혀 그 줄에는 시각이 하나도 없다.** 그래서 「오늘 누른 것인가」를 못 세고, 화면이 「안 나간 자취」를 **날짜 없이 통째로** 셀 수밖에 없다. 자취를 언제 만들었는지 모르는 자취는 자취가 아니다. (진짜 DB 에 돌려 보고 되돌렸다)
alter table v2.notify_log add column if not exists created_at timestamptz not null default now();
create index if not exists notify_log_made_idx on v2.notify_log (created_at desc);
comment on column v2.notify_log.created_at is
  '⚠️ 안 나간 줄(sent_at is null)은 이 칸이 없으면 언제 누른 것인지 영영 모른다';


-- ══ [발송 화면] v2.notify_log 에 「마지막으로 읽은 때」(last_opened_at) 를 더하고 v2.mark_notify_seen 이 그것을 찍게 한다
-- 왜: 계획은 읽음을 **처음·마지막·횟수 셋**으로 보라고 한다. 지금은 처음(`opened_at`)과 횟수(`open_count`)만 있고 **마지막이 없다** — 0050 이 `opened_at` 을 일부러 안 덮기 때문이다(그건 맞다). 공지(`v2.notice_read`)는 셋을 다 갖고 있어서 화면이 안내 묶음에만 셋을 띄우고 데일리·하원에는 「마지막 —」을 띄우고 있다. (진짜 DB 에 돌려 보고 되돌렸다)
alter table v2.notify_log add column if not exists last_opened_at timestamptz;
create or replace function v2.mark_notify_seen(p_id bigint, p_opened boolean)
returns void language sql security definer set search_path = v2, public as $$
  update v2.notify_log set
    delivered_at   = coalesce(delivered_at, now()),
    opened_at      = case when p_opened then coalesce(opened_at, now()) else opened_at end,
    last_opened_at = case when p_opened then now() else last_opened_at end,
    open_count     = open_count + case when p_opened then 1 else 0 end
  where id = p_id;
$$;
grant execute on function v2.mark_notify_seen(bigint, boolean) to anon, authenticated, service_role;


-- ══ [발송 화면] v2.scheduled_send 에 sheet_id · late_id 를 더한다 (+ 같은 것을 두 번 예약 못 하게)
-- 왜: 지금 칸은 `kind · student_id · body · at` 뿐이다. 크론이 예약 발송을 실제로 내보내는 날 **「그 아이의 어느 날 판인가」를 못 고른다** — 아이만 알고 판을 모른다. 그리고 같은 판을 두 번 예약해도 아무것도 안 막아 학부모에게 두 통이 간다. `lib/push.js` 의 `sendDaily`·`sendLate` 가 받는 열쇠가 바로 이 둘이라 칸 이름도 그대로 맞췄다. (진짜 DB 에 돌려 보고 되돌렸다)
alter table v2.scheduled_send add column if not exists sheet_id uuid references v2.day_sheet(id) on delete cascade;
alter table v2.scheduled_send add column if not exists late_id  uuid references v2.late_stay(id) on delete cascade;
create unique index if not exists scheduled_send_one_daily_idx on v2.scheduled_send (sheet_id)
  where kind = 'daily' and sent_at is null and cancelled_at is null;
create unique index if not exists scheduled_send_one_late_idx on v2.scheduled_send (late_id)
  where kind = 'late' and sent_at is null and cancelled_at is null;


-- ══ [발송 화면] v2.late_stay 에 sheet_id 유일 인덱스
-- 왜: 표 주석은 「남아서 하고 간 하루 — **판마다 한 줄**」인데 DB 에 제약이 없다. 두 줄이 서면 발송 화면이 **같은 아이 늦귀가를 두 줄로 세우고 학부모 폰에 두 통**을 보낸다(같은 `tag` 라 한 통이 다른 한 통을 덮어 아무도 못 알아챈다). 오늘 화면 담당도 `on conflict` 를 못 써서 같은 것을 적어 뒀다. ⚠️ 지금 `v2.late_stay` 가 0줄이라 그냥 걸리지만, 줄이 쌓인 뒤에는 겹친 줄부터 정리해야 한다. (0줄 상태에서 진짜 DB 에 돌려 보고 되돌렸다)
create unique index if not exists late_stay_one_per_sheet_idx on v2.late_stay (sheet_id);


-- ══ [발송 화면] v2.parent_reach() — 「닿는 길」을 화면이 셀 수 있게 하는 security definer 함수
-- 왜: 화면 맨 위에 **「보내도 대부분 안 닿는다」**를 밝혀야 원장님이 헛기다리지 않는다. 그런데 「한 번도 로그인한 적 없는 집」은 `auth.users.last_sign_in_at` 에 있고 **`authenticated` 가 그 표를 못 읽는다**(실측 — `permission denied for table users`). 그래서 지금 화면은 **알림 켠 기기 수만** 띄우고 「로그인한 적 있는 집은 못 셉니다」라고 밝히고 있다. ⚠️ `auth` 를 **읽기만** 하므로 `scripts/check-v2only.mjs` 규칙(만들기·고치기·권한 주기만 막는다)에 안 걸린다. (진짜 DB 에 돌려 보니 `{parents:21, signed_in:0, linked:21, devices:0}` — 되돌렸다)
create or replace function v2.parent_reach()
returns table (parents int, signed_in int, linked int, devices int)
language sql stable security definer set search_path = v2, public as $$
  select (select count(*)::int from v2.profiles where role = 'parent' and state = 'active'),
         (select count(*)::int from v2.profiles p join auth.users u on u.id = p.id
           where p.role = 'parent' and p.state = 'active' and u.last_sign_in_at is not null),
         (select count(distinct parent_profile_id)::int from v2.parent_student),
         (select count(*)::int from v2.push_sub where revoked_at is null)
$$;
comment on function v2.parent_reach is
  '발송 화면 맨 위 「닿는 길」. ⚠️ 실측 2026-09-02 — 학부모 21명 중 로그인한 적 있는 집 0, 알림 켠 기기 0대';
grant execute on function v2.parent_reach() to authenticated;


-- ══ [일정 화면] v2.holiday 에 상태 칸과 만든 때를 더한다 (휴강을 무를 수 있게)
-- 왜: 계획 3단계는 휴강이 그 달 회차를 바꾸고 도장을 푼다고 적었는데, 지금 `v2.holiday` 에는 상태 칸이 없고 `authenticated` 에 delete 권한도 없다(진짜 DB 로 확인 — has_table_privilege('v2.holiday','delete') = false). 그래서 원장님이 잘못 넣은 휴강을 **되돌릴 길이 아예 없고**, 그 휴강이 회차에서 영원히 빠져 8회가 안 채워진다. 대전제 6 대로 지우지 않고 상태로 내린다.
alter table v2.holiday add column if not exists state text not null default 'on'
  check (state in ('on','off'));
alter table v2.holiday add column if not exists created_at timestamptz not null default now();
comment on column v2.holiday.state is
  '휴강을 무르는 자리. ⚠️ 지우지 않는다(대전제 6) — 회차 셈은 state=''on'' 만 본다';
comment on column v2.holiday.created_at is
  '⚠️ 도장(v2.month_confirm.at)보다 뒤에 들어온 휴강인지 가리는 데 쓴다 — 없으면 「도장 뒤에 휴강이 들어왔다」를 못 센다';

-- ⚠️⚠️ 이 칸이 생기면 **lib/session.js 의 SQL_HOLIDAY 와 lib/todo.js 의 SQL_HOLIDAY_ALL 에
--    `and state = 'on'` 을 같이 더해야 한다.** 안 더하면 무른 휴강이 계속 회차에서 빠져
--    「8회 모자람」이 영영 안 사라진다 — 오류도 안 나고 아무도 못 알아챈다.


-- ══ [일정 화면] v2.month_confirm 에 무름 칸을 더한다 (다음 달 확정 도장을 풀 수 있게)
-- 왜: 계획 3단계: 「도장이 풀리는 조건 — 결석 예정 넣기·지우기는 그 아이만, **휴강은 그 달 전체를 푼다**」. 그런데 `v2.month_confirm` 에는 상태 칸이 없고 delete 권한도 없다(진짜 DB 로 확인). 지금 화면은 도장을 찍기만 하고 **풀린 척은 안 한다** — 풀린 척 그리면 원장님이 안 풀린 도장을 믿으시게 된다.
alter table v2.month_confirm add column if not exists undone_at timestamptz;
alter table v2.month_confirm add column if not exists undone_by uuid references v2.profiles(id);
comment on column v2.month_confirm.undone_at is
  '도장을 무른 때. ⚠️ 지우지 않는다(대전제 6). 계획 3단계 — 휴강은 그 달 **전체** 도장을 푼다';

-- 휴강이 들어오면 그 달 도장을 통째로 푸는 방아쇠
create or replace function v2.holiday_unstamp() returns trigger language plpgsql as $$
begin
  update v2.month_confirm
     set undone_at = now()
   where ym = to_char(new.date, 'YYYY-MM') and undone_at is null;
  return new;
end $$;
drop trigger if exists holiday_unstamp on v2.holiday;
drop trigger if exists holiday_unstamp on v2.holiday;
create trigger holiday_unstamp after insert on v2.holiday
  for each row execute function v2.holiday_unstamp();

-- ⚠️ 읽는 쪽은 `undone_at is null` 인 줄만 「찍힌 도장」으로 본다.


-- ══ [일정 화면] 나이스 시험 이름으로 전국/학교 갈래를 가르는 낱말 목록 표
-- 왜: ㊲: 「받아올 때 이름으로 갈래를 판정한다 — 수능·대학수학능력시험·학력평가·전국연합·학평·모의고사. **이 낱말 목록은 원장님이 고칠 수 있게** 화면에 둔다(학교가 이상하게 적어 오는 일이 있다)」. 지금 이 목록을 담을 자리가 DB 에 없어서 일정 화면은 낱말을 **글로만** 보여 주고 「고칠 곳이 없습니다」를 밝힌다. 표가 없으면 판정이 코드에 박혀 원장님이 못 고친다.
create table if not exists v2.exam_word (                       -- 한 줄 = 「이 낱말이 나오면 이 갈래다」
  word       text primary key,
  scope      text not null default 'national' check (scope in ('national','school')),
  updated_at timestamptz not null default now()
);
comment on table v2.exam_word is
  '한 줄 = 시험 이름에서 갈래를 가르는 낱말 하나. ⚠️ 전국(수능·학평)은 학교를 안 붙인다(절 ㊲)';
insert into v2.exam_word(word) values
  ('수능'),('대학수학능력시험'),('학력평가'),('전국연합'),('학평'),('모의고사')
on conflict (word) do nothing;

alter table v2.exam_word enable row level security;
drop policy if exists staff_all on v2.exam_word;
create policy staff_all on v2.exam_word for all
  using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.exam_word to authenticated;
drop trigger if exists exam_word_touch on v2.exam_word;
create trigger exam_word_touch before update on v2.exam_word
  for each row execute function v2.touch_row();

-- ⚠️⚠️ 표를 하나 더 세우면 `docs/표-유도.md` 에 「한 줄이 무엇인가」를 **먼저 적어야** 한다
--    (자동 검사 ⑳ — `scripts/check-tables.mjs` 가 없으면 깨진다).
--    적는 자리: `node scripts/build-setup-sql.mjs` 와 `node scripts/build-doc.mjs` 둘 다 다시 돌린다.
-- ⚠️ 판정 함수는 **받아오는 쪽 한 벌**에 산다. 화면이 이 표를 읽어 스스로 가르면 두 벌이 된다.


-- ══ [운영 화면] 재원 기간을 묻는 한 벌 — `v2.enrolled_span(uuid)`
-- 왜: 지금 `/ops` 와 `/parent` 가 **각자** 날짜마다 `v2.student_classes()` 를 물어 재원 기간을 흉내 내고 있다(원칙 1 위반). 한 벌이 없으면 화면마다 답이 달라지고, 퇴원생 자료를 어디까지 보이느냐가 파기 규칙과 어긋난다. `app/parent/read.js` 도 같은 자리에서 막혀 needsDb 에 적어 뒀다.
-- 재원 기간 한 벌 — 「이 아이가 언제부터 언제까지 다녔나」.
-- ⚠️ **기간마다 한 줄**로 돌려준다. min~max 로 뭉개면 나갔다 돌아온 아이의
--    빈 사이가 「재원 중」으로 보여 파기와 어긋난다 (처음부터 넣는 것 ⑤).
-- ⚠️ 반 명단 표를 읽는 것은 여기와 v2.class_roster()/v2.student_classes() 뿐이다.
create or replace function v2.enrolled_span(p_student uuid)
returns table (from_date date, to_date date)
language sql stable as $$
  select m.from_date, m.to_date
    from v2.class_member m
   where m.student_id = p_student
   order by m.from_date
$$;
comment on function v2.enrolled_span(uuid) is
  '그 아이의 재원 기간 — 기간마다 한 줄. to_date 가 비면 지금까지. 반 명단을 읽는 한 벌이다';

-- 「그 날 다니고 있었나」 — 줄마다 물어야 하는 자리(상담일지)가 쓰는 모양
create or replace function v2.was_enrolled(p_student uuid, p_on date)
returns boolean
language sql stable as $$
  select exists (select 1 from v2.enrolled_span(p_student) s
                  where s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on))
$$;
comment on function v2.was_enrolled(uuid, date) is
  '그 날 우리 학원에 다니고 있었나 — 퇴원생 자료를 재원 기간으로 자르는 한 벌';


-- ══ [운영 화면] `v2.fee_rule` 이 스스로 지키게 하는 제약 둘
-- 왜: 「돈의 이력」은 처음부터 넣기로 한 자리인데(처음부터 넣는 것 ①) 표에 제약이 하나도 없다. ① **주인이 없는 단가 줄**(학생도 반도 안 붙은 줄)이 들어갈 수 있다 — 지금은 화면이 막지만 엑셀이 화면 제약을 뚫는 유일한 길이다(0단계 6번: 고르는 값은 DB 에도 건다). ② **끝일이 시작일보다 앞선 줄**이 들어가면 그 달 조회에서 조용히 사라진다.
-- ① 주인이 없는 단가 줄을 막는다 — 학생이나 반 중 하나는 있어야 한다
alter table v2.fee_rule drop constraint if exists fee_rule_target;
alter table v2.fee_rule add constraint fee_rule_target check (student_id is not null or class_id is not null);

-- ② 끝일이 시작일보다 앞설 수 없다 (앞서면 그 달 조회에서 조용히 사라진다)
alter table v2.fee_rule drop constraint if exists fee_rule_span;
alter table v2.fee_rule add constraint fee_rule_span check (to_date is null or to_date >= from_date);

comment on table v2.fee_rule is
  '「언제부터 얼마」 한 줄. ⚠️ 값 하나만 두면 단가를 올리는 순간 지난달이 소급해 바뀐다. '
  '⚠️ per_session 은 특강만 참이다 — 정규는 월정액이라 회차와 무관하다(오류 83)';


-- ══ [운영 화면] 그 달에 걸친 단가 줄·상담을 찾는 인덱스
-- 왜: `/ops` 가 달마다 `fee_rule` 을 「그 달에 걸친 줄」로 훑고, 상담일지가 아이별로 훑는다. 지금은 `fee_rule` 0줄 · `consult` 168줄이라 안 아프지만, 단가 이력은 **쌓기만 하고 안 지우므로**(대전제 6) 해마다 는다. 미리 판다.
-- 그 달에 걸친 단가 줄 — 학생 쪽과 반 쪽을 따로 판다 (한쪽은 늘 null 이다)
create index if not exists fee_rule_student_span
  on v2.fee_rule (student_id, from_date desc) where student_id is not null;
create index if not exists fee_rule_class_span
  on v2.fee_rule (class_id, from_date desc) where class_id is not null;

-- 상담을 아이마다 모아 보는 자리 (최근 것부터)
create index if not exists consult_student_at
  on v2.consult (student_id, at desc);


-- ══ [교재 화면] 영역 루틴·학생 루틴 줄을 「안 씀」으로 내릴 상태 칸
-- 왜: ㊷ 가 줄마다 🗑(내리기)를 두라고 했는데 `v2.area_routine`·`v2.student_routine` 에 상태 칸이 없다. 대전제 6 대로 지울 수는 없고 DELETE 권한도 없어서, 지금은 **항목 자체를 내리는 길**밖에 없다(그러면 그 항목이 걸린 다른 영역 줄까지 같이 사라진다). 칸이 서면 화면의 🗑 가 그 영역 줄 하나만 내린다.
-- 0071_routine_state.sql
alter table v2.area_routine    add column if not exists state text not null default 'active';
alter table v2.student_routine add column if not exists state text not null default 'active';
alter table v2.area_routine drop constraint if exists area_routine_state_check;
alter table v2.area_routine add constraint area_routine_state_check    check (state in ('active','retired'));
alter table v2.student_routine drop constraint if exists student_routine_state_check;
alter table v2.student_routine add constraint student_routine_state_check check (state in ('active','retired'));
comment on column v2.area_routine.state    is '이 줄을 아직 쓰나 — retired 는 지운 것이 아니라 「안 씀」으로 내린 것이다 (대전제 6 · ㊷)';
comment on column v2.student_routine.state is '이 줄을 아직 쓰나 — retired 는 지운 것이 아니라 「안 씀」으로 내린 것이다 (대전제 6 · ㊷)';
-- ⚠️ 이 칸이 서면 `lib/routine.js` 의 `routineOf` 가 `r.state='active'` 도 같이 걸러야 한다.
--    안 그러면 내린 줄이 그대로 아이에게 나가고 화면만 「내렸다」고 말한다.


-- ══ [교재 화면] 영상 배정 — 영상 × 학생 + 마감일
-- 왜: 계획 「영상」 절이 「배정 = 영상 × 학생 + 마감일. 폴더로 묶는다」이고 원장 화면은 「배정 대비 다 봄 / 보다 말았음(몇 %) / 안 봄」 세 갈래인데, 지금 `v2.video_view` 는 **본 아이만** 줄이 생긴다. 그래서 「안 봄」의 분모가 없다 — 지금 화면은 「본 아이 수」밖에 못 세고, 그 사실을 화면이 밝히고 있다.
-- 0072_video_assign.sql
create table if not exists v2.video_assign (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references v2.video(id)    on delete restrict,
  student_id  uuid not null references v2.students(id) on delete restrict,
  due_on      date,
  state       text not null default 'active' check (state in ('active','retired')),
  created_at  timestamptz not null default now(),
  unique (video_id, student_id)
);
comment on table v2.video_assign is '한 줄 = 이 아이에게 이 영상을 언제까지 보라고 낸 것. ⚠️ 「안 봄」의 분모가 여기서 나온다 — 없으면 배정 대비를 못 센다';
alter table v2.video_assign enable row level security;
drop policy if exists staff_all on v2.video_assign;
create policy staff_all on v2.video_assign for all  using (v2.is_staff()) with check (v2.is_staff());
drop policy if exists own_va on v2.video_assign;
create policy own_va   on v2.video_assign for select using (student_id in (select v2.my_students()));
grant select, insert, update on v2.video_assign to authenticated;
-- ⚠️ 파기 목록(v2.purge_map)에도 올려야 한다. 안 올리면 파기 SQL 이 이 표를 안 지나간다.

