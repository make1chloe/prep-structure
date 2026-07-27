-- 0030: 알림톡 연결 · 할일 제목에 단원 넣기
--
-- ── 알림톡 ──────────────────────────────────────────────────
-- 알림톡은 **미리 승인받은 템플릿**으로만 나간다. 본문을 마음대로 못 쓴다.
-- 대신 템플릿 안의 #{변수} 는 보낼 때 채울 수 있다.
--
-- 그래서 문자 종류마다 두 가지를 적어둔다.
--   · 알림톡 템플릿 코드  — 카카오에서 승인받을 때 받은 코드
--   · 변수 연결          — 템플릿의 #{변수} 를 앱의 어떤 값에 붙일지
--
--     { "#{학생명}": "{{학생명}}", "#{내용}": "{{본문}}" }
--
-- 코드를 안 적으면 지금처럼 문자로 나간다. 종류마다 따로 정할 수 있다.
-- (데일리리포트만 알림톡, 나머지는 문자 — 이런 것도 된다)

alter table public.message_templates
  add column if not exists alimtalk_id   text,
  add column if not exists alimtalk_vars jsonb not null default '{}'::jsonb;

comment on column public.message_templates.alimtalk_id is
  '카카오에서 승인받은 알림톡 템플릿 코드. 비어 있으면 문자로 나간다';
comment on column public.message_templates.alimtalk_vars is
  '알림톡 템플릿의 #{변수} 를 앱의 값에 붙인 것. {"#{이름}":"{{학생명}}"}';


-- ── 할일 제목에 단원을 넣을 수 있게 ─────────────────────────
-- 0028 의 기본값은 학생 이름만 들어갔다. 무슨 단원인지가 빠져서
-- 할일만 보고는 뭘 출제해야 하는지 알 수 없었다.
--   {학생} 학생 이름   {단원} 배정한 단원   {교재} 그 교재   {숙제} 숙제 이름
-- 값이 비면 앞뒤 구분자까지 알아서 정리된다.
update public.homework_items
   set prep_task = '{학생}-단원평가-{단원}'
 where prep_task = '{학생} 단원평가 출제';
