-- 0063: 직접 보고 검사하는 숙제
--
-- 원장님 원칙: **숙제는 다 낸다.** 사진이든 녹음이든 올리게 한다.
-- 그러니 올라온 게 없으면 안 한 것이다 — 미제출로 봐도 된다.
--
-- 다만 몇 가지는 앱에 낼 것이 없다. 공책을 가져오면 그 자리에서 넘겨보는
-- 숙제가 그렇다. 그런 것만 여기에 표시해 두고, 검사 화면에 **「직접검사」**
-- 라고 적는다. 그 숙제는 안 냈다고 미제출로 몰지 않는다.
--
-- 기본값은 false — **내는 것이 기본**이다. 새로 만드는 학습도 그렇다.

alter table public.homework_items
  add column if not exists in_person boolean not null default false;

comment on column public.homework_items.in_person is
  '직접 보고 검사하는 숙제 (공책 등). 앱에 낼 것이 없으므로 미제출로 세지 않는다';
