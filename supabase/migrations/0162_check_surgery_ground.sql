-- **검사 수술의 땅 고르기** (선행공사-계획서-검사수술-v2 §2-1).
--
-- 넷을 한 번에 까는 이유: 전부 「검사 저장을 지우고-다시쓰기에서
-- 제자리-고치기(0163 check_many)로 바꾸는 수술」의 전제다. 표·칸은
-- 깔아만 두면 무해하고, 자물쇠(부분 유일)는 **겹친쌍이 0 인 지금이
-- 유일한 무통 시점**이다 (2026-08-26 원장님이 유령 검사행 3쌍을 직접
-- 판정·정리 — daily_report_items_dup_backup 에 백업 있음).
--
-- 되돌리기(이 판을 취소할 때 — git revert 는 실 DB 를 못 되돌린다):
--   drop index if exists dri_check_one;
--   drop table if exists public.panel_suggestions;
--   alter table public.daily_reports drop column if exists notified_at, drop column if exists pending_kinds;
--   alter table public.student_textbooks drop column if exists routine_advanced_on;

-- ── 1. (판, 항목) 자물쇠 ────────────────────────────────────
--
-- 현행 유일(0005:75)은 status 를 포함해서, 원장님 판 저장과 조교
-- 검사가 동시에 돌면 같은 항목에 done/weak 가 **둘 다** 들어갈 수
-- 있었다 (실제로 유령 3쌍이 그렇게 생겼다). 검사 3상태는 한 (판,항목)에
-- 한 행 — 0163 의 on conflict 가 이 자물쇠를 표적한다.
create unique index if not exists dri_check_one
  on public.daily_report_items (daily_report_id, homework_item_id)
  where status in ('done','weak','missing');

-- ── 2. 처분 제안 표 ─────────────────────────────────────────
--
-- ✕ 를 준 뒤의 처분(오늘 다시 / 다음 숙제로 / 남아서)은 지금 items 행에
-- 섞여 살았다 — 제안·수락·거부의 삶이 검사 행을 오염시킨다. 별도 표.
-- **0163 이 쓰기 시작할 때까지 비어 있는 것이 정상이다** (지금은 골격만).
-- staff_all 단독이라 학생·학부모 화면 무접촉 (0146 report_keywords 형).
create table if not exists public.panel_suggestions (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports(id) on delete cascade,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  -- kind 는 처분 3종. inclass·homework 는 0141 redo_default 의 어휘
  -- 그대로이고, stay(남아서)는 그 어휘 밖의 추가분이다 (0141 은
  -- inclass|homework|빈값 — 빈값=stay 가 아니다).
  kind       text not null check (kind in ('inclass','homework','stay')),
  status     text not null default 'open' check (status in ('open','taken','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- 축: (판, 항목, kind) 한 벌. stay 는 homework_item_id 가 null 이라
-- 기본 유일에 안 잡힌다 — 부분 유일 두 장으로 자른다 (재제안이
-- 새 행을 만들면 배지가 중복 점등된다).
create unique index if not exists psg_item_kind
  on public.panel_suggestions (daily_report_id, homework_item_id, kind)
  where homework_item_id is not null;
create unique index if not exists psg_stay_kind
  on public.panel_suggestions (daily_report_id, kind)
  where homework_item_id is null;

alter table public.panel_suggestions enable row level security;
drop policy if exists staff_all on public.panel_suggestions;
create policy staff_all on public.panel_suggestions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── 3. 알림 2칸 — 발송 축과 표시 축을 가른다 ─────────────────
--
-- 재✓ 때마다 또 울리던 병의 뿌리는 「보냈다」가 어디에도 없던 것.
-- notified_at = 마지막으로 알린 시각, pending_kinds = 아직 안 알린
-- 종류들. 채우는 자는 0163 뒤의 발송 2단 (지금은 칸만).
alter table public.daily_reports
  add column if not exists notified_at  timestamptz,
  add column if not exists pending_kinds text[];

-- ── 4. 루틴 전진 날짜 ───────────────────────────────────────
--
-- 루틴이 언제 다음 항목으로 넘어갔는지 날짜가 없어서, 같은 날 두 번
-- 저장하면 두 번 전진할 수 있었다. 하루 한 번을 값으로 박는다.
alter table public.student_textbooks
  add column if not exists routine_advanced_on date;

-- 돌아가는지 손가락 하나로 확인하는 탐침 (관리자 화면 「전부 돌아감」)
create or replace function public.check_surgery_ground_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.check_surgery_ground_on() to authenticated;
