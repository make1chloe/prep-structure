-- ⚠️ 새로 선 표 둘에 **force** 가 없었다 — force 가 없으면 **표 주인은 규칙을 그냥 지나간다.**
--    0075 가 만든 표들이다. scripts/check-grants.mjs 가 잡았다.
alter table v2.exam_word force row level security;
alter table v2.video_assign force row level security;
