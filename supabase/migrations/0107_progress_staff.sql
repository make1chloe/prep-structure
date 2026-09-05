-- 0107 · 진도 체크(목업 02b) — 원장·강사·조교가 진도를 찍는 문. 0009·0052 는 아이가 찍는 문(세 겹)만 열었고 학원 사람 쓰기 정책이 없었다(권한 0017 은 있었다). 한 번 더 돌려도 같다.
drop policy if exists progress_staff on v2.progress;
create policy progress_staff on v2.progress for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
drop policy if exists progress_part_staff on v2.progress_part;
create policy progress_part_staff on v2.progress_part for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
comment on policy progress_staff on v2.progress is '학원 사람은 진도를 찍고 되돌린다(02b). 아이는 0052 의 세 겹 문으로만 — 원장·검사가 찍은 줄은 못 덮는다(확정-㊶)';
grant select, insert, update on v2.progress, v2.progress_part to authenticated, service_role;
