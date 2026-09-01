-- 0017 · 권한 — 표가 늘었으니 다시 준다
-- ⚠️ 규칙만 있고 권한이 없으면 아무도 못 본다. **둘 다** 있어야 한다
grant select on all tables in schema v2 to authenticated;
grant insert, update on
  v2.progress, v2.progress_flag, v2.progress_part,
  v2.day_item, v2.score, v2.score_wrong,
  v2.material_give, v2.file, v2.file_link, v2.push_sub, v2.video_view
to authenticated;
-- ⚠️ 아이가 지우는 길은 **어디에도 안 연다**
revoke delete on all tables in schema v2 from authenticated;
-- 감사·파기·큐는 읽기도 규칙이 막지만 쓰기 권한도 안 준다
revoke insert, update on v2.audit, v2.purge_map, v2.job_queue, v2.notify_log,
                          v2.auto_key, v2.day_ran, v2.notice_read from authenticated;
grant execute on all functions in schema v2 to authenticated;
grant usage, select on all sequences in schema v2 to authenticated;
alter default privileges in schema v2 grant select on tables to authenticated;
