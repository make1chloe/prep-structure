/** 표·뼈대 규칙의 DB 검사(끝의 정의 「지킴: —」 0) — 규칙.md 의 표-1·2·4·6·7 · 원칙-5 · 0-3(도장) · 처음-5 · 뼈대-2·3·7 · 검사-⑫ 를 실제 스키마에서 잰다.
 *  래칫(ratchet): 지금 있는 어긋남은 이름을 적어 두고(까닭과 함께), **새로** 생기는 것만 빨갛다 — 목록에서 하나 빼면 초록이 한 줄 는다 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const col = async (sql) => (await c.query(sql)).rows.map((r) => Object.values(r)[0]);
const fresh = (rows, allow) => rows.filter((r) => !allow.has(r));
console.log("■ 표 규칙(DB)");
// 표-1 번호를 가리키는 칸은 전부 외래키 — 아닌 것은 까닭이 있는 여덟뿐
const NO_FK = new Set(["audit.row_id", "cc_student.cc_login_id", "excel_row.row_id", "import_map.new_id", "import_map.old_id", "import_skip.old_id", "notify_log.job_id", "profiles.login_id"]);   // 어느 표든(audit) · 바깥 아이디(클카·로그인) · 엑셀 줄 번호 · 옛 앱 id(이관) · 큐 줄은 정리될 수 있다
const noFk = await col(`select c.table_name||'.'||c.column_name from information_schema.columns c where c.table_schema='v2' and c.column_name like '%\\_id' and c.column_name<>'id'
  and not exists (select 1 from information_schema.key_column_usage k join information_schema.table_constraints t on t.constraint_name=k.constraint_name and t.constraint_type='FOREIGN KEY' where k.table_schema='v2' and k.table_name=c.table_name and k.column_name=c.column_name) order by 1`);
ok(`표-1 번호를 가리키는 칸은 외래키 — 아닌 것은 까닭 있는 ${NO_FK.size}뿐(어느 표든 · 바깥 아이디 · 엑셀 줄 · 이관 옛 id · 큐)`, fresh(noFk, NO_FK).length === 0, "새로 생긴 것: " + fresh(noFk, NO_FK).join(", "));
// 표-2 순번을 열쇠로 쓰지 않는다
const seqKey = await col(`select tc.table_name from information_schema.table_constraints tc join information_schema.key_column_usage k on k.constraint_name=tc.constraint_name where tc.table_schema='v2' and tc.constraint_type in ('UNIQUE','PRIMARY KEY') group by tc.constraint_name, tc.table_name having bool_or(k.column_name in ('sort','seq','position','no','ord','idx'))`);
ok("표-2 순번(sort·seq·no)이 든 열쇠·유니크가 없다", seqKey.length === 0, seqKey.join(", "));
// 표-4 = 원칙-5 세어 나오는 값은 칸으로 안 만든다 — 이름이 그렇게 생긴 칸은 전부 「넣는 값」(전체 개수 · 통과선 · 문항 수 · 갯수 설정 · 열어 본 횟수)
const COUNT_COLS = new Set(["notice_read.open_count", "notify_log.open_count", "quiz.cut_pct", "quiz.total", "quiz_style.cut_pct", "student_book.unit_test_n", "student_routine.count_n", "unit_test.q_count", "units.q_count"]);
const cnt = await col(`select table_name||'.'||column_name from information_schema.columns where table_schema='v2' and (column_name ~ '(pct|_rate|_count|_sum|_avg|^total|_total|_n)$' or column_name in ('total','count','pct','rate')) order by 1`);
ok(`표-4·원칙-5 세어 나오는 이름의 칸은 넣는 값 ${COUNT_COLS.size}뿐(전체 개수 · 통과선 · 문항 수 · 갯수 · 열어 본 횟수) — %·합계·평균 칸이 새로 없다`, fresh(cnt, COUNT_COLS).length === 0, "새로 생긴 것: " + fresh(cnt, COUNT_COLS).join(", "));
// 표-6 고르는 값은 DB 에도 건다(check) — 아직 안 건 것 26 은 래칫(0129 에서 걸 것 — 지금까지.md 남긴 것)
const UNCHECKED = new Set(["area_routine.area", "auto_rule.kind", "book_alias.source", "books.area", "books.level", "consult.way", "day_area_memo.area", "day_ran.kind", "exam_question.kind", "inquiry.way", "item_alias.source", "job_queue.kind", "material_type.source", "msg_template.kind", "notify_log.kind", "notify_log.sink", "parent_student.rel", "payment.source", "progress_edit.scope", "quiz.way", "scheduled_send.kind", "score_wrong.kind", "student_alias.source", "student_routine.area", "todo.kind", "warning_action.kind"]);
const unchecked = await col(`select c.table_name||'.'||c.column_name from information_schema.columns c where c.table_schema='v2' and c.column_name in ('state','kind','slot','stage','role','status','how','scope','place','source','way','level','area','mode','sink','to_role','rel','attend','result') and c.data_type in ('text','character varying')
  and not exists (select 1 from information_schema.constraint_column_usage u join information_schema.table_constraints t on t.constraint_name=u.constraint_name and t.constraint_type='CHECK' where u.table_schema='v2' and u.table_name=c.table_name and u.column_name=c.column_name) order by 1`);
ok(`표-6 고르는 값 칸에 check 가 있다 — 아직 없는 ${UNCHECKED.size}은 래칫(새로 만드는 표는 걸어야 한다)`, fresh(unchecked, UNCHECKED).length === 0, "새로 생긴 것: " + fresh(unchecked, UNCHECKED).join(", "));
// 표-7 날짜 기본값은 학원의 오늘 하나
const dateDef = await col(`select table_name||'.'||column_name||' = '||column_default from information_schema.columns where table_schema='v2' and data_type='date' and column_default is not null and column_default !~ 'v2\\.today\\(\\)'`);
ok("표-7 날짜 칸 기본값은 v2.today() 뿐(current_date · now() 없음)", dateDef.length === 0, dateDef.join(", "));
// 0-3 고친 시각 도장 — updated_at 이 있으면 touch 트리거(check-schema ① 의 반대쪽). 없는 여덟은 손이 직접 적는다(래칫)
const NO_TOUCH = new Set(["app_asset", "cc_student", "day_area_memo", "integration", "role_access", "rule", "screen_pref", "video_view"]);
const noTouch = await col(`select c.table_name from information_schema.columns c where c.table_schema='v2' and c.column_name='updated_at' and not exists (select 1 from pg_trigger g join pg_class r on r.oid=g.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='v2' and r.relname=c.table_name and g.tgname like '%\\_touch' and not g.tgisinternal) order by 1`);
ok(`0-3 updated_at 이 있는 표는 touch 트리거로 도장 — 없는 ${NO_TOUCH.size}은 손이 직접 적는다(래칫)`, fresh(noTouch, NO_TOUCH).length === 0, "새로 생긴 것: " + fresh(noTouch, NO_TOUCH).join(", "));
console.log("■ 뼈대·처음 규칙(DB)");
// 처음-5 소속에 기간 — 반 명단 · 시간표 · 교재 배정 · 단가 줄에 from_date·to_date
for (const t of ["class_member", "class_schedule", "student_book", "fee_rule"]) {
  const cols = await col(`select column_name from information_schema.columns where table_schema='v2' and table_name='${t}' and column_name in ('from_date','to_date')`);
  ok(`처음-5 ${t} 에 from_date·to_date`, cols.length === 2, cols.join(","));
}
// 뼈대-2·검사-⑫ 자동 생성 열쇠는 칸으로 — 규칙·학생·교재·단원·회독·몇번째·기준 날짜
const ak = (await c.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='v2.auto_key'::regclass and contype='u'`)).rows[0]?.d ?? "";
ok("뼈대-2·검사-⑫ auto_key 유니크 = (rule_id, student_id, book_id, unit_id, round, nth, base_date) — 기준 날짜가 든다", /\(rule_id, student_id, book_id, unit_id, round, nth, base_date\)/.test(ak), ak);
// 뼈대-3 자동으로 생긴 줄은 왜 생겼는지를 가리킨다
for (const [t, cols] of [["todo", ["rule_id", "why"]], ["notify_log", ["job_id", "why"]], ["auto_key", ["rule_id"]], ["scheduled_send", ["sheet_id", "late_id", "created_by"]]]) {
  const has = await col(`select column_name from information_schema.columns where table_schema='v2' and table_name='${t}' and column_name = any($1)`.replace("$1", `array['${cols.join("','")}']`));
  ok(`뼈대-3 ${t} 에 출처 칸 ${cols.join("·")}`, has.length === cols.length, has.join(","));
}
// 뼈대-7 바깥에서 받아온 것의 중복 방지 — 출처 열쇠 유니크(exams source·source_key) · 살아 있는 줄만 거는 부분 유니크(늦귀가 예정 · 보강 · 예약 발송)
const exU = await col(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='v2.exams'::regclass and contype='u'`);
ok("뼈대-7 exams 는 (source, source_key) 유니크 — 나이스가 같은 시험을 두 번 주면 한 줄", exU.some((d) => /\(source, source_key\)/.test(d)), exU.join(" | "));
const partial = await col(`select indexrelid::regclass::text from pg_index i join pg_class r on r.oid=i.indrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='v2' and i.indisunique and i.indpred is not null`);
for (const need of ["v2.late_plan_one_live", "v2.makeup_one_per_absence", "v2.scheduled_send_one_daily_idx", "v2.scheduled_send_one_late_idx"]) ok(`뼈대-7 부분 유니크 ${need}(살아 있는 줄만)`, partial.includes(need));
console.log(`\n■ 표·뼈대 규칙 DB 검사 ${n}건 · 실패 ${bad}`);
await c.end(); process.exit(bad ? 1 : 0);
