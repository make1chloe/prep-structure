-- 0167: label 공지 — 특강(0164)을 공지 대상으로 (특강 이행계획서 v2 §8, 8단계).
--
-- 원장 확정 (2026-08-26): 「label 공지 필요함」.
--
-- 특강은 반이 아니라 재원생 속성(0164)이라 notices.class_id (uuid) 에
-- 담을 수가 없다 — 「보강」 같은 가상 그룹이 uuid 자리로 흘러들면 22P02 로
-- 죽는 것과 같은 자리다. 대상 학생은 어차피 만들 때 notice_receipts 에
-- 확정해 깔지만, **어느 특강에 보낸 공지인지**가 줄에 안 남으면 재발송도
-- 감사(「그 특강에 뭘 보냈더라」)도 못 한다. 그래서 정체성 한 칸을 남긴다.
--
-- scope 는 'extra' 로 적힌다 (기존 all | class | grade | student 에 추가 —
-- scope 를 읽는 곳은 표시(targetLabel) 한 곳뿐이라 옛 판도 안 죽는다).
--
-- 되돌리기:
--   alter table public.notices drop column if exists extra_label;
--   (scope='extra' 줄은 남는다 — 수신자는 notice_receipts 에 이미 확정되어
--    있으므로 발송·표시는 그대로 되, 대상 이름만 「특강」 으로 뭉개진다)

alter table public.notices add column if not exists extra_label text;

comment on column public.notices.extra_label is
  '특강 label 공지의 대상 (scope=extra 일 때). 재발송·감사용 정체성 — 대상 학생 확정은 여전히 notice_receipts';

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다)
create or replace function public.extra_label_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.extra_label_on() to authenticated;
