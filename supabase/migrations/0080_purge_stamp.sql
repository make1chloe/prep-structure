-- 0080 — 「파기한 날」 도장 (규칙 처음-3)
--
-- 왜: 처음-3 은 「보관 기한 · 파기 예정일 · **파기한 날** + 파기가 도는 자리 표」 넷을 요구한다.
--     셋은 있었다 — 보관 기한 v2.purge_map.after_days · 파기 예정일 v2.file.purge_on ·
--     파기 목록 표 v2.purge_map(69줄). **「파기한 날」만 v2 어디에도 없었다**
--     (칸 이름을 purge|eras|anonym|destroy 로 훑어 나온 것은 v2.file.purge_on 하나뿐).
--     지금은 「최○○」라는 **가려진 이름 모양**으로 짐작하는 수밖에 없는데,
--     그건 진짜 성함 「최○○」와도, **반쯤 돌다 멈춘 파기**와도 구별이 안 된다.
--
-- ⚠️⚠️ **이름을 `purged_at` 으로 안 짓는다.** 그 이름은 「다 파기했다」로 읽힌다.
--     이 코드가 증명할 수 있는 것은 **v2 안에서 가린 것**까지다 —
--     학부모 로그인(`auth.users`) · 숙제 사진(Storage 버킷) · 옛 `public` 한 벌은
--     **이 파일이 안 건드리는 손일**이라 이 날짜가 못 덮는다(0-9 · HAND_WORK).
--     `purged_at` 이라 적어 두면 퇴원생 학부모가 **그대로 로그인되는데** 장부에는 「파기함」이 남는다.
--     → **아는 만큼만 말하는 이름**으로 짓는다 (대전제-0).
--
-- ⚠️ 트리거도 함수도 만들지 않는다 — 칸 두 개와 설명뿐이다.
-- 되돌리기:
--   alter table v2.students drop column v2_masked_at;
--   alter table v2.profiles drop column v2_masked_at;

alter table v2.students add column if not exists v2_masked_at timestamptz;
alter table v2.profiles add column if not exists v2_masked_at timestamptz;

comment on column v2.students.v2_masked_at is
  '**v2 안에서** 이름·글을 가린 때. 첫 파기일이 진실이다 — 두 번 돌려도 안 바뀐다. ⚠️ 이 날짜는 v2 안만 증명한다: auth.users 의 학부모 로그인 · Storage 버킷의 숙제 사진 · 옛 public 스키마 한 벌은 **이 날짜가 안 덮는다**(손으로 하는 자리)';
comment on column v2.profiles.v2_masked_at is
  '**v2 안에서** 이름·전화를 가린 때. ⚠️ 형제가 재원 중이면 학부모 줄은 안 가리고 날짜도 안 찍는다. auth.users · Storage · 옛 public 은 **이 날짜가 안 덮는다**';
