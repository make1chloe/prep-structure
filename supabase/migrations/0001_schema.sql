-- ─────────────────────────────────────────────────────────────
-- 0001 · 스키마와 뼈대
--
-- ⚠️ **`v2` 밖에는 손대지 않는다.** (계획 0단계 9번)
--    `auth.users` 트리거 · `public` 함수 · Storage 정책은 여기서 안 만든다.
--    그것들은 전환일에 한 번에 켤 파일 하나에 모은다.
-- ─────────────────────────────────────────────────────────────
create schema if not exists v2;

-- 시간대는 하나 — 「학원이 있는 곳의 오늘」 (계획 0단계 2번)
create or replace function v2.today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function v2.now_seoul() returns timestamptz
  language sql stable as $$ select now() $$;

-- 누가 쓰고 있나 --------------------------------------------------
create or replace function v2.me() returns uuid
  language sql stable as $$ select auth.uid() $$;

-- ─────────────────────────────────────────────────────────────
-- 이관 표시 — 모든 표에 붙는다 (계획 「처음부터 넣는 것 ⑨」)
--   fixture   리허설 전용. **재적재해도 안 지운다**
--   rehearsal 리허설로 손으로 넣은 것. 다음 재적재가 **먼저 지운다**
--   excel     엑셀로 올린 마스터. **재적재가 안 지운다**
--   import    이관이 넣은 것. 재적재가 지우고 다시 넣는다
--   (없음)    앱에서 만든 것
-- ─────────────────────────────────────────────────────────────
create type v2.batch as enum ('fixture','rehearsal','excel','import');

-- ─────────────────────────────────────────────────────────────
-- 감사 기록 — 「누가 언제 무엇을 무엇으로 바꿨나」
-- ⚠️ 앱 코드에 맡기면 길이 늘 때 빠뜨린다. **트리거로 건다.**
-- ─────────────────────────────────────────────────────────────
create table v2.audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  who         uuid,                       -- auth.uid(). 크론·이관이면 비어 있다
  tbl         text  not null,
  row_id      text  not null,
  op          text  not null check (op in ('insert','update','delete')),
  before      jsonb,
  after       jsonb
);
create index on v2.audit (tbl, row_id, at desc);
create index on v2.audit (at desc);

create or replace function v2.audit_row() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare k text;
begin
  k := coalesce((to_jsonb(coalesce(new, old)) ->> 'id'), '?');
  insert into v2.audit(who, tbl, row_id, op, before, after)
  values (auth.uid(), tg_table_name, k, lower(tg_op),
          case when tg_op in ('update','delete') then to_jsonb(old) end,
          case when tg_op in ('update','insert') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 「내가 읽은 그 줄이 그대로일 때만 저장」 (계획 0단계 3번)
-- 원장님은 수업 중엔 폰, 자리에선 PC 를 쓰신다.
-- 옛 앱은 **나중 저장이 먼저 저장을 통째로 덮는다.**
-- ─────────────────────────────────────────────────────────────
create or replace function v2.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 파기 목록 — 「개인정보가 어디에 남는가」 (계획 「처음부터 넣는 것 ③」)
-- ⚠️ 여기 없는 새 표를 만들면 **검사가 깨진다**(자동 검사 ⑨).
--    schema 칸이 있는 까닭: D+30 에 옛 public 도 같은 목록으로 돈다.
-- ─────────────────────────────────────────────────────────────
create table v2.purge_map (
  schema_name text not null default 'v2',
  tbl         text not null,
  col         text not null,
  how         text not null check (how in ('null','blank','mask','row')),
  note        text,
  primary key (schema_name, tbl, col)
);

comment on table v2.purge_map is
  '파기가 도는 자리. 지우는 것이 아니라 **비식별화**다 — 대전제 6 대로 줄은 안 지운다.';
