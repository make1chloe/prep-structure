-- 0026: 회독별 진도 기록 + 경고 월간 초기화
--
-- ── 회독 진도를 지우지 않는다 ────────────────────────────────
-- 0025 에서 "다음 회독으로" 를 누르면 끝낸 단원을 **지웠다.**
-- 그러면 1회독을 언제 어디까지 했는지가 사라진다.
-- 이제는 지우지 않고 회독을 붙여서 **쌓는다.**
--   (학생, 단원, 회독) 하나에 한 줄. 2회독은 빈 상태로 시작하고,
--   1회독 기록은 그대로 남아서 학생 기록에서 볼 수 있다.

alter table public.student_unit_progress
  add column if not exists round int not null default 1;

-- 기본키를 (학생, 단원) → (학생, 단원, 회독) 으로 넓힌다
alter table public.student_unit_progress
  drop constraint if exists student_unit_progress_pkey;
alter table public.student_unit_progress
  add constraint student_unit_progress_pkey
  primary key (student_id, textbook_unit_id, round);

create index if not exists student_unit_progress_round_idx
  on public.student_unit_progress (student_id, round);


-- ── 경고 월간 초기화 ────────────────────────────────────────
-- 한 달에 한 번 쌓인 경고를 0으로 되돌린다.
-- warning_actions 에 kind = 'reset' 한 줄을 남기는 것으로 끝난다.
-- 스키마를 바꿀 필요가 없다 — kind 는 원래 자유 문자열이다.
--   waive      그 날 경고만 빼기
--   reflection 반성문 씀
--   defer      이번엔 넘어감 (유예)
--   reset      월간 초기화        ← 여기서 추가
-- 어느 쪽이든 **기록은 지워지지 않는다.** 경고가 몇 회였고 언제 정리했는지
-- 학생 기록에 그대로 남는다. 다음 달 카운트만 0에서 시작한다.
comment on column public.warning_actions.kind is
  'waive | reflection | defer | reset — 사람이 내린 판단. 경고 자체는 리포트에서 계산한다';

-- "이번 달은 그냥 둘게요" 를 눌렀을 때 그 달을 기억해 둔다 (알림이 다시 안 뜨게)
insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;
