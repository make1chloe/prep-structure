-- ─────────────────────────────────────────────────────────────
-- 0023 · 이관 — 옛↔새 매핑표
--
-- ⚠️ **번호를 물려받지 않는다.** 구조를 새로 짰으므로 이관은
--    「옛 표를 새 표에 붓기」가 아니라 **「옛 값을 새 구조의 말로 다시 적기」**다.
--    매핑표가 **재적재가 같은 줄을 두 번 안 만드는 유일한 장치**다.
-- ⚠️ 전환 뒤에도 **안 지운다** — 옛 앱 화면을 보다가 「이게 새 앱 어디로 갔지」를 묻는 자리가 남는다.
-- ─────────────────────────────────────────────────────────────
create table v2.import_map (
  old_table text not null,
  old_id    text not null,
  new_table text,
  new_id    uuid,
  moved_at  timestamptz not null default now(),
  skip_why  text,                      -- 안 옮겼으면 **사유를 남긴다**
  batch     text not null default 'import',
  primary key (old_table, old_id)
);
create index on v2.import_map (new_table, new_id);
comment on table v2.import_map is
  '한 줄 = 「옛 줄 하나가 새 줄 하나가 되었다」 또는 「안 옮겼다 + 왜」';

-- 이관에서 **빼는 줄** — 옛 앱에는 「테스트로 넣은 것」 표시가 없다
create table v2.import_skip (
  old_table text not null, old_id text not null, why text not null,
  primary key (old_table, old_id)
);
comment on table v2.import_skip is
  '⚠️ 실측 — 학생 「테스트계정」 1 · 계정 3 · 반 1 과 딸린 88줄. 안 거르면 그대로 넘어온다';

-- 대조 리포트 — **표 줄 수가 아니라 업무 사실**로 맞춘다
create table v2.import_check (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  topic text not null,                 -- 출결 · 숙제 · 수강료 · 성적 · 진도 · 커서 · 교재
  who text, ym char(7),
  old_val numeric, new_val numeric,
  ok boolean generated always as (old_val is not distinct from new_val) stored,
  note text
);
comment on table v2.import_check is
  '⚠️ 구조가 다르니 **줄 수는 애초에 안 맞는다.** 맞춰 볼 것은 원장님이 아는 사실이다';
