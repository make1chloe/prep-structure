-- 0178: 내신 자료를 학생이 「받았어요」 하고 누른다 (2026-08-28)
--
-- 원장님 (8/27 밤): 「내신자료를 배정하면, 그 자료를 실제로 받았는지 학생이 체크」
-- 원장님 (8/28):    「자료 준비가 끝난 것만 아이 화면에 뜬다」
--
-- 번호는 0177 이 아니라 0178 이다 — 「마감 게이트 전면화」가 0177 을 쓴다.
--
-- ── 왜 표를 새로 만드나 ────────────────────────────────
-- prep_assignments 한 줄에는 원장이 찍는 칸이 일곱이다. 거기에 학생 UPDATE 를
-- 열면 그 일곱을 트리거로 지켜야 하는데, 0175 는 before update 만 걸어서
-- INSERT·DELETE 가 뚫려 있었다 (0176 이 이틀 전에 메웠다). 학생이 쓰는 값은
-- 이 레포에서 늘 전용 표에 있다 — arrival_checks(0038) · video_views(0065) ·
-- homework_submissions(0044) · notice_receipts(0129). 지킬 칸이 없는 쪽을 고른다.
--
-- ── 왜 정책 안에서 조인을 안 하나 (실패한 v1 로부터) ─────
-- 처음 판(v1)은 prep_material_types 위의 정책 안에서 같은 표를 조인해
-- 부모 갈래를 폈다. 결과는
--     ERROR: infinite recursion detected in policy for relation "prep_material_types"
-- 이고 **학생뿐 아니라 원장 세션까지 죽었다** — /prep · /today · /me 전멸.
-- 더 나쁜 것은, 그 죽은 상태에서 「정책이 서 있나」만 보던 확인 쿼리가
-- **전부 초록**이었다는 점이다. 0175 의 role_locked_on() 이 select true 라
-- 자물쇠가 없는데 초록이던 것(0176 ①)과 같은 사고다.
-- → 정책은 `id in (select 함수())` 한 줄로 두고, 조인은 security definer
--   함수 안으로 옮긴다 (0057 my_student_ids() · my_class_ids() 와 같은 모양).
-- → 확인은 「정책이 있나」가 아니라 **「학생 권한으로 실제로 읽히나」**로 한다.
--
-- ── 왜 종이·파일을 가르나 ──────────────────────────────
-- 「받았다」의 실물이 자료마다 다르다. 종이는 학원에서 손에 받고, 파일은
-- 집에서도 받는다. 종이인 것만 학원 와이파이 잠금(0041 academy_net)을 건다.
-- 기본값 'paper' — 지금 자료 종류는 need_print 가 기본 true(0053:22)라 전부
-- 인쇄물이고, 엄한 쪽을 기본으로 두어야 「집에서 잘못 눌렀다」가 안 생긴다.
--
-- ── 되돌리기 ──────────────────────────────────────────
--   drop policy if exists receipt_read   on public.prep_receipts;
--   drop policy if exists receipt_insert on public.prep_receipts;
--   drop policy if exists receipt_update on public.prep_receipts;
--   drop policy if exists staff_all      on public.prep_receipts;
--   drop policy if exists material_read_mine on public.prep_materials;
--   drop policy if exists type_read_mine     on public.prep_material_types;
--   drop policy if exists scope_read_mine    on public.prep_scopes;
--   drop table if exists public.prep_receipts;
--   drop function if exists public.my_prep_material_ids();
--   drop function if exists public.my_prep_type_ids();
--   drop function if exists public.my_prep_scope_ids();
--   drop function if exists public.prep_ready(public.prep_materials);
--   drop function if exists public.prep_receipt_on();
--   alter table public.prep_materials      drop column if exists give_kind;
--   alter table public.prep_material_types drop column if exists give_kind;


-- ── 1) 자료를 어떻게 주나 — 종이냐 파일이냐 ────────────────
-- 종류에 정해두면 자료가 물려받는다 (app/prep/actions.js addMaterial 이
-- need_* 여섯을 이미 그렇게 물려받는다 — 같은 길에 한 칸을 더 태운다).
alter table public.prep_material_types
  add column if not exists give_kind text not null default 'paper';
alter table public.prep_materials
  add column if not exists give_kind text not null default 'paper';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prep_types_give_kind_chk') then
    alter table public.prep_material_types
      add constraint prep_types_give_kind_chk check (give_kind in ('paper','file'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prep_mats_give_kind_chk') then
    alter table public.prep_materials
      add constraint prep_mats_give_kind_chk check (give_kind in ('paper','file'));
  end if;
end $$;


-- ── 2) 받았다는 기록 — 학생만 쓰는 표 ────────────────────
-- 되돌리기는 줄을 지우는 게 아니라 received_at 을 비운다 (영상
-- undoFinishVideo 와 같은 결). 지우면 「눌렀다가 되돌렸다」는 자취가 사라진다.
-- 그래서 아래 3) 에서 학생에게 DELETE 를 **주지 않는다** — 말과 정책을 맞춘다.
create table if not exists public.prep_receipts (
  material_id uuid not null references public.prep_materials(id) on delete cascade,
  student_id  uuid not null references public.students(id)       on delete cascade,
  received_at timestamptz,
  by_staff    boolean not null default false,   -- 원장이 대신 찍었나 (/prep 대행 칩)
  created_at  timestamptz not null default now(),
  primary key (material_id, student_id)
);
create index if not exists prep_receipts_student_idx
  on public.prep_receipts (student_id);


-- ── 3) 「준비가 끝났나」 — 판정을 한 곳에 (원장 확정 8/28) ──
--
-- lib/prepRoutine.js stageOf() 의 **앞 세 줄**과 같은 판정이다.
-- 화면(JS)은 stageOf 를 그대로 쓰고, 여기는 RLS 가 쓸 SQL 쪽 한 벌이다.
-- 0169 가 같은 모양이다 — report_gate() 는 정책이 쓰고, 같은 게이트를
-- 화면 쪽(lib/closeGate isClosed)에서도 탄다.
-- **둘이 어긋나지 않게 scripts/check-dup.mjs 가 묶어둔다.**
--
-- 켜둔 단계가 하나도 없는 자료는 「준비 끝」이다 (원장 확정).
-- 표를 하나도 안 읽으므로 재귀 위험이 없다 (0169 report_gate 와 같다).
create or replace function public.prep_ready(m public.prep_materials)
returns boolean
language sql
stable
as $$
  select (not m.need_make  or m.made_at    is not null)
     and (not m.need_print or m.printed_at is not null)
     and (not m.need_card  or m.card_at    is not null)
$$;


-- ── 4) 학생이 볼 수 있는 것의 목록 — security definer 헬퍼 셋 ──
--
-- **정책 안에서 표를 조인하지 않는다.** v1 이 그러다 무한 재귀로 DB 를
-- 죽였다 (위 머리말). 조인은 전부 여기 들어오고, 정책은 `id in (select …)`
-- 한 줄이 된다. 0057 의 my_student_ids() · my_class_ids() 와 같은 모양이다.
--
-- security definer 라 주인 권한으로 돌고 RLS 를 안 탄다 → 재귀가 생길 수 없다.
-- my_student_id() 는 **본인 하나**다 (0047) — 학부모·선생님에게는 null 을
-- 돌려주므로 아래 셋이 전부 빈 목록이 된다 (원장 결정 4).

create or replace function public.my_prep_material_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.material_id
    from public.prep_assignments a
    join public.prep_materials m on m.id = a.material_id
   where a.student_id = public.my_student_id()
     and public.prep_ready(m)
$$;

create or replace function public.my_prep_type_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- 내 자료의 종류 + 그 부모 갈래 한 겹 (갈래는 두 겹이다 — 0053)
  with mine as (
    select distinct m.type_id
      from public.prep_materials m
     where m.id in (select public.my_prep_material_ids())
       and m.type_id is not null
  )
  select type_id from mine
  union
  select t.parent_id
    from public.prep_material_types t
   where t.id in (select type_id from mine)
     and t.parent_id is not null
$$;

create or replace function public.my_prep_scope_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.scope_id
    from public.prep_materials m
   where m.id in (select public.my_prep_material_ids())
$$;

revoke all on function public.my_prep_material_ids() from public;
revoke all on function public.my_prep_type_ids()     from public;
revoke all on function public.my_prep_scope_ids()    from public;
grant execute on function public.my_prep_material_ids() to authenticated;
grant execute on function public.my_prep_type_ids()     to authenticated;
grant execute on function public.my_prep_scope_ids()    to authenticated;


-- ── 5) 잠금 ──────────────────────────────────────────────
alter table public.prep_receipts enable row level security;

drop policy if exists staff_all on public.prep_receipts;
create policy staff_all on public.prep_receipts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생 — 읽기 · 넣기 · 고치기 **셋만**. 지우기는 안 준다.
-- for all 한 벌로 두면 DELETE 까지 열려서, 「자취를 남긴다」는 설계와
-- 정책이 달라진다 (적대 검토에서 실제로 DELETE 1 이 나왔다).
drop policy if exists receipt_own on public.prep_receipts;   -- 옛 이름 청소
drop policy if exists receipt_read on public.prep_receipts;
create policy receipt_read on public.prep_receipts
  for select to authenticated
  using (student_id = public.my_student_id());

drop policy if exists receipt_insert on public.prep_receipts;
create policy receipt_insert on public.prep_receipts
  for insert to authenticated
  with check (
    student_id  = public.my_student_id()
    -- 배정됐고 **준비가 끝난** 자료만. 아니면 REST 로 미리 찍어둘 수 있다
    and material_id in (select public.my_prep_material_ids())
  );

drop policy if exists receipt_update on public.prep_receipts;
create policy receipt_update on public.prep_receipts
  for update to authenticated
  using (student_id = public.my_student_id())
  with check (
    student_id  = public.my_student_id()
    and material_id in (select public.my_prep_material_ids())
  );


-- ── 6) **학생이 「그게 무슨 자료인지」를 읽게 한다** ─────────
--
-- 여기가 이 파일에서 제일 조용한 함정이다.
-- prep_materials · prep_material_types · prep_scopes 는 지금 staff_all 뿐이라
-- (0052 · 0053) 학생 세션에서는 **오류 없이 0줄**이 온다.
-- 화면은 「받을 자료가 없어요」로 뜨고, 원장님 미리보기는 is_staff() 로
-- 통과해 **절대 재현되지 않는다.** 같은 이유로 세 번 당했다 —
-- 0090(학부모 화면 몇 주 빔) · 0158(학생 「다 했어요」 0행) · 0166(특강 빔).
--
-- 세 정책 모두 **조인이 없다** — 위 4) 의 함수가 이미 다 했다.
drop policy if exists material_read_mine on public.prep_materials;
create policy material_read_mine on public.prep_materials
  for select to authenticated
  using (id in (select public.my_prep_material_ids()));

drop policy if exists type_read_mine on public.prep_material_types;
create policy type_read_mine on public.prep_material_types
  for select to authenticated
  using (id in (select public.my_prep_type_ids()));

drop policy if exists scope_read_mine on public.prep_scopes;
create policy scope_read_mine on public.prep_scopes
  for select to authenticated
  using (id in (select public.my_prep_scope_ids()));


-- ── 7) 표식 — 구조 + **자기참조 냄새**까지 본다 ──────────────
--
-- 0175 는 select true 상수를 돌려줬다. 트리거가 없어도 참이라 **자물쇠가
-- 없는데 초록**이었다 (0176 ①). 그래서 여기서는 카탈로그를 실제로 본다.
--
-- **그리고 v1 이 새로 가르쳐준 것**: 구조가 다 서 있어도 정책이 재귀면
-- 조회 순간에만 죽는다. 카탈로그로는 초록이다. 그래서 아래 마지막 절이
-- 「학생 정책의 조건문에 자기 표 이름이 나오나」를 본다 — 재귀의 유일한 원인이다.
--
-- **주의 — 마지막 절은 「냄새」지 증명이 아니다.** 정책 조건문(qual)에 자기 표
-- 이름이 글자로 들어 있는지를 보는 것뿐이라, 이름이 안 나오는 다른 경로로
-- 재귀가 생기면 못 잡는다. (지금 설계에서는 정책이 `id in (select 함수())`
-- 한 줄뿐이라 그럴 길이 없다. 나중에 정책을 손볼 때 이 전제가 깨진다.)
--
-- **그래서 이 함수만으로는 부족하다.** 진짜 확인은 「학생 권한으로 실제로
-- 읽어보기」다. 이 함수는 「빠뜨린 절이 있나」까지만 안다.
create or replace function public.prep_receipt_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 학생 정책 여섯이 다 서 있나
    (select count(*) from pg_policies
      where schemaname = 'public'
        and (tablename, policyname) in (
          ('prep_receipts',       'receipt_read'),
          ('prep_receipts',       'receipt_insert'),
          ('prep_receipts',       'receipt_update'),
          ('prep_materials',      'material_read_mine'),
          ('prep_material_types', 'type_read_mine'),
          ('prep_scopes',         'scope_read_mine'))) = 6
    -- 학생에게 DELETE 가 안 열려 있나
    and not exists (
      select 1 from pg_policies
       where schemaname='public' and tablename='prep_receipts'
         and policyname <> 'staff_all' and cmd in ('DELETE','ALL'))
    -- 종이·파일 칸이 두 표에 다 있나
    and (select count(*) from information_schema.columns
          where table_schema = 'public'
            and table_name in ('prep_materials','prep_material_types')
            and column_name = 'give_kind') = 2
    -- 표가 있고 잠금이 켜져 있나
    and to_regclass('public.prep_receipts') is not null
    and coalesce((select relrowsecurity from pg_class
                   where oid = to_regclass('public.prep_receipts')), false)
    -- **무한 재귀 냄새** — 학생 정책의 조건문이 자기 표를 가리키면 안 된다
    and not exists (
      select 1 from pg_policies p
       where p.schemaname = 'public'
         and p.tablename in ('prep_receipts','prep_materials',
                             'prep_material_types','prep_scopes')
         and p.policyname <> 'staff_all'
         and (coalesce(p.qual,'')       like '%'||p.tablename||'%'
           or coalesce(p.with_check,'') like '%'||p.tablename||'%')
    );
$$;

revoke all on function public.prep_receipt_on() from public;
grant execute on function public.prep_receipt_on() to authenticated;
