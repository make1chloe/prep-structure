-- 리허설(zz_) 줄 정리 · 실 DB 에서 한 번 · (어45) · 원장님 2026-09-15 「zz 들어가는 반 학생은 다 뭐야 용도가」
--
-- 무엇이 리허설인가 : import_batch = 'fixture'(0004 가 넣은 시험 계정·반) 또는 이름이 zz_ 로 시작하는 줄(첫 주 돌려보기 때 손으로 만든 것).
-- 무엇을 하나       : **지우지 않는다**(대전제 6 · 기록은 남는다). 상태만 내린다 ·
--                     사람 left · 학생 left · 반 closed · 학교 closed · 교재 stopped · 학습 항목 retired · 영상 hidden · 자료 dropped.
--                     내린 줄은 목록·오늘 수업·발송에서 빠진다(퇴원생·닫은 반과 같은 길).
-- 안 하는 것        : auth.users · 옛 앱(public) 은 한 줄도 안 건드린다. 수업 일지·진도·성적은 남긴다(지운 줄 0).
-- 어디서            : Supabase → SQL Editor → New query → 통째로 붙여넣고 Run. 다시 돌려도 같다(이미 내린 줄은 안 센다).
-- 문지기            : 눌러보기 DB(chloe)에서는 안 돈다 · 걷기가 그 줄들을 쓴다.
do $$
declare n int; total int := 0;
begin
  if current_database() = 'chloe' then
    raise exception '눌러보기 DB(chloe)에서는 안 돕니다 · 걷기가 리허설 줄을 씁니다. 실 DB 에서만 돌려 주세요';
  end if;
  update v2.students set state = 'left' where state <> 'left' and (import_batch = 'fixture' or name ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '학생 → 퇴원(left) %줄', n;
  update v2.profiles set state = 'left' where state <> 'left' and (import_batch = 'fixture' or name ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '사람(원장·강사·학생·학부모 계정) → left %줄', n;
  update v2.classes set state = 'closed' where state <> 'closed' and (import_batch = 'fixture' or coalesce(nickname, '') ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '반 → 닫음(closed) %줄', n;
  update v2.schools set state = 'closed' where state <> 'closed' and (import_batch = 'fixture' or name ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '학교 → 닫음(closed) %줄', n;
  update v2.books set state = 'stopped' where state <> 'stopped' and (import_batch = 'fixture' or name ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '교재 → 보류(stopped) %줄', n;
  update v2.learn_items set state = 'retired' where state <> 'retired' and (import_batch = 'fixture' or name ilike 'zz\_%');
  get diagnostics n = row_count; total := total + n; raise notice '학습 항목 → 내림(retired) %줄', n;
  update v2.video set state = 'hidden' where state <> 'hidden' and title ilike 'zz\_%';
  get diagnostics n = row_count; total := total + n; raise notice '영상 → 숨김(hidden) %줄', n;
  update v2.material set state = 'dropped' where state <> 'dropped' and (title ilike 'zz\_%' or type_id in (select id from v2.material_type where name ilike 'zz\_%'));   -- 자료는 제 유형(zz_ 유형)으로도 잡는다
  get diagnostics n = row_count; total := total + n; raise notice '자료 → 내림(dropped) %줄', n;
  raise notice '리허설 줄 정리 끝 · 내린 줄 %개 · 지운 줄 0', total;
end $$;
