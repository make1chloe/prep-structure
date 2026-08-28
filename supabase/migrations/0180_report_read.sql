-- 0180: 학부모가 리포트를 **열어봤나** (원장님 2026-08-28 —
-- 「선생님이 리포트를 발송했는지, 학부모가 열람했는지 여부를 아이콘으로
--  표시해주는 거야」).
--
-- 반은 이미 있었다. **보냈나**는 daily_reports.sent_at (0012) 이 남긴다.
-- **열어봤나**는 어디에도 없었다 — notice_receipts.read_at(0129) 은 공지를,
-- report_comments.read_at(0023) 은 댓글을 볼 뿐이다. 그래서 표를 새로 판다.
--
-- ── 왜 daily_reports 에 칸을 안 더하나 ────────────────────────────
-- 그 표는 **원장 칸이 가득한 표**다 (점수·코멘트·발송·마감). 학부모에게
-- update 를 열면 그 줄 전체에 손이 닿아 0158 형 트리거를 또 세워야 한다.
-- 학생·학부모가 **쓰는** 값은 전용 표 — 0065 video_views · 0129
-- notice_receipts 와 같은 관례다 (0038 머리말).
--
-- ── 왜 my_student_ids() 를 안 쓰나 (0129 와 갈리는 지점) ──────────
-- my_student_ids() 는 「내 아이 **+ 나 자신**」 을 함께 돌려준다 (0057).
-- 그대로 쓰면 **학생 계정이 제 리포트에 열람 도장을 찍을 수 있고**, 원장
-- 화면에는 「어머니가 보셨다」 로 뜬다 — 화면이 거짓말을 한다. 열람은
-- 학부모의 것이므로 parent_student 만 본다 (my_child_ids()).
--
-- ── 세 동사 (0175 가 update 만 잠가 뚫렸던 실사고를 기억한다) ─────
--   insert : 학부모 본인 것만. 그것도 「내 아이 리포트」 에만.
--   update : **아무도** (선생님 빼고). 도장은 처음 본 때 하나면 된다 —
--            고칠 수 있으면 「안 봤다」 로 되돌릴 수 있게 된다.
--   delete : **아무도** (선생님 빼고). 같은 까닭.
-- RLS 는 정책이 없는 동사를 **거부**한다. 위 둘은 정책을 일부러 안 만든다.
--
-- ── 값까지 못 속이게 ──────────────────────────────────────────────
-- RLS 는 행만 본다. 학부모가 REST 로 read_at 을 딴 시각으로 적어 보낼 수
-- 있으므로, 트리거로 **세션이 있는 비-선생님**의 insert 는 reader_id·read_at
-- 을 서버가 다시 쓴다. 세션이 없는 실행(서비스 키·SQL 화면 수리)은 건드리지
-- 않는다 — 0160 에서 배운 것이다.
--
-- 되돌리기:
--   drop table if exists public.report_reads;
--   drop function if exists public.my_child_ids();
--   drop function if exists public.report_student(uuid);
--   drop function if exists public.guard_report_read();

-- ------------------------------------------------------------
-- 내가 **학부모로서** 맡은 아이들 (my_student_ids 와 달리 나 자신은 없다)
-- ------------------------------------------------------------
create or replace function public.my_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ps.student_id from public.parent_student ps
   where ps.parent_profile_id = auth.uid();
$$;

revoke all on function public.my_child_ids() from public;
grant execute on function public.my_child_ids() to authenticated;

-- 이 리포트는 누구 것인가 — 정책 안에서 잠긴 표를 다시 뒤지면 그 표의
-- 잠금이 또 걸려 **조용히 거짓**이 된다 (0047·0057 에서 이미 데었다).
create or replace function public.report_student(p_report uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.student_id from public.daily_reports r where r.id = p_report;
$$;

revoke all on function public.report_student(uuid) from public;
grant execute on function public.report_student(uuid) to authenticated;

-- ------------------------------------------------------------
-- 열람 도장
-- ------------------------------------------------------------
create table if not exists public.report_reads (
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  reader_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (daily_report_id, reader_id)
);

alter table public.report_reads enable row level security;

-- 선생님은 다 본다 (원장 화면이 아이콘을 그리려면 읽어야 한다)
drop policy if exists staff_all on public.report_reads;
create policy staff_all on public.report_reads
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 학부모는 **자기 아이 리포트에 자기 도장을 한 번 찍는 것**만
drop policy if exists parent_mark_read on public.report_reads;
create policy parent_mark_read on public.report_reads
  for insert to authenticated
  with check (
    reader_id = auth.uid()
    and public.report_student(daily_report_id) in (select public.my_child_ids())
  );

-- update · delete 정책은 **일부러 없다** (위 머리말)

-- **security definer 다.** 이 함수는 auth.uid() 를 직접 부르는데, 트리거는
-- 그 줄을 넣는 사람(authenticated)의 권한으로 돈다 — auth 스키마 권한이
-- 조금이라도 좁으면 「permission denied for schema auth」 로 **넣기 자체가
-- 막힌다.** 0158 의 가드는 is_staff()(이미 definer) 뒤에 숨어 그 자리를
-- 안 밟았을 뿐이다. 여기서는 값을 덮어써야 하므로 앞에서 부른다.
-- (scripts/check-seen.sh 가 학부모 세션으로 이걸 잡았다 — 2026-08-28)
create or replace function public.guard_report_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 세션이 없는 실행(서비스 키 관리 작업)은 RLS 를 애초에 우회하는
  -- 관리 경로다 — 트리거로 다시 막을 대상이 아니다 (0160).
  if auth.uid() is not null and not public.is_staff() then
    new.reader_id := auth.uid();
    new.read_at   := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_report_read on public.report_reads;
create trigger trg_guard_report_read
  before insert on public.report_reads
  for each row execute function public.guard_report_read();

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다).
-- 트리거는 표·칸을 안 남기므로 pg_trigger 를 **실제로 조회**한다 (0176 관례).
create or replace function public.report_read_on()
returns boolean language sql stable as $$
  select exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.report_reads'::regclass
       and t.tgname = 'trg_guard_report_read'
       and not t.tgisinternal
  );
$$;
grant execute on function public.report_read_on() to authenticated;
