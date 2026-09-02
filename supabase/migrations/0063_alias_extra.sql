-- ① 별칭 표 — 엑셀 규칙 3 「없는 것을 앱이 임의로 만들지 않는다」
-- ⚠️ 교재는 v2.book_alias 가 이미 받아 주는데 **학습 항목과 학생은 받을 곳이 없었다.**
--    그래서 보류 화면에서 「다른 이름으로 등록」을 눌러도 저장할 자리가 없어
--    결국 **「만들자」밖에 못 고르게** 된다 — 오타 하나가 새 항목·새 학생이 되는 그 길이 그대로 열린다.
create table v2.item_alias (
  item_id uuid not null references v2.learn_items(id) on delete restrict,
  alias   text not null,
  source  text,
  primary key (item_id, alias)
);
comment on table v2.item_alias is
  '학습 항목을 부르는 다른 이름. 엑셀이 이름을 못 찾을 때 「만들자」 대신 여기 붙인다';

create table v2.student_alias (
  student_id uuid not null references v2.students(id) on delete restrict,
  alias      text not null,
  source     text,
  primary key (student_id, alias)
);
comment on table v2.student_alias is
  '학생을 부르는 다른 이름. ⚠️ alias 는 **사람 이름**이라 파기가 지나가야 한다';

do $$ declare t text; begin
  foreach t in array array['item_alias','student_alias'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format('grant select, insert, update, delete on v2.%I to authenticated', t);
    execute format($f$create policy staff_all on v2.%I for all to authenticated
                      using (v2.is_staff()) with check (v2.is_staff())$f$, t);
    execute format('create trigger %I_audit after insert or update or delete on v2.%I
                    for each row execute function v2.audit_row()', t, t);
  end loop;
end $$;

-- ⚠️ 학생 별칭은 **사람 이름**이다. 파기 목록에 안 넣으면 퇴원생 이름이 여기 그대로 남는다.
insert into v2.purge_map(schema_name, tbl, col, how, note) values
 ('v2','student_alias','alias','mask','학생을 부르던 다른 이름 — 사람 이름이다')
on conflict (schema_name, tbl, col) do update set how = excluded.how, note = excluded.note;

-- ② 「모르는 엑셀 칸을 통째로 보관」 — 왕복에서 안 버리려고 둔다
-- ⚠️ 지금은 미리보기가 「앱이 모르는 칸 N개 — 저장 안 됨」이라 말하고 **버린다.**
--    문항수·단어수·예상시간처럼 앱이 아직 안 쓰는 칸이 왕복 한 번에 사라져,
--    내려받기로 백업한 파일이 원본보다 얇아진다.
-- ⚠️ **여기 든 값으로 판단하지 않는다.** 판단에 쓰는 순간 죽은 칸이 살아 있는 칸이 된다.
alter table v2.units add column if not exists extra jsonb;
alter table v2.books add column if not exists extra jsonb;
comment on column v2.units.extra is '엑셀에서 온 앱이 모르는 칸. ⚠️ 판단에 쓰지 않는다';
comment on column v2.books.extra is '엑셀에서 온 앱이 모르는 칸. ⚠️ 판단에 쓰지 않는다';
