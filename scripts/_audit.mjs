import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:30000, query_timeout:60000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const old=(await c.query(`select t.tablename, s.n_live_tup::int rows,
   (select count(*)::int from information_schema.columns c where c.table_schema='public' and c.table_name=t.tablename) cols
   from pg_tables t left join pg_stat_user_tables s on s.relname=t.tablename and s.schemaname='public'
   where t.schemaname='public' order by s.n_live_tup desc nulls last`)).rows;
const v2=new Set((await c.query(`select tablename from pg_tables where schemaname='v2'`)).rows.map(r=>r.tablename));
// 옛 표 → v2 어디로 갔나 (내가 아는 대로 적는다. 모르면 「?」)
const MAP={
 daily_reports:"day_sheet", daily_report_items:"day_item", student_unit_progress:"progress",
 textbooks:"books", textbook_units:"units", student_textbooks:"student_book",
 students:"students", profiles:"profiles", parent_student:"parent_student",
 classes:"classes", class_students:"class_member", class_sessions:"class_schedule",
 attendance:"day_sheet.attend", report_sends:"notify_log", push_subscriptions:"push_sub",
 push_receipts:"notify_log", push_prefs:"push_sub", scores:"score", score_items:"score",
 score_wrongs:"score_wrong", payments:"payment", schools:"schools", exam_periods:"exams",
 homework_items:"learn_items", learning_items:"learn_items", routine_steps:"area_routine",
 todo_routines:"auto_rule", tasks:"todo", notices:"notice", notice_receipts:"notice_read",
 inquiries:"inquiry", student_notes:"consult", videos:"video", video_views:"video_view",
 video_assignments:"video_view", video_folders:"video.folder", holidays:"holiday",
 message_templates:"msg_template", integrations:"?설정", word_test_settings:"word_test",
 unit_exams:"unit_test", stay_tasks:"late_stay", prep_materials:"material",
 prep_material_types:"material_type", prep_scopes:"prep_scope", prep_assignments:"material_give",
 prep_receipts:"material_give", prep_exams:"exams", exam_questions:"score_wrong",
 exam_spec_rows:"?", exam_skips:"?", monthly_reports:"?월간", month_confirms:"?달확정",
 study_breaks:"?", study_sessions:"?", learned_notes:"?", class_progress:"progress",
 class_guides:"?", class_textbooks:"student_book", daily_assignments:"day_item",
 homework_submissions:"?제출", answer_files:"file", app_assets:"?", calendar_tokens:"?",
 screen_layouts:"?화면", screen_notes:"?화면", comment_samples:"?문구", report_comments:"?",
 report_keywords:"?", report_reads:"notice_read", requests:"?요청", warning_actions:"?",
 arrival_checks:"?등원", classcard_day:"?클카", classcard_planner:"?클카",
 classcard_shadow:"?클카", classcard_students:"?클카", neis_schools:"schools",
 student_activity:"?", student_curriculum:"student_routine", student_electives:"?",
 student_extra_absences:"?", student_extra_schedules:"?", student_link_codes:"?계정",
 submission_link_backup:"—백업", daily_report_items_dup_backup:"—백업",
 academy_net:"?설정", panel_suggestions:"?", tests:"?", todo_categories:"todo.kind",
 unit_sections:"units", schedule:"?"
};
const 없음=[], 물음=[], 있음=[];
for (const t of old) {
  const m=MAP[t.tablename];
  if (!m) 없음.push(t);
  else if (m.startsWith("?")) 물음.push({...t, m});
  else if (m.startsWith("—")) {}
  else 있음.push({...t, m});
}
console.log(`■ 옛 표 ${old.length}개`);
console.log(`   ✅ v2 에 자리가 있다   ${있음.length}`);
console.log(`   ❓ 자리가 애매하다     ${물음.length}`);
console.log(`   ⚠️ 내가 안 적었다     ${없음.length}\n`);
console.log("■ ❓ 자리가 애매한 것 — **줄이 있는 것만** (빈 표는 안 만들면 그만)");
물음.filter(t=>t.rows>0).sort((a,b)=>b.rows-a.rows)
  .forEach(t=>console.log(`   ${t.tablename.padEnd(24)} ${String(t.rows).padStart(5)}줄 · 칸 ${t.cols}  → ${t.m}`));
console.log("\n■ ⚠️ 내가 안 적은 표 — 줄이 있는 것");
없음.filter(t=>t.rows>0).forEach(t=>console.log(`   ${t.tablename.padEnd(24)} ${String(t.rows).padStart(5)}줄 · 칸 ${t.cols}`));
await c.end();
