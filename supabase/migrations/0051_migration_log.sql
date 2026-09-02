-- 돌린 마이그레이션을 적어 둔다.
-- ⚠️ 계획이 짚은 함정: 「마이그레이션을 더할 때 등록하는 자리는 **둘**이다 —
--    빌드 스크립트와 화면이 읽는 SQL 목록. 뒤엣것을 빠뜨리면 **안 돌린 SQL 을 화면이 모른다.**」
--    여기서는 등록을 사람이 안 한다 — 돌릴 때 저절로 적히고, 검사가 파일과 대조한다.
-- ⚠️ 칸 이름을 `name` 으로 두었더니 파기 검사가 **사람 이름 칸**으로 잡았다.
--    파일 이름이므로 `file` 이 맞다. 검사에 예외를 두지 않고 이름을 고친다 —
--    예외 목록은 시간이 지나면 썩고, 그때 진짜 개인정보 칸이 거기 숨는다.
drop table if exists v2.migration;
create table v2.migration (
  file       text primary key,
  sha        text not null,     -- ⚠️ 파일을 고치고 다시 안 돌리면 DB 가 낡는다. 그걸 잡는 칸
  applied_at timestamptz not null default now()
);
comment on table v2.migration is
  '돌린 마이그레이션. scripts/check-migrations.mjs 가 파일 목록과 대조한다';
alter table v2.migration enable row level security;
alter table v2.migration force row level security;
grant select on v2.migration to authenticated;
create policy staff_read on v2.migration for select to authenticated using (v2.is_staff());
