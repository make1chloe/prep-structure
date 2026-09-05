-- 0111 · 부모님께 글(목업 01 ✉️ · 03 폰) — 글은 day_sheet.comment 그대로(한 벌). 곁에 넷을 더한다: 갈래(상황) · 길이 · 키워드 · AI 초안. 한 번 더 돌려도 같다.
alter table v2.day_sheet add column if not exists comment_kind text;
alter table v2.day_sheet add column if not exists comment_cap  smallint;
alter table v2.day_sheet add column if not exists comment_keys text;
alter table v2.day_sheet add column if not exists comment_ai   text;
alter table v2.day_sheet drop constraint if exists day_sheet_comment_kind_check;
alter table v2.day_sheet add constraint day_sheet_comment_kind_check
  check (comment_kind is null or comment_kind in ('normal', 'no_homework', 'before_exam', 'after_exam', 'late_night'));
alter table v2.day_sheet drop constraint if exists day_sheet_comment_cap_check;
alter table v2.day_sheet add constraint day_sheet_comment_cap_check check (comment_cap is null or comment_cap in (50, 100, 200, 300));
comment on column v2.day_sheet.comment_kind is '글의 상황(갈래 다섯) — normal 보통 · no_homework 숙제안함 · before_exam 시험전 · after_exam 시험후 · late_night 늦은밤. 그날 상태에서 저절로 골라지고(lib/comment-plan.js pickKind) 원장이 바꾼다. 상황이 길이를 먼저 고른다(규칙 comment.cap.*)';
comment on column v2.day_sheet.comment_cap  is '글 길이 상한(자) — 50·100·200·300. 학부모 화면(09)·발송(10)의 꼬리표 「100자 · 보통」이 여기서 나온다';
comment on column v2.day_sheet.comment_keys is '원장이 적은 키워드 — AI 초안의 재료. 아이·학부모에게 안 나간다';
comment on column v2.day_sheet.comment_ai   is 'AI 초안 원문 — comment 와 같으면 「안 고치고 마감」이라 한 번 묻는다(목업 01 · 9/5 ⑥). 아이·학부모에게 안 나간다';
insert into v2.purge_map(tbl, col, how, note) values
  ('day_sheet', 'comment_keys', 'null', '원장이 쓴 말'),
  ('day_sheet', 'comment_ai',   'null', 'AI 초안')
on conflict do nothing;

-- 규칙 값(뼈대-5) — 상황이 길이를 먼저 고른다 · 늦은밤 시작 · 넘으면 다시 시키는 횟수
insert into v2.rule (key, value, note) values
  ('comment.cap.normal',      '100', '보통 날 글 길이(자) — 목업 01 「상황이 길이를 먼저 고른다」'),
  ('comment.cap.no_homework', '200', '숙제 안 해온 날 — 무엇을 안 했고 다음에 어떻게 할지까지'),
  ('comment.cap.before_exam', '100', '시험 전'),
  ('comment.cap.after_exam',  '300', '시험 직후 — 결과와 다음'),
  ('comment.cap.late_night',  '50',  '늦은 밤 — 한두 문장'),
  ('comment.late_from',       '21',  '서울 시각 이 시부터 「늦은밤」이 저절로 골라진다'),
  ('comment.retry',           '2',   'AI 초안이 길이를 넘으면 다시 시키는 횟수 — 그래도 넘으면 문장 끝에서 자른다(글자 중간에서 안 자른다)')
on conflict (key) do nothing;
