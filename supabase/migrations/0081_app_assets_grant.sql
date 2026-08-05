-- 0081: 아이콘을 **로그인 없이도** 받아갈 수 있게
--
-- 0080 에서 「읽기는 누구나」 정책을 걸었는데, 정책만으로는 부족하다.
-- Postgres 는 **정책(RLS) 과 권한(GRANT) 을 따로 본다.** 정책이 열려 있어도
-- 표에 대한 select 권한이 없으면 그냥 막힌다.
--
-- 새로 만든 표가 anon 에게 열려 있는지는 프로젝트 설정에 달려 있어서,
-- **그냥 여기서 못 박아 둔다.** 이게 없으면 로고가 조용히 404 로 떨어지고,
-- 화면에는 「안 바뀐다」 로만 보인다.

grant select on public.app_assets to anon, authenticated;

-- 바꾸는 것은 여전히 원장님만이다 (0080 의 정책이 그대로 판단한다).
grant insert, update, delete on public.app_assets to authenticated;
