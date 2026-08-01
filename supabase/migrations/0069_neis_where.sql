-- 0069: 어느 지역 학교인지 적어둔다
--
-- 나이스에서 학교 이름으로 찾으면 **부분 일치**로 여러 곳이 나온다.
-- '신송' 하나로 신송초 · 신송중 · 신송고가 같이 나오고, 같은 이름 학교가
-- 다른 지역에 또 있기도 하다.
--
-- 그런데 우리 목록에는 이름과 학교코드만 남겨두었다. 코드를 외우고 다니는
-- 사람은 없으므로, 화면만 봐서는 **어느 학교를 넣은 것인지 알 수가 없다.**
-- 엉뚱한 학교를 넣어도 모르고, 같은 이름을 두 번 넣어도 모른다.
--
-- 지역과 주소를 같이 적어둔다. 고르는 자리에서도, 넣고 나서도 보인다.

alter table public.neis_schools
  add column if not exists atpt_name text,
  add column if not exists address   text;

comment on column public.neis_schools.atpt_name is '시도교육청 이름 (인천광역시교육청 …)';
comment on column public.neis_schools.address   is '도로명 주소 — 같은 이름 학교를 가리는 데 쓴다';
