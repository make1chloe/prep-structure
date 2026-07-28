-- 0041: 학원에서만 등원 체크가 되게
--
-- 아이가 오는 길에 미리 눌러버리면 등원 체크가 아무 뜻이 없다.
-- 폰 제출도 마찬가지다 — 누르는 것만으로는 아무것도 증명되지 않는다.
--
-- 그래서 **학원 인터넷에서 온 요청만** 받는다.
--   아이가 할 일은 없다. 학원 와이파이에 붙어 있으면 그냥 된다.
--   오는 길(LTE)에 누르면 "학원에 도착해서 눌러주세요" 가 뜬다.
--
-- 켜고 끄는 스위치는 따로 두지 않는다.
--   **주소가 하나라도 등록돼 있으면 켜진 것**이고, 다 지우면 꺼진다.
--   스위치가 따로 있으면 "켰는데 주소를 안 넣었다" 같은 상태가 생긴다.
--
-- 주소 자체는 비밀이 아니다. 학생도 읽을 수 있어야 화면에서 미리 알려줄 수 있다.
-- (브라우저에서 요청 IP 를 속일 수는 없다 — 서버가 직접 본다)

create table if not exists public.academy_net (
  ip         text primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.academy_net enable row level security;

drop policy if exists staff_all on public.academy_net;
create policy staff_all on public.academy_net
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists read_all on public.academy_net;
create policy read_all on public.academy_net
  for select to authenticated using (true);
