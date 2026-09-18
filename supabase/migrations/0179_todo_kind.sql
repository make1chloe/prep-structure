-- 0179 (어80) 🗂️ 업무 분류를 표로 — 원장님이 앱에서 더하고 고치고 내린다 — 멱등
--
-- 원장님 2026-09-18:
--  「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」
--  「세부내용의 일괄처리 - 분류 옮기기가능하게, 그리고 전체선택버튼이 없음」
--  「업무-메모에 학사일정이 다 들어가있는데 이건 원하지않아. 학교별 일정에 필요해」
--  「일정으로 추가하면되는거아냐? 일정도 업무처럼 칸반개념으로 가서, 시험만, 학교행사만 필터링해서보면될거같은데」
--
-- ⚠️ 여태 분류(칸)는 lib/todo-plan.js KINDS **열 벌에 글자로 박혀** 있었다. 하나 더하려면 코드를 고쳐야 했으니
--    원장님이 못 고치셨다. 예외를 하나 더 붙일 자리가 아니라 **설계가 틀린 자리**다(원칙 4-3 · 세 번째 예외면 멈춘다).
-- ⚠️ 앱이 내는 열 벌은 씨앗으로 넣고 app=true 로 잠근다 — **못 지운다**(지우면 앱이 만드는 카드가 갈 곳을 잃는다).
--    이름·색·차례·어디에 보일지는 그래도 고치실 수 있다.
-- ⚠️ 지우지 않는다(대전제-6) — 내린 분류는 state='off'. 업무가 남아 있으면 화면은 그 칸을 계속 보여 준다(대전제-0).
-- ⚠️ show_in — 이 분류를 **업무 05 에 보일지 · 일정 12 에 보일지 · 둘 다**인지.
--    옛 앱 학사일정 226줄이 업무 「📋 메모」 칸에 쌓인 까닭이 이것이다(0110 ⑨ 가 public.tasks 를 그대로 옮겼고,
--    0164 가 꼴이 안 맞는 kind 를 죄다 'note' 로 다시 적었다). 그 226줄을 「🏛️ 학교 행사」로 옮기고
--    show_in='schedule' 로 둔다 — 업무에서는 빠지고 일정 달력에는 그대로 남는다(schedule_board 는 kind 를 안 가린다).

begin;

-- ① 분류 표 ────────────────────────────────────────────
create table if not exists v2.todo_kind (
  kind       text primary key,                          -- 앱이 내는 것은 뜻이 있는 글자(make · print …) · 원장님이 만드신 것은 u+8자
  name       text not null,                             -- 화면에 나오는 이름 · 이모지를 앞에 붙인다(「📄 자료 만들기」)
  cls        text not null default '',                  -- 칸 색(nb-orange · nb-blue · nb-yellow · nb-green · nb-red · 빈 것)
  ord        int  not null default 500,                 -- 칸 차례(작은 것이 왼쪽)
  app        boolean not null default false,            -- 앱이 카드를 내는 분류 — 못 내린다
  show_in    text not null default 'todo' check (show_in in ('todo', 'schedule', 'both')),   -- 표-5: `_on` 은 날짜라는 뜻이라 안 쓴다(check-rules-db 가 잡았다)
  state      text not null default 'active' check (state in ('active', 'off')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table v2.todo_kind is
  '(어80) 업무 분류 한 줄 = 05 칸반의 칸 하나. 앱이 내는 열 벌(app=true)은 못 지우고 이름·색·차례만 고친다. 내린 것은 state=off(대전제-6). show_in 이 업무 05 · 일정 12 중 어디에 보일지를 정한다';

drop trigger if exists todo_kind_touch on v2.todo_kind;
create trigger todo_kind_touch before update on v2.todo_kind for each row execute function v2.touch_row();
drop trigger if exists todo_kind_audit on v2.todo_kind;
create trigger todo_kind_audit after insert or update or delete on v2.todo_kind for each row execute function v2.audit_row();
alter table v2.todo_kind enable row level security; alter table v2.todo_kind force row level security;
drop policy if exists todo_kind_staff on v2.todo_kind;
create policy todo_kind_staff on v2.todo_kind for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.todo_kind to authenticated, service_role;   -- 지우는 권한은 없다(대전제-6 · check-grants)

-- ② 앱이 내는 열 벌 — lib/todo-plan.js KINDS 와 **같은 열 벌**이다(check-kind 가 한 글자까지 견준다) ─
--    do nothing — 원장님이 이름을 고치신 뒤에 다시 돌아도 덮어쓰지 않는다(멱등의 뜻은 「같아진다」지 「되돌린다」가 아니다).
insert into v2.todo_kind(kind, name, cls, ord, app) values
  ('make',      '📄 자료 만들기',   'nb-orange', 10, true),
  ('print',     '🖨 인쇄',          'nb-blue',   20, true),
  ('hand',      '📤 배부',          'nb-yellow', 30, true),
  ('solve',     '✍️ 풀이',          '',          40, true),
  ('grade',     '✅ 채점',          'nb-green',  50, true),
  ('unit_test', '✍️ 단원평가 출제',  '',          60, true),
  ('retest',    '🔁 재시험지',      'nb-red',    70, true),
  ('score',     '📥 성적 받기',     'nb-green',  80, true),
  ('repeat',    '⏰ 반복',          '',          90, true),
  ('note',      '📋 메모',          '',         100, true)
on conflict (kind) do nothing;
update v2.todo_kind set app = true
 where app = false and kind in ('make','print','hand','solve','grade','unit_test','retest','score','repeat','note');

-- ③ 🏛️ 학교 행사 — 옛 앱 학사일정이 갈 곳 ─────────────────
insert into v2.todo_kind(kind, name, cls, ord, app, show_in) values
  ('school_event', '🏛️ 학교 행사', 'nb-blue', 110, false, 'schedule')
on conflict (kind) do nothing;

-- ④ kind 를 여덟 값에 가두던 옛 제약을 **먼저 푼다** ─────────
--    0131 이 여덟 값을 글자로 박았고(`todo_kind_choice`) 0164 가 그것을 validate 했다 —
--    **그래서 원장님이 분류를 만드셔도 그리로 옮길 수가 없었다**(DB 가 튕긴다).
--    ⚠️ 2026-09-18 원장님 실측 — 이 줄이 아래 ⑤(학사일정 옮기기)보다 **뒤에** 있어서 실 DB 에서 터졌다:
--       「new row for relation "todo" violates check constraint "todo_kind_choice"」.
--       눌러보기 DB 에는 옛 앱 줄(public.tasks)이 비어 있어 ⑤ 가 빈손으로 지나가 걷기가 못 잡았다 —
--       **옛 자료를 건드리는 줄은 걷기가 못 본다. 차례를 글자로 지킨다**(check-kind).
--    이제 규칙은 「분류 표에 있는 것」 하나다. 글자 목록을 지우고 ⑥ 에서 참조로 바꾼다(표가 곧 규칙 · 원칙-1).
alter table v2.todo drop constraint if exists todo_kind_choice;

-- ⑤ 옛 앱에서 넘어온 학사일정 226줄을 옮긴다 ───────────────
--    짐작하지 않는다 — v2.todo.id 는 public.tasks.id 를 그대로 받았다(0110 ⑨). 그 줄만 정확히 고른다.
--    public 은 **읽기만** 한다(check-v2only 는 밖에 만들거나 고치는 것을 막는다).
do $$ begin
  if to_regclass('public.tasks') is not null then
    update v2.todo d set kind = 'school_event'
     where d.kind = 'note'
       and exists (select 1 from public.tasks t where t.id = d.id and t.kind = 'schedule');
  end if;
end $$;


-- ⑥ 값 목록을 **표 참조**로 ────────────────────────────────
--    씨앗 열 벌 + 🏛️ 학교 행사가 이미 들어갔고 ⑤ 가 옮긴 뒤라 지금 있는 줄은 전부 짝이 있다
--    (0164 가 꼴 안 맞는 kind 를 죄다 'note' 로 몰아 두었다).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'todo_kind_ref' and conrelid = 'v2.todo'::regclass) then
    alter table v2.todo add constraint todo_kind_ref
      foreign key (kind) references v2.todo_kind(kind) on update cascade not valid;
  end if;
end $$;
alter table v2.todo validate constraint todo_kind_ref;

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';
