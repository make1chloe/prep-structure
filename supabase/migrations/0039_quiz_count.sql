-- ─────────────────────────────────────────────────────────────
-- 0039 · 시험 개수 (원장님 2026-09-02)
--
--   「내신대비 단어는 **매번 갯수가 달라서** 틀린 갯수·전체 갯수를 써 줘야 해. 문장도.」
--   「**값 입력 안 하면 리포트 출력하지 말고**」
--
-- ⚠️ 지금까지 `total` 을 **낼 때 미리** 정하고 `correct` 를 받았다.
--    내신은 범위가 매번 달라 **전체 개수도 볼 때 정해진다.**
--    그리고 원장님은 **틀린 개수**를 세신다 — 맞은 개수가 아니다.
-- ─────────────────────────────────────────────────────────────
alter table v2.quiz
  add column if not exists wrong smallint,          -- ⭐ 틀린 개수 — 원장님이 세시는 값
  alter column total drop not null;
comment on column v2.quiz.wrong  is '⭐ **틀린 개수.** 맞은 개수는 세어 나온다 — 두 벌로 안 적는다';
comment on column v2.quiz.total  is '전체 개수. ⚠️ 내신은 **볼 때** 정해진다 — 낼 때는 비어 있을 수 있다';

-- 맞은 개수는 **세어 나온다** (대전제 5)
create or replace function v2.quiz_correct(p_quiz uuid) returns int
language sql stable as $$
  select case when q.total is null or q.wrong is null then null else q.total - q.wrong end
  from v2.quiz q where q.id = p_quiz $$;

drop function if exists v2.quiz_passed(uuid);
create or replace function v2.quiz_passed(p_quiz uuid) returns boolean
language sql stable as $$
  select case when q.total is null or q.total = 0 or q.wrong is null then null
              else (q.total - q.wrong)::numeric / q.total * 100 >= q.cut_pct end
  from v2.quiz q where q.id = p_quiz $$;

-- 옛 `correct` 는 뺀다 — **같은 사실을 두 벌로 적지 않는다**(원칙 1)
update v2.quiz set wrong = total - correct where correct is not null and total is not null and wrong is null;
alter table v2.quiz drop column if exists correct;

/** ⭐ 리포트에 나갈 것 — **값이 없으면 안 나간다**(원장님 9/2)
    ① 다음 시간 시험: 개수를 안 적었으면 **그 줄을 안 내보낸다** — 아이가 뭘 외울지 모른다
    ② 오늘 결과: 틀린 개수를 안 적었으면 **결과를 안 내보낸다** — 빈 줄이 나가면 더 헷갈린다 */
create or replace function v2.quiz_for_report(p_sheet uuid)
returns table (part text, kind text, scope text, total smallint, wrong smallint, pct numeric, passed boolean)
language sql stable as $$
  -- 오늘 본 것 — total·wrong 이 **둘 다** 있어야 나간다
  select '오늘 본 것', q.kind,
         coalesce(b.name || ' · ' || coalesce(u.chapter,''), s.free_note, '범위 없음'),
         q.total, q.wrong,
         round((q.total - q.wrong)::numeric / nullif(q.total,0) * 100, 0),
         v2.quiz_passed(q.id)
  from v2.quiz q
  left join v2.books b on b.id = q.book_id
  left join v2.units u on u.id = q.unit_from
  left join v2.prep_scope s on s.id = q.scope_id
  where q.taken_sheet_id = p_sheet and q.total is not null and q.wrong is not null
  union all
  -- 다음 시간 볼 것 — **개수를 적었을 때만** 나간다
  select '다음 시간', q.kind,
         coalesce(b.name || ' · ' || coalesce(u.chapter,''), s.free_note, '범위 없음'),
         q.total, null::smallint, null::numeric, null::boolean
  from v2.quiz q
  left join v2.books b on b.id = q.book_id
  left join v2.units u on u.id = q.unit_from
  left join v2.prep_scope s on s.id = q.scope_id
  where q.assigned_sheet_id = p_sheet and q.state = 'planned' and q.total is not null
$$;
comment on function v2.quiz_for_report is
  '⭐ **값이 없으면 안 나간다.** 개수를 안 적은 시험은 리포트에 줄이 안 선다 —
   빈 줄이 나가면 아이·학부모가 더 헷갈린다';
grant execute on function v2.quiz_correct(uuid), v2.quiz_passed(uuid), v2.quiz_for_report(uuid) to authenticated;
