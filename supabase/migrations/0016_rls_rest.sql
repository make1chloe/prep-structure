-- ─────────────────────────────────────────────────────────────
-- 0016 · 나머지 전부의 접근 규칙
--
-- ⭐ **사고 #7 을 여기서 막는다** — 옛 앱은 판 정책에 마감 술어가 없어
--    학생 70줄·학부모 122줄이 **만들자마자 보였다.**
-- ─────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array[
    'learn_items','area_routine','student_routine',
    'day_sheet','day_item','word_test','unit_test','late_stay',
    'push_sub','notify_log','msg_template','notice','notice_read',
    'job_queue','auto_rule','auto_key','day_ran',
    'prep_scope','material_type','material','material_item','material_give',
    'fee_rule','payment','holiday','makeup','score','score_wrong',
    'consult','inquiry','todo','video','video_view',
    'file','file_bin','file_link'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    execute format($f$create policy staff_all on v2.%I for all to authenticated
                      using (v2.is_staff()) with check (v2.is_staff())$f$, t);
  end loop;
end $$;

-- 「이 판을 아이·부모가 볼 수 있나」 — **한 곳에서 판단한다**
create or replace function v2.sheet_visible(p_sheet uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.day_sheet s
                 where s.id = p_sheet
                   and s.student_id in (select v2.my_students())
                   and s.closed_at is not null)      -- ⭐ 마감해야 보인다
$$;

-- ── 판 ──────────────────────────────────────────────────────
create policy own_sheet on v2.day_sheet for select to authenticated
  using (student_id in (select v2.my_students()) and closed_at is not null);
create policy own_item on v2.day_item for select to authenticated
  using (v2.sheet_visible(sheet_id));
create policy own_word on v2.word_test for select to authenticated
  using (v2.sheet_visible(sheet_id));
create policy own_late on v2.late_stay for select to authenticated
  using (v2.sheet_visible(sheet_id));
-- 아이가 고칠 수 있는 것은 **「다 했어요」 하나뿐**
create policy child_done on v2.day_item for update to authenticated
  using (v2.sheet_visible(sheet_id) and slot in ('home','next'))
  with check (v2.sheet_visible(sheet_id) and status = 'done');

-- ── 루틴·목록은 보여도 된다 (이름뿐) ────────────────────────
create policy read_items on v2.learn_items  for select to authenticated using (state='active');
create policy read_ar    on v2.area_routine for select to authenticated using (true);
create policy own_sr     on v2.student_routine for select to authenticated
  using (student_id in (select v2.my_students()));
create policy read_mt    on v2.material_type for select to authenticated using (state='active');

-- ── 단원평가·성적 ───────────────────────────────────────────
create policy own_ut on v2.unit_test for select to authenticated
  using (student_id in (select v2.my_students()));
create policy own_score on v2.score for select to authenticated
  using (student_id in (select v2.my_students())
     and (show_to = 'both'
       or (show_to='student' and exists (select 1 from v2.students s
             where s.id=score.student_id and s.profile_id=auth.uid()))
       or (show_to='parent'  and exists (select 1 from v2.parent_student ps
             where ps.student_id=score.student_id and ps.parent_profile_id=auth.uid()))));
-- 아이가 자기 성적을 넣는다. ⚠️ **원장님이 넣은 것은 못 고친다**(옛 앱 source='form' 과 같은 뜻)
create policy child_score_insert on v2.score for insert to authenticated
  with check (exists (select 1 from v2.students s where s.id=student_id and s.profile_id=auth.uid())
              and by_who='student' and confirmed=false);
create policy child_score_update on v2.score for update to authenticated
  using (by_who='student' and not confirmed
         and exists (select 1 from v2.students s where s.id=student_id and s.profile_id=auth.uid()))
  with check (by_who='student' and not confirmed);
create policy own_wrong on v2.score_wrong for select to authenticated
  using (exists (select 1 from v2.score sc where sc.id=score_id
                   and sc.student_id in (select v2.my_students())));

-- ── 공지·알림 ───────────────────────────────────────────────
create policy read_notice on v2.notice for select to authenticated
  using (sent_at is not null
     and (to_role='both'
       or (to_role='student' and exists (select 1 from v2.profiles p where p.id=auth.uid() and p.role='student'))
       or (to_role='parent'  and exists (select 1 from v2.profiles p where p.id=auth.uid() and p.role='parent'))));
create policy own_read on v2.notice_read for select to authenticated using (profile_id=auth.uid());
-- ⚠️ 읽음은 **서버가 찍는다.** 아이가 못 넣는다 — insert 정책 없음
create policy own_push on v2.push_sub for all to authenticated
  using (profile_id=auth.uid()) with check (profile_id=auth.uid());

-- ── 내신 자료 — 「받을 학습지」 ──────────────────────────────
create policy own_give on v2.material_give for select to authenticated
  using (student_id in (select v2.my_students()));
create policy child_got on v2.material_give for update to authenticated
  using (student_id in (select v2.my_students()))
  with check (student_id in (select v2.my_students()));
create policy read_material on v2.material for select to authenticated
  using (exists (select 1 from v2.material_give g
                 where g.material_id=material.id and g.student_id in (select v2.my_students())));

-- ── 자료함 ──────────────────────────────────────────────────
-- ⚠️ **받은 것은 원장님만.** 아이가 올린 것을 다른 아이가 못 본다
create policy own_file on v2.file for select to authenticated
  using (by_profile = auth.uid()
      or exists (select 1 from v2.file_link l where l.file_id=file.id
                   and (l.day_item_id is not null and v2.sheet_visible(
                          (select sheet_id from v2.day_item di where di.id=l.day_item_id))
                     or l.notice_id is not null)));
create policy child_upload on v2.file for insert to authenticated
  with check (by_profile = auth.uid());
create policy own_link on v2.file_link for select to authenticated
  using (exists (select 1 from v2.file f where f.id=file_id and f.by_profile=auth.uid())
      or notice_id is not null
      or (day_item_id is not null and v2.sheet_visible(
            (select sheet_id from v2.day_item di where di.id=day_item_id))));
create policy child_seen on v2.file_link for update to authenticated
  using (day_item_id is not null and v2.sheet_visible(
           (select sheet_id from v2.day_item di where di.id=day_item_id)))
  with check (true);

-- ── 영상 ────────────────────────────────────────────────────
create policy read_video on v2.video for select to authenticated using (state='active');
create policy own_view on v2.video_view for all to authenticated
  using (student_id in (select v2.my_students())) with check (student_id in (select v2.my_students()));

-- ── ⚠️ 정책을 **일부러 안 만드는** 것 — 원장만 보는 자리 ──────
--   consult(상담) · payment · fee_rule · todo · inquiry ·
--   notify_log · job_queue · auto_* · prep_scope · material_item ·
--   holiday · makeup · msg_template · file_bin
--   → 위 staff_all 뿐이라 아이·부모에게 **0줄**이다
