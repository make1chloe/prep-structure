-- 엑셀로 올린 묶음 — **잘못 올렸을 때 묶음 통째로 되돌린다** (엑셀 규칙 8)
-- ⚠️ 이게 없으면 「미리보기를 보고 저장했는데 아니었다」에서 되돌릴 길이 없다.
--    옛 앱은 「141줄 옮겼습니다」라고만 뜨고 끝이었다 (작년 자료가 통째로 올해가 된 사고).
create table v2.excel_run (
  id         bigserial primary key,
  sheet      text,                        -- 파일의 시트 이름
  tbl        text not null,               -- 어느 표에 올렸나
  note       text,
  who        uuid references v2.profiles(id) on delete restrict,
  unattended boolean not null default false,  -- ⚠️ 무인 재적재인가. 무인은 새로 만들지 않는다
  at         timestamptz not null default now(),
  undone_at  timestamptz                  -- 되돌린 때 (대전제 6 — 줄은 안 지운다)
);
comment on table v2.excel_run is '엑셀 올린 묶음 하나. 되돌리기의 열쇠';

-- 그 묶음이 무엇을 바꿨나 — **되돌리려면 바꾸기 전 값이 있어야 한다**
create table v2.excel_row (
  id      bigserial primary key,
  run_id  bigint not null references v2.excel_run(id) on delete restrict,
  tbl     text not null,
  row_id  text not null,
  op      text not null check (op in ('insert','update')),
  before  jsonb,                          -- update 면 바꾸기 전 줄 전체. insert 면 null
  at      timestamptz not null default now()
);
create index on v2.excel_row (run_id, id desc);
comment on column v2.excel_row.before is
  '⚠️ update 의 **바꾸기 전 줄 전체.** 바뀐 칸만 적으면 되돌릴 때 나머지가 비어 버린다';
comment on column v2.excel_row.op is
  '⚠️ 지우기(delete)가 없다 — 엑셀에서 줄을 지워도 앱에서는 안 지워진다(대전제 6 · 규칙 9)';

do $$ declare t text; begin
  foreach t in array array['excel_run','excel_row'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format('grant select, insert, update on v2.%I to authenticated', t);
    execute format('create policy staff_all on v2.%I for all to authenticated
                    using (v2.is_staff()) with check (v2.is_staff())', t);
  end loop;
end $$;
grant usage, select on sequence v2.excel_run_id_seq, v2.excel_row_id_seq to authenticated;
