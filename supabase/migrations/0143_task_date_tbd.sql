-- 날짜 미정 일정 (원장님 2026-08-21 — 「일정이 정확히 나오지 않았지만
-- 공지가 나온 일정」 · 「아무거나 날짜 미정을 붙이게 해줘」).
-- 켜져 있으면 due_on 은 대략 시기일 뿐이다 — 달력에 안 박히고
-- 「날짜 안 나온 일정」 목록에 선다. 날짜가 확정되면 due_on 을 채우고
-- 이 표시를 끈다 — 같은 줄이라 두 번 입력이 없다.
alter table tasks add column if not exists date_tbd boolean not null default false;
