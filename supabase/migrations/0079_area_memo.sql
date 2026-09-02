-- 0079 — 영역 메모 (단어·독해·문법·영작 한 줄씩) + 영역 목록을 한 벌로
--
-- 왜: 목업이 잡은 것 31번 — 「영역별로 덧붙일 말을 적을 자리가 없다」.
--     원장님 확정: 단어·독해·문법·영작마다 **한 줄 메모**를 두고 **그 줄은 아이에게 그대로 나간다**.
--     ⚠️ 교재 메모(`day_item.memo`)와 **다른 것이다** — 교재 메모는 「그 교재 그 회차」에 붙고,
--        영역 메모는 **학생 단위 하루 총평**이다. 둘 다 있어야 한다(⑨-a).
--
-- 곁들여 고치는 것 — 원칙 1 · 0단계 7번
--     ① `books.area` 와 `area_routine.area` 가 **같은 목록을 두 벌**로 들고 있었다.
--        한쪽에 영역을 더하면 다른 쪽에서 그 값이 거절되어, 엑셀이 「없는 값」이라며 줄을 보류한다.
--     ② `student_routine.area` 는 **제약이 아예 없었다.** 고르는 값은 DB 에도 건다(0단계 7번) —
--        엑셀이 화면 제약을 뚫는 유일한 길이라, 여기가 비면 오타가 그대로 새 영역이 된다.
--     → **도메인 한 벌**(`v2.area_name`)로 묶는다. 영역을 더하는 날 고칠 자리가 한 곳이다.
--
-- 되돌리기:
--   drop table v2.day_area_memo;
--   alter table v2.books alter column area type text;
--   alter table v2.area_routine alter column area type text;
--   alter table v2.student_routine alter column area type text;
--   drop domain v2.area_name;

-- ── ① 영역 목록 한 벌
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'v2' and t.typname = 'area_name') then
    create domain v2.area_name as text
      check (value in ('문법','의미덩어리','독해','영작','내신','블록구문','단어'));
  end if;
end $$;

comment on domain v2.area_name is
  '영역 목록 **한 벌**. books·area_routine·student_routine·day_area_memo 가 다 이것을 쓴다. 영역을 더하려면 여기만 고친다 — 두 벌로 두면 한쪽에만 더해져 엑셀이 줄을 보류한다';

-- 두 벌이던 낱개 제약을 걷어내고 도메인으로 갈아 끼운다
alter table v2.books          drop constraint if exists books_area_check;
alter table v2.area_routine   drop constraint if exists area_routine_area_check;
alter table v2.books          alter column area type v2.area_name;
alter table v2.area_routine   alter column area type v2.area_name;
alter table v2.student_routine alter column area type v2.area_name;

-- ── ② 영역 메모
create table if not exists v2.day_area_memo (
  sheet_id   uuid not null references v2.day_sheet(id) on delete restrict,
  area       v2.area_name not null,
  memo       text not null,
  updated_at timestamptz not null default now(),
  primary key (sheet_id, area)
);

comment on table v2.day_area_memo is
  '**한 줄 = 그날 그 아이의 그 영역 한 마디.** 단어·독해·문법·영작마다 한 줄(목업 31). 아이·학부모에게 **그대로 나간다** — 마감해야 보인다. 주인: 앱. ⚠️ 교재 메모(day_item.memo)와 다른 것이다 — 이건 학생 단위 하루 총평이고 그건 교재 그 회차에 붙는다';
comment on column v2.day_area_memo.sheet_id is
  '⚠️ on delete **restrict** — 판을 지우면 이 줄이 같이 사라진다. 판은 지우지 않고 상태로 내린다(대전제 6)';
comment on column v2.day_area_memo.area is '영역 — v2.area_name 한 벌에서만';
comment on column v2.day_area_memo.memo is
  '아이·학부모가 읽는 한 줄. ⚠️ 원장님만 볼 말은 여기 적지 않는다 — 그건 day_sheet.staff_note 다';
comment on column v2.day_area_memo.updated_at is '고친 때. 0단계 3번(내가 읽은 그 줄이 그대로일 때만 저장)이 이 칸을 본다';

create index if not exists day_area_memo_sheet_idx on v2.day_area_memo (sheet_id);

-- ── ③ 접근 규칙 — ⚠️ 정책과 GRANT 는 **짝**이다. 하나만 있으면 아무 일도 안 일어난다
alter table v2.day_area_memo enable row level security;
alter table v2.day_area_memo force row level security;

drop policy if exists staff_all_dam on v2.day_area_memo;
create policy staff_all_dam on v2.day_area_memo for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());

-- ⭐ 아이·학부모는 **마감한 판**만 본다. `sheet_visible` 이 그 술어를 이미 갖고 있다 —
--    여기 마감 조건을 다시 적지 않는다(원칙 1). 옛 앱 사고 #7 이 바로 이 술어가 없어서 났다.
drop policy if exists own_read_dam on v2.day_area_memo;
create policy own_read_dam on v2.day_area_memo for select to authenticated
  using (v2.sheet_visible(sheet_id));

grant select, insert, update on v2.day_area_memo to authenticated;
revoke delete on v2.day_area_memo from authenticated;

-- ── ④ 파기 — 새 표는 파기 목록에 올린다 (자동 검사 ⑨)
insert into v2.purge_map (schema_name, tbl, col, how, note, after_days)
values ('v2', 'day_area_memo', 'memo', 'mask',
        '아이에게 나간 한 줄 — 이름이 들어갈 수 있다. ⚠️ not null 이라 null 로는 못 지운다 — 덮어쓴다', null)
on conflict do nothing;
