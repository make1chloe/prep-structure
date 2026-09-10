-- 0157 (뎌-2) 문자로 나가는 갈래를 넓힌다 — 늦은 귀가 · 수강료 · 월간 리포트도 **앱 알림과 함께 문자로**.
-- 원장님 2026-09-10: 「3. 문자갈래」(차례 ②). 학부모가 앱을 안 깔았어도 닿아야 하는 것들이다.
-- ① 규칙 한 줄 `send.sms_kinds` — **어느 갈래를 문자로도 보낼지**(쉼표). 비면 문자는 등록·상담 안내만(지금까지와 같다).
--    원장님이 발송 10 「✉️ 문자 문구」에서 켜고 끈다 — 코드에 박지 않는다(뼈대-5).
-- ② 문구 셋(msg_template) — 늘 그렇듯 **처음 한 벌일 뿐**이고, 원장님이 화면에서 고친다(확정-71 · 이미 있으면 안 덮는다).
--    {{한 줄}} 은 그 갈래를 아는 손이 채운다(늦귀가는 예상 시각·사유 · 수강료는 달·금액 · 월간은 그 달) — 비면 그 줄이 사라진다.
-- ③ 치환 자리(뼈대-8) 둘.
insert into v2.rule (key, value, note) values
  ('send.sms_kinds', '', '앱 알림과 **함께 문자로도** 보낼 갈래(쉼표 — late,fee,monthly). 비면 문자는 등록·상담 안내만. 발송 10 ✉️ 문자 문구에서 켠다')
on conflict (key) do nothing;
insert into v2.msg_template (kind, title, body) values
  ('sms_late',    '늦은 귀가 안내', E'[{{학원명}}] {{이름}} 학생 늦은 귀가 안내입니다.\n{{한 줄}}\n\n앱에서 자세히 보십니다 https://chloe-english.vercel.app'),
  ('sms_fee',     '수강료 안내',   E'[{{학원명}}] {{이름}} 학생 수강료 안내입니다.\n{{한 줄}}\n\n앱에서 자세히 보십니다 https://chloe-english.vercel.app'),
  ('sms_monthly', '월간 리포트',   E'[{{학원명}}] {{이름}} 학생 월간 리포트가 나왔습니다.\n{{한 줄}}\n\n앱에서 보십니다 https://chloe-english.vercel.app')
on conflict (kind) do nothing;
insert into v2.placeholder (key, note, example, sort) values
  ('한 줄', '그 갈래를 아는 손이 채우는 한 줄(늦귀가는 예상 시각·사유 · 수강료는 달·금액 · 월간은 그 달) — 비면 그 줄이 사라집니다', '오늘 21:40 귀가 예정 · 단어 재시험', 47)
on conflict (key) do nothing;

-- 표 모양은 안 바뀌었지만(줄만 늘었다) API 기억을 새로 읽어도 탈이 없다 — 붙여넣기 절차를 한 가지로 지킨다
notify pgrst, 'reload schema';
