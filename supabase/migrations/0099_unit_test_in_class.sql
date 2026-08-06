-- 0099: 단원평가는 **오늘 수업에서 적는 그것**이다
--
-- 원장님 (2026-08-06)
--   「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 걸 말하는 거야」
--
-- 학생용 화면에 「문법 단원평가」 칸을 만들려다 멈췄다. **이미 적고 계신다** —
-- 오늘 수업 → 테스트 → 「문장」 이 그것이다 (daily_reports.sent_correct/total).
-- 아이에게 또 적게 하면 같은 시험이 두 줄이 되고, 숫자가 다르면 어느 쪽이
-- 맞는지 아무도 모른다.
--
-- 그래서 **학생 화면에서는 뺐고**, 대신 이미 적고 계신 곳을 성적과 잇는다.
--
-- ── 지금 빠져 있는 것 둘 ─────────────────────────────────
--
-- 노션 단원평가DB 에는 있는데 오늘 수업에는 없는 것이 둘이다.
--
--   **단원명**       「관계대명사」 · 「문장의 형식」
--   **통과/재시험**  이것이 핵심이다. 원장님이 보시는 것은 점수가 아니라
--                    **몇 번 만에 통과했나** 다 (왕희연은 문장의 형식을
--                    다섯 번 봤다)
--
-- 이 둘을 daily_reports 에 붙인다. 새 표를 만들지 않는다 — 선생님은 수업
-- 중에 한 화면에서만 치셔야 한다.
--
-- ── 그리고 성적으로 흘려보낸다 ───────────────────────────
--
-- 리포트(scores, kind='unit')는 노션에서 옮겨온 122줄이 사는 곳이다.
-- 오늘 수업에서 적은 것이 거기로 안 가면, 이관한 옛 기록과 앞으로 쌓일
-- 기록이 갈라진다.
--
-- **daily_reports 가 원본이고 scores 는 사본이다.** 오늘 수업을 저장할 때마다
-- (학생·날짜) 를 열쇠로 덮어쓴다 — 같은 날 두 번 저장해도 한 줄이고,
-- 점수를 고치면 사본도 따라 고쳐진다. 사본이 스스로 달라질 길이 없다.
--
-- (원본을 scores 로 옮기고 daily_reports 에서 빼는 쪽이 더 깨끗하지만,
--  이번 달 현황·학부모 화면·월간 리포트가 전부 sent_* 를 읽고 있다.
--  그것을 한꺼번에 갈아엎는 것은 지금 할 일이 아니다.)

alter table public.daily_reports add column if not exists sent_unit   text;
alter table public.daily_reports add column if not exists sent_passed boolean;

comment on column public.daily_reports.sent_unit is
  '단원평가 단원명 — 관계대명사 · 문장의 형식. 비어 있으면 그냥 문장 테스트';
comment on column public.daily_reports.sent_passed is
  '통과했나 — 원장님이 보시는 것은 점수가 아니라 몇 번 만에 통과했나다';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.unit_test_in_class()
returns boolean language sql immutable as $$ select true $$;
