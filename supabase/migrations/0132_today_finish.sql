-- 0132 오늘 수업 01·03 마무리(4단계-1 · 원장님 9/7 「database-url 제외한 나머지 이어서해」) — 멱등
-- ① 줄이기 「그대로 N · 필수만 M」 을 판 안에서 센다: 루틴 줄의 필수 표시를 깔 때 옮겨 적는다(조회 없이 센다 — 속도-1)
alter table v2.day_item add column if not exists required boolean not null default false;
comment on column v2.day_item.required is '깔 때 루틴 줄의 필수 표시를 옮겨 적은 것(area_routine.required · 학생루틴 줄은 다 필수) — 줄이기 세그먼트의 「필수만 M」 을 판 안에서 센다(trimCounts). 손으로 더한 줄·나머지 줄은 false';
-- ② 📣 「오늘 좀 많습니다」 문턱(목업 01 · 확정-㊺a: 앱은 말만 하고 줄이는 것은 원장님이 조절에서)
insert into v2.rule (key, value, note) values
  ('day.heavy_pages', '30', '📣 「오늘 좀 많습니다 — 합쳐 N쪽」 문턱(쪽) — 그날 학습+숙제(뺀 줄 빼고)의 소단원 쪽수 합이 이 값을 넘으면 띠. 앱은 말만 하고 줄이는 것은 원장님(확정-㊺a). 0 이면 안 띄운다')
on conflict (key) do nothing;
