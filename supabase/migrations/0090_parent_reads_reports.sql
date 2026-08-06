-- 0090: 학부모도 자기 아이 수업 기록을 읽는다
--
-- **학부모 화면이 지금까지 거의 비어 있었다.**
--
-- daily_reports 와 daily_report_items 의 읽기 규칙(0016)이 이렇게 되어 있었다.
--
--   선생님이거나, students.profile_id = auth.uid()  ← **학생 본인만**
--
-- 학부모 계정은 students 에 줄이 없다. parent_student 로 아이와 이어져 있을
-- 뿐이다. 그래서 어머니가 로그인하시면 이번 달 현황도, 최근 수업도, 숙제도
-- 한 줄도 안 나왔다. 오류도 안 났다 — RLS 는 **없는 것처럼** 보여준다.
--
-- 왜 여태 몰랐나: 원장님은 재원생 목록의 「학부모 화면」 으로 확인하신다.
-- 그때는 선생님 계정이라 is_staff() 로 전부 통과한다. **미리보기로는 절대
-- 안 잡히는 종류의 버그다.** 보이는 사람과 못 보는 사람이 다르기 때문이다.
--
-- 규칙을 my_student_ids() 하나로 맞춘다 (0057). 이 함수는 「내 아이 + 나 자신」
-- 을 함께 돌려주므로, 학생·학부모를 두 줄로 나눠 적을 필요가 없다.
-- scores(0072) · notice_receipts(0064) 가 이미 이 방식이다 — 표마다 다른
-- 방식으로 적어두면 언젠가 한 곳을 빠뜨리고, 빠뜨린 그 한 곳이 이렇게 된다.

drop policy if exists student_self_reports on public.daily_reports;
create policy student_self_reports on public.daily_reports
  for select to authenticated
  using (
    public.is_staff()
    or daily_reports.student_id in (select public.my_student_ids())
  );

drop policy if exists student_self_items on public.daily_report_items;
create policy student_self_items on public.daily_report_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
        from public.daily_reports r
       where r.id = daily_report_items.daily_report_id
         and r.student_id in (select public.my_student_ids())
    )
  );

-- (아이가 낸 숙제 homework_submissions 는 0044 에서 이미 학부모 읽기를 열어뒀다.
--  그래서 여기서는 건드리지 않는다 — 멀쩡한 규칙을 다시 쓰면 무엇이 언제
--  왜 바뀌었는지가 흐려진다.)


-- ------------------------------------------------------------
-- 이게 들어갔는지 화면에서 확인할 수 있게 표식을 하나 둔다.
--
-- 이 SQL 은 표도 칸도 만들지 않는다 — **읽기 규칙만** 고친다. 설정 화면의
-- 「지금 DB 상태」 는 표와 칸을 보고 판단하므로, 이대로 두면 목록에 아예 안
-- 뜬다. 안 뜨면 안 돌리시고, 안 돌리면 학부모 화면이 계속 비어 있다.
-- (0086 이 그래서 목록에 없고, 그래서 켜졌는지 아무도 모른다)
--
-- 그래서 **있기만 하면 되는 함수**를 하나 만든다. 이 함수가 불리면 0090 이
-- 들어간 것이다. 하는 일은 지금 규칙이 학부모까지 여는지 그대로 답해주는 것뿐.
-- ------------------------------------------------------------
create or replace function public.parent_reads_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'daily_reports'
       and policyname = 'student_self_reports'
       and qual like '%my_student_ids%'
  );
$$;

revoke all on function public.parent_reads_reports() from public;
grant execute on function public.parent_reads_reports() to authenticated;
