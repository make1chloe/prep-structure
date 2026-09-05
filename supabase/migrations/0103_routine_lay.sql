-- 0103 · 오늘 학습·숙제 저절로 깔기(확정-⑨) — 판×교재 줄 · 뺀 줄 · 줄이기 · 「다음 소단원」 한 벌 · 단원 이름 계산 칸. 한 번 더 돌려도 같다.

-- ── 판×교재 — 언제 깔렸나(있으면 다시 안 깐다) · 교재마다 메모 둘(학습·숙제, 확정-⑨a — 아이 화면에 그대로)
create table if not exists v2.sheet_book (
  sheet_id   uuid not null references v2.day_sheet(id) on delete cascade,
  book_id    uuid not null references v2.books(id) on delete restrict,
  laid_at    timestamptz,
  class_memo text,
  home_memo  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sheet_id, book_id)
);
comment on table v2.sheet_book is
  '한 줄 = 그날 판에 그 교재가 깔린 것 하나. 열쇠 (판, 교재). laid_at 이 있으면 다시 안 깐다 · 교재마다 메모 둘(학습·숙제)은 아이 화면에 그대로(확정-⑨a)';
comment on column v2.sheet_book.laid_at is '루틴이 깔린 때. 비어 있으면 아직 안 깔린 것 — 검사가 끝나면(확정-⑨) lib/routine.js 가 깐다';
alter table v2.sheet_book add column if not exists waves jsonb;
comment on column v2.sheet_book.waves is '깔 때 셈한 회차 고르기(학습: 지난 것 다시·오늘 것·하나 더 / 숙제: 복습·하나 더·다음 것만)와 못 깐 까닭(why). 그날 화면이 읽는 눈금이지 진도가 아니다 — 진도는 progress 에서 센다';
drop trigger if exists sheet_book_touch on v2.sheet_book;
create trigger sheet_book_touch before update on v2.sheet_book for each row execute function v2.touch_row();
drop trigger if exists sheet_book_audit on v2.sheet_book;
create trigger sheet_book_audit after insert or update or delete on v2.sheet_book for each row execute function v2.audit_row();
alter table v2.sheet_book enable row level security; alter table v2.sheet_book force row level security;
drop policy if exists sheet_book_read on v2.sheet_book;
-- 판이 보이면 그 교재 줄도 보인다 — 「누가 언제 보나」는 day_sheet 의 규칙 한 벌이 정한다(0086)
create policy sheet_book_read on v2.sheet_book for select to authenticated
  using (exists (select 1 from v2.day_sheet s where s.id = sheet_book.sheet_id));
drop policy if exists sheet_book_staff_write on v2.sheet_book;
create policy sheet_book_staff_write on v2.sheet_book for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.sheet_book to authenticated, service_role;
insert into v2.purge_map(tbl, col, how, note) values
  ('sheet_book', 'class_memo', 'null', '원장이 쓴 말'),
  ('sheet_book', 'home_memo',  'null', '원장이 쓴 말')
on conflict do nothing;

-- ── 뺀 줄 — 지우지 않고 내린다(대전제-6). 오늘 분량과 검사 분모에서 빠진다(검사-⑩). 필수만·숙제멈춤·회차 줄이기가 이 칸을 켠다
alter table v2.day_item add column if not exists off boolean not null default false;
comment on column v2.day_item.off is '뺀 줄. 지우지 않고 내린다(대전제-6) — 오늘 분량·검사 분모에서 빠진다(검사-⑩). 다시 켜면 되살아난다';

-- ── 줄이기 — 판 하나의 「그대로 · 필수만」(목업 01 줄이기 세그먼트)
alter table v2.day_sheet add column if not exists load_mode text not null default 'all';
alter table v2.day_sheet drop constraint if exists day_sheet_load_mode_check;
alter table v2.day_sheet add constraint day_sheet_load_mode_check check (load_mode in ('all', 'required'));
comment on column v2.day_sheet.load_mode is '줄이기 — all 그대로 · required 필수만(루틴의 필수 줄만). 앱이 밀지 않는다(확정-㊺a) — 원장님이 누른다';

-- ── 「안 한 소단원」 차례 한 벌 — cursor_of 가 이 위에 선다(같은 CTE 두 벌이 되지 않게). 차례: 대단원 → (대단원 기준이면 본책 전부 → 워크북) → 줄 차례
create or replace function v2.todo_units(p_student uuid, p_book uuid, p_on date)
returns table (ord bigint, unit_id uuid, round smallint, chapter text, is_workbook boolean, sort int)
language sql stable as $$
  with sb as (
    select round, coalesce(order_basis, (select order_basis from v2.books where id = p_book)) ob
      from v2.student_book
     where student_id = p_student and book_id = p_book
       and from_date <= p_on and (to_date is null or to_date >= p_on)
     order by from_date desc limit 1),
  u as (
    select x.id, x.chapter, x.is_workbook, x.sort, sb.round r, sb.ob,
           min(x.sort) over (partition by x.chapter) ch_sort
      from v2.units x, sb where x.book_id = p_book and x.state = 'active'),
  todo as (
    select * from u
     where id not in (select p.unit_id from v2.progress p, sb
                       where p.student_id = p_student and p.round = sb.round
                         and p.status in ('done','skip')
                         and coalesce(p.done_on, p.marked_on, p_on) <= p_on))
  select row_number() over (order by ch_sort, case when ob = 'chapter' and is_workbook then 1 else 0 end, sort),
         id, r, chapter, is_workbook, sort
    from todo
   order by 1
$$;
comment on function v2.todo_units(uuid, uuid, date) is
  '이 아이 이 교재의 안 한 소단원을 도는 차례대로. 커서(확정-④)는 저장하지 않고 여기서 세어 나온다 — cursor_of 도 이 위에 선다';
create or replace function v2.cursor_of(p_student uuid, p_book uuid, p_on date)
returns table(round smallint, chapter text, is_workbook boolean, left_in_chapter integer)
language sql stable as $$
  with t as (select * from v2.todo_units(p_student, p_book, p_on)),
       nxt as (select * from t order by ord limit 1),
       sb as (select round from v2.student_book
               where student_id = p_student and book_id = p_book
                 and from_date <= p_on and (to_date is null or to_date >= p_on)
               order by from_date desc limit 1)
  select (select round from sb)::smallint,
         (select chapter from nxt),
         (select is_workbook from nxt),
         (select count(*)::int from t where t.chapter = (select chapter from nxt))
$$;
grant execute on function v2.todo_units(uuid, uuid, date) to authenticated, service_role;

-- ── 단원 이름 계산 칸 — PostgREST 가 units 를 붙일 때 label 로 읽는다(select=…,units(label)). 이름은 unit_label 한 곳(원칙-1)
create or replace function v2.label(u v2.units) returns text language sql stable as $$ select v2.unit_label(u.id, true) $$;
create or replace function v2.short(u v2.units) returns text language sql stable as $$ select v2.unit_label(u.id, false) $$;
-- 회차 세그먼트에 들어갈 짧은 부호 — 「1-4」(소단원 번호) · 「R02」(abbr_only) · 숫자 하나 · 없으면 짧은 이름. 단추 글자가 길면 세그먼트가 잘린다(폰 390)
create or replace function v2.code(u v2.units) returns text language sql stable as $$
  select coalesce((regexp_match(u.sub, '([0-9]+-[0-9]+)'))[1], v2.abbr_only(u.sub), (regexp_match(u.sub, '([0-9]+)'))[1], v2.unit_label(u.id, false))
$$;
grant execute on function v2.label(v2.units), v2.short(v2.units), v2.code(v2.units) to authenticated, service_role;
