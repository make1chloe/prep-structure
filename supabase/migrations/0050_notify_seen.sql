-- 알림 자취 — ⚠️ **「했다」는 서버가 정한다.** 앱이 보낸 시각을 믿지 않는다(대전제).
-- 처음 본 때는 안 덮는다 — 덮으면 「언제 처음 봤나」가 누를 때마다 뒤로 밀린다.
create or replace function v2.mark_notify_seen(p_id bigint, p_opened boolean)
returns void language sql security definer set search_path = v2, public as $$
  update v2.notify_log set
    delivered_at = coalesce(delivered_at, now()),
    opened_at    = case when p_opened then coalesce(opened_at, now()) else opened_at end,
    open_count   = open_count + case when p_opened then 1 else 0 end
  where id = p_id;
$$;
-- ⚠️ 옛 SW 가 `credentials:"include"` 로 부르지만 **로그인이 끊긴 폰에서도 온다.**
--    막으면 「읽음」이 조용히 안 쌓인다 — 자취 번호를 아는 것 자체가 열쇠다.
grant execute on function v2.mark_notify_seen(bigint, boolean) to anon, authenticated, service_role;
