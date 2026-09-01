-- ─────────────────────────────────────────────────────────────
-- 0040 · 시험 방식 — 고도화 (원장님 2026-09-02)
--
-- 옛 `word_test_settings` 6줄 실측 — **비율(%)로 섞는다**:
--   객뜻 80 · 주뜻 20            (1회독)
--   객뜻 50 · 주뜻 50            (1회독)
--   주뜻 50 · 주영 50 · 2단원씩   (1회독)
--   **주뜻 100**                 (2회독)  ← 회독이 오르면 어려워진다
--   주뜻 50 · 주영 50 · **첫글자 힌트** · 2단원씩 (2회독)
--
-- ⚠️ 지금까지 `way` 를 **글자 한 칸**으로 뒀다 — 「객관식 뜻」처럼.
--    실제로는 **네 가지를 비율로 섞고**, 첫글자 힌트가 따로 있고,
--    **회독마다 다르다.** 글자 한 칸으로는 못 담는다.
-- ─────────────────────────────────────────────────────────────
create table v2.quiz_style (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references v2.students(id) on delete cascade,   -- 비면 학원 기본값
  book_id    uuid references v2.books(id)    on delete cascade,
  round      smallint not null default 1,
  kind       text not null check (kind in ('word','sentence')),

  -- 단어 — 네 가지를 **비율로 섞는다** (합 100)
  mc_meaning smallint not null default 0,   -- 객관식 뜻
  sa_meaning smallint not null default 0,   -- 주관식 뜻
  mc_word    smallint not null default 0,   -- 객관식 영어
  sa_word    smallint not null default 0,   -- 주관식 영어
  first_hint boolean  not null default false,-- 첫글자 힌트
  units_per  smallint,                       -- 몇 단원씩

  -- 문장
  s_way text check (s_way in ('oral','dictation','record')),  -- 구두 · 받아쓰기 · 녹음

  cut_pct smallint not null default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (student_id, book_id, round, kind),
  constraint style_pct check (
    kind <> 'word' or mc_meaning + sa_meaning + mc_word + sa_word = 100),
  constraint style_sentence check (kind <> 'sentence' or s_way is not null)
);
comment on constraint style_pct on v2.quiz_style is
  '⚠️ 합이 100이어야 한다. 안 걸면 「객뜻 80 · 주뜻 30」 같은 것이 조용히 들어와 문항 수가 안 맞는다';

alter table v2.quiz add column if not exists style_id uuid references v2.quiz_style(id) on delete set null;
alter table v2.quiz add column if not exists harder boolean not null default false;  -- 재시험은 더 어렵게
comment on column v2.quiz.harder is
  '재시험. 실측 — 회독이 오르면 **주관식 비율이 오른다**(객뜻 50/주뜻 50 → 주뜻 100).
   재시험도 같은 뜻이다: 처음과 같은 방식으로 다시 보면 배운 것이 안 는다';

/** 이 아이 이 교재 이 회독의 시험 방식 — **한 곳에서** 고른다.
    학생 것 → 교재 것 → 학원 기본값 차례로 찾는다 */
create or replace function v2.style_for(p_student uuid, p_book uuid, p_round smallint, p_kind text)
returns v2.quiz_style language sql stable as $$
  select * from v2.quiz_style s
  where s.kind = p_kind and s.round = p_round
    and (s.student_id = p_student or s.student_id is null)
    and (s.book_id    = p_book    or s.book_id    is null)
  order by (s.student_id is not null) desc, (s.book_id is not null) desc
  limit 1
$$;

/** 방식을 사람이 읽는 말로 — 화면·리포트가 같은 말을 쓰게 */
create or replace function v2.style_text(p_style uuid) returns text
language sql stable as $$
  select case when s.kind='sentence' then
      case s.s_way when 'oral' then '구두' when 'dictation' then '받아쓰기' else '녹음' end
    else
      nullif(concat_ws(' · ',
        case when s.mc_meaning>0 then '객관식 뜻 '||s.mc_meaning||'%' end,
        case when s.sa_meaning>0 then '주관식 뜻 '||s.sa_meaning||'%' end,
        case when s.mc_word   >0 then '객관식 영어 '||s.mc_word||'%' end,
        case when s.sa_word   >0 then '주관식 영어 '||s.sa_word||'%' end,
        case when s.first_hint then '첫글자 힌트' end), '')
    end
  from v2.quiz_style s where s.id = p_style
$$;

-- ⭐ 미통과 → **늦귀가로 잇는다** (원장님 「미통과시 늦귀가 문자발송으로 연결」)
create or replace function v2.quiz_failed_today(p_sheet uuid)
returns table (quiz_id uuid, kind text, scope text, pct numeric)
language sql stable as $$
  select q.id, q.kind,
         coalesce(b.name, s.free_note, '범위 없음'),
         round((q.total - q.wrong)::numeric / nullif(q.total,0) * 100, 0)
  from v2.quiz q
  left join v2.books b on b.id=q.book_id
  left join v2.prep_scope s on s.id=q.scope_id
  where q.taken_sheet_id = p_sheet
    and q.total is not null and q.wrong is not null
    and v2.quiz_passed(q.id) is false
$$;
comment on function v2.quiz_failed_today is
  '⭐ 미통과는 **늦귀가 사유**가 되고 **재시험지 할 일**을 세운다(원장님).
   앱이 세어 주므로 원장님이 따로 찾지 않는다';

do $$ begin
  execute 'create trigger quiz_style_touch before update on v2.quiz_style for each row execute function v2.touch_row()';
  execute 'create trigger quiz_style_audit after insert or update or delete on v2.quiz_style for each row execute function v2.audit_row()';
end $$;
alter table v2.quiz_style enable row level security;
alter table v2.quiz_style force row level security;
create policy staff_all on v2.quiz_style for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());
create policy read_style on v2.quiz_style for select to authenticated using (true);
grant select on v2.quiz_style to authenticated;
grant execute on function v2.style_for(uuid,uuid,smallint,text), v2.style_text(uuid),
  v2.quiz_failed_today(uuid) to authenticated;

-- 학원 기본값 — 실측에서 제일 흔한 것
insert into v2.quiz_style(student_id,book_id,round,kind,mc_meaning,sa_meaning,cut_pct) values
  (null,null,1,'word',50,50,90),
  (null,null,2,'word', 0,100,90),          -- 2회독은 주관식만 (실측)
  (null,null,3,'word', 0,100,90)
on conflict do nothing;
insert into v2.quiz_style(student_id,book_id,round,kind,s_way,cut_pct) values
  (null,null,1,'sentence','oral',90), (null,null,2,'sentence','record',90)
on conflict do nothing;
