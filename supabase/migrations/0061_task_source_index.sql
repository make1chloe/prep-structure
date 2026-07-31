-- 0061: 받아온 일정이 안 들어가던 것 고침
--
-- 0059 에서 "같은 것을 두 번 넣지 않는다" 를 **조건부 인덱스**로 만들었다.
--
--   create unique index ... on tasks (source, source_id) where source is not null;
--
-- 그런데 Postgres 는 조건부 유일 인덱스를 ON CONFLICT 에 쓰려면 그 조건까지
-- 함께 적어줘야 한다. 앱이 쓰는 통로(PostgREST)는 조건을 붙이지 않으므로
-- 나이스에서 받아올 때마다 이렇게 났다.
--
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- 조건을 뗀다. **비어 있는 값은 서로 다른 것으로 보기 때문에**, 손으로 적은
-- 일정(source 가 비어 있다)은 몇 개든 그대로 들어간다 — 조건이 있을 때와 같다.
-- (진짜 Postgres 에서 확인함: 손으로 적은 3건 그대로, 받아온 것은 두 번 넣어도 1건)

drop index if exists public.tasks_source_uidx;

create unique index if not exists tasks_source_uidx
  on public.tasks (source, source_id);

-- ------------------------------------------------------------
-- **같은 이유로 숙제 → 내 할일이 조용히 안 되고 있었다.**
--
-- 수업에서 숙제를 배정하면 '내가 준비할 것' 이 할일에 자동으로 생겨야 하는데,
-- 그것도 auto_key 의 조건부 유일 인덱스에 ON CONFLICT 를 걸고 있었다.
-- 실패해도 오류를 보지 않고 넘어가는 자리라 아무 말 없이 안 만들어졌다.
--
-- 여기도 조건을 뗀다. auto_key 가 비어 있는 할일(손으로 적은 것)은
-- 서로 다른 것으로 보므로 몇 개든 그대로 들어간다.
-- ------------------------------------------------------------
drop index if exists public.tasks_auto_key_idx;

create unique index if not exists tasks_auto_key_idx
  on public.tasks (auto_key);
