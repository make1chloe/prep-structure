-- 「교재 수」 대조가 **안 옮기기로 정한 교재**를 빼고 센다 (원장님이 지우라 한 듣기 교재)
-- ⚠️ 안 빼면 옛 162 vs 새 161 이 영원히 빨갛게 남아, 진짜 빠뜨린 교재가 생겨도 못 알아본다
-- ⚠️ ok 는 **생성 칸**이라 손으로 못 쓴다 — old_val 을 고치면 저절로 다시 판정된다
drop function if exists v2.import_verify();
create function v2.import_verify()
returns table(topic text, who text, old_val numeric, new_val numeric, ok boolean, expected text)
language plpgsql security definer set search_path = v2, public as $$
declare skipped int := (select count(*) from v2.import_skip where old_table='textbooks');
begin
  perform v2.import_verify_base();
  if skipped > 0 then
    update v2.import_check c set old_val = c.old_val - skipped,
           expected = '안 옮기기로 정한 교재 '||skipped||'권을 뺐다'
    where c.topic = '교재 수';
  end if;
  return query select c.topic, c.who, c.old_val, c.new_val, c.ok, c.expected
               from v2.import_check c order by c.ok, c.topic, c.who;
end $$;
grant execute on function v2.import_verify() to service_role;
