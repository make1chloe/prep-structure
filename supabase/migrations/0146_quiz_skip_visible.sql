-- 0146 (가)-⑨(9/8 아침 — 남긴 것 12 「시험 「오늘 건너뜀」 표시」) — 아이가 **오늘 건너뛴 재시험**을 본다. own_quiz(0038)는 「안 본 것(planned) · 마감된 판에서 본 것」만 열어
-- 건너뛴 재시험(skipped · 본 판이 없다)이 아이 화면 07 에서 안 보였다. 낸 판이 보이는 판(마감)이면 건너뛴 줄도 연다. 표는 새로 없다 — 멱등
drop policy if exists own_quiz on v2.quiz;
create policy own_quiz on v2.quiz for select to authenticated
  using (student_id in (select v2.my_students())
     and (state = 'planned' or v2.sheet_visible(taken_sheet_id) or (state = 'skipped' and v2.sheet_visible(assigned_sheet_id))));
comment on policy own_quiz on v2.quiz is '아이·학부모는 제 것만 — 안 본 것(planned) · 마감된 판에서 본 것 · 마감된 판에서 낸 뒤 오늘 건너뛴 재시험(0146)';
