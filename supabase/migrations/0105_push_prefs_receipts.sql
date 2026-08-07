-- ============================================================
-- 0105. 방해금지 시간 · 알림이 닿았는지
--
-- 원장님 (2026-08-07)
--   「학부모 어플에서는 알림 켜기 끄기 방해금지 시간 설정을 할 수 있도록」
--   「알림이 간 경우는 이게 확인이 됐는지 안 됐는지 몇 시에 확인했는지까지
--    기록해 주고, 그걸 알 수 있다는 것에 대해서 학부모와 학생은 모르게」
--
-- ── 1) 방해금지 ─────────────────────────────────────────
--
-- 알림을 아예 끄시면 급한 것까지 안 간다. 대부분은 **밤에 안 울리기를**
-- 바라시는 것이다. 아예 끄는 것 말고 **시간만 비켜가는** 길을 둔다.
--
-- ── 2) 닿았는지 ─────────────────────────────────────────
--
-- 지금은 보내고 나면 끝이다. 그래서 「안 봤다」 와 「안 갔다」 를 구별할
-- 수가 없다. 그 둘은 다음에 할 일이 완전히 다르다 — 앞은 전화를 드려야
-- 하고, 뒤는 알림 설정을 봐드려야 한다.
--
-- 그래서 한 통마다 한 줄을 남긴다. 보낸 때 · 폰에 닿은 때 · 누른 때.
--
-- **화면에는 안 보인다.** 학생·학부모 화면 어디에도 이 표를 읽는 곳이
-- 없고, 읽기 규칙으로도 못 읽게 막는다 (아래 정책). 본인은 자기 줄을
-- **쓸 수만** 있다 — 그것도 표를 직접 만지는 것이 아니라 아래 함수로만.
--
-- 서비스 이용 기록이므로 개인정보 보관 기간(재원 기간 + 1년)을 따른다.
-- ============================================================

-- ── 방해금지 시간 ────────────────────────────────────────
create table if not exists public.push_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  quiet_from time,                            -- 이 시각부터
  quiet_to   time,                            -- 이 시각까지 안 울린다
  updated_at timestamptz not null default now()
);

alter table public.push_prefs enable row level security;

-- 본인 것만 보고 고친다
drop policy if exists prefs_own on public.push_prefs;
create policy prefs_own on public.push_prefs
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 보낼 때 봐야 하므로 선생님은 읽는다
drop policy if exists prefs_staff on public.push_prefs;
create policy prefs_staff on public.push_prefs
  for select to authenticated using (public.is_staff());


-- ── 알림 한 통의 자취 ────────────────────────────────────
create table if not exists public.push_receipts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid references public.students(id) on delete set null,
  title        text,
  kind         text,                          -- notice · homework · report …
  sent_at      timestamptz not null default now(),
  delivered_at timestamptz,                   -- 폰까지 닿은 때
  opened_at    timestamptz                    -- 눌러서 연 때
);

create index if not exists push_receipts_sent_idx on public.push_receipts (sent_at desc);
create index if not exists push_receipts_who_idx  on public.push_receipts (profile_id, sent_at desc);

alter table public.push_receipts enable row level security;

/**
 * **선생님만 읽는다.**
 *
 * 본인이 자기 줄을 읽을 수 있게 하면, 언젠가 화면 어딘가에 「읽음」 이
 * 딸려 나온다. 아예 못 읽게 둔다 — 쓰는 것은 아래 함수로만 한다.
 */
drop policy if exists receipts_staff on public.push_receipts;
create policy receipts_staff on public.push_receipts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

/**
 * 폰이 「받았다 · 눌렀다」 를 알려올 때 쓰는 문.
 *
 * 표에는 손을 못 대게 하고 이 함수만 열어둔다. 그래서 —
 *   · **자기 줄만** 고칠 수 있다 (남의 알림 기록을 못 건드린다)
 *   · **시각 두 칸만** 고칠 수 있다 (제목·대상은 못 바꾼다)
 *   · 돌려주는 것이 없다 (여기로 남의 것을 엿볼 수 없다)
 *
 * 이미 적힌 시각은 **덮어쓰지 않는다** — 처음 본 때가 알고 싶은 것이다.
 */
create or replace function public.mark_push_seen(p_id uuid, p_opened boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_opened then
    update public.push_receipts
       set opened_at = coalesce(opened_at, now()),
           delivered_at = coalesce(delivered_at, now())
     where id = p_id and profile_id = auth.uid();
  else
    update public.push_receipts
       set delivered_at = coalesce(delivered_at, now())
     where id = p_id and profile_id = auth.uid();
  end if;
end;
$$;

comment on function public.mark_push_seen(uuid, boolean) is
  '폰이 알림을 받았거나 눌렀을 때 (0105). 표는 잠겨 있고 이 문으로만 적는다';

revoke all on function public.mark_push_seen(uuid, boolean) from public, anon;
grant execute on function public.mark_push_seen(uuid, boolean) to authenticated;

/**
 * **못 보낸 것도 남긴다** (원장님, 2026-08-07 — 「전송이 아예 안 된 경우
 * 오류 표시 하고 안보내졌다는 게 대시보드에 뜨게 해 줘」).
 *
 * 보내기 전에 줄을 만들어 두므로, 보내다 거절당한 통은 **아무 표시 없이**
 * 「미확인」 으로 남았다. 안 본 것과 아예 못 간 것은 다음에 할 일이 다르다.
 *
 * (표를 만들 때부터 이 칸이 있게 두면 좋지만, 이미 돌리신 분도 있을 수
 *  있어 따로 붙인다 — 두 번 돌려도 탈 없다)
 */
alter table public.push_receipts add column if not exists failed_at timestamptz;
alter table public.push_receipts add column if not exists fail_why text;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.push_prefs_on()
returns boolean language sql immutable as $$ select true $$;
