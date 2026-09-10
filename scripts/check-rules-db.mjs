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
// 표-6 고르는 값은 DB 에도 건다(check) — 아직 안 건 것 15 는 래칫(값 목록이 코드에 없는 것)
const UNCHECKED = new Set(["auto_rule.kind", "book_alias.source", "books.level", "consult.way", "day_ran.kind", "exam_question.kind", "item_alias.source", "material_type.source", "msg_template.kind", "parent_student.rel", "progress_edit.scope", "quiz.way", "score_wrong.kind", "student_alias.source", "warning_action.kind"]);   // 0131 이 열한 칸을 걸었다(새 줄부터) — 남은 15 는 값 목록이 코드에 없거나 자유 글(rel·way·source)
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
// 표-5 같은 사실은 같은 단위 — 이름이 말하는 단위와 칸의 자료형이 맞나(_at = 때 · _on/_date = 날 · _time = 시각 · seconds/bytes = 정수). 예외 셋은 이름이 그런 것(until_at 은 귀가 예정 시각 · count_at·warn_report_at 은 「N회째」)
const unitBad = await col(`select c.table_name||'.'||c.column_name||':'||c.data_type from information_schema.columns c where c.table_schema='v2' and (
   (c.column_name ~ '_at$' and c.data_type <> 'timestamp with time zone' and c.column_name not in ('until_at','count_at','warn_report_at'))
   or (c.column_name ~ '_(on|date)$' and c.data_type <> 'date')
   or (c.column_name ~ '_time$' and c.data_type <> 'time without time zone')
   or (c.column_name in ('seconds','bytes') and c.data_type not in ('integer','bigint'))) order by 1`);
ok("표-5 같은 사실 같은 단위 — _at 은 때(timestamptz) · _on·_date 는 날 · _time 은 시각 · seconds·bytes 는 정수(예외 셋은 이름이 그런 것)", unitBad.length === 0, unitBad.join(", "));
// 뼈대-4 자동 판정과 사람의 번복을 남긴다 — 자동 판정이 있는 표마다 「누가·확인」 칸이 짝으로
for (const [t, auto, human] of [["progress", "status", ["last_by", "confirmed"]], ["score", "grade", ["by_who", "confirmed"]], ["progress_flag", "kind", ["seen_by", "outcome"]], ["warning_action", "kind", ["by_who"]]]) {
  const cols = await col(`select column_name from information_schema.columns where table_schema='v2' and table_name='${t}'`);
  ok(`뼈대-4 ${t} — 판정 ${auto} 곁에 사람의 번복 칸 ${human.join("·")}`, cols.includes(auto) && human.every((h) => cols.includes(h)), cols.join(","));
}
// 뼈대-8 치환 자리 설명은 표에 — v2.placeholder 가 있고 설명이 비지 않는다 · 옛 문구의 자리 열셋이 다 있다
const ph = await col(`select key from v2.placeholder where note <> '' order by sort`);
ok(`뼈대-8 치환 자리 설명 표 — ${ph.length}줄(학생명·학원명·날짜·시간·내용·교재목록·구매링크·테스트결과·다음달수업일·학원주소·주소·전화·변수)`, ["학생명", "학원명", "다음달수업일", "교재목록"].every((k) => ph.includes(k)) && ph.length >= 13, ph.join(","));
// 처음-8 교과서는 학교의 속성 — 학교 × 학년 × 연도 × 교재 한 줄, 유니크
const sbu = await col(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='v2.school_book'::regclass and contype='u'`);
ok("처음-8 school_book — (school_id, grade, year, book_id) 유니크 · 학교·교재는 외래키", sbu.some((d) => /school_id, grade, year, book_id/.test(d)) && (await col(`select count(*) from pg_constraint where conrelid='v2.school_book'::regclass and contype='f'`))[0] === "2", sbu.join(" | "));
// 확정-㊻ 배정 덩어리 열쇠의 갈래 축 — 「안 한 소단원」 차례(todo_units)가 대단원 기준이면 본책 전부 → 워크북 전부로 센다(0103)
const tu = (await col(`select pg_get_functiondef('v2.todo_units(uuid,uuid,date)'::regprocedure)`))[0] ?? "";
ok("확정-㊻ todo_units — 대단원 기준(ob = chapter)이면 is_workbook 을 뒤로(본책 전부 → 워크북 전부) · 소단원 기준은 (대,소)", /ob = 'chapter' and is_workbook then 1 else 0/.test(tu) && /order by ch_sort/.test(tu));
// 0-3 읽은 줄 대조 — 판이 고친 때를 싣는다(셀 cells_at · 학생·문의 updated_at) — 손은 그 값이 그대로일 때만 덮는다(lib/grid·student·inquiry STALE)
for (const [fn, key] of [["v2.grid_board(date)", "cells_at"], ["v2.student_board(uuid,date,date)", "'updated_at', st.updated_at"], ["v2.inquiry_board(date)", "'updated_at', q.updated_at"]]) {
  const body = (await col(`select pg_get_functiondef('${fn}'::regprocedure)`))[0] ?? "";
  ok(`0-3 ${fn} 이 고친 때(${key})를 싣는다`, body.includes(key));
}
// 표-6 새로 건 것 11(0131 · NOT VALID — 새 줄부터) — 코드의 값 목록과 같다
const chk = await col(`select conname from pg_constraint where connamespace='v2'::regnamespace and conname like '%_choice'`);
ok(`표-6 0131 이 건 고르는 값 check ${chk.length} ≥ 11(notify_log kind·sink · job_queue · scheduled_send · todo · inquiry.way · payment.source · 영역 넷)`, chk.length >= 11, chk.join(","));
// (커) 갈래 열이 세 곳에서 같은가 — lib/notify-plan LABEL · notify_log_kind_choice · scheduled_send_kind_choice.
// 2026-09-10 사고: LABEL 에 guide 를 더하고 예약 제약만 고쳐, 문자를 보내려다 「자취를 못 남김 … notify_log_kind_choice」로 막혔다(게이트 97 이 잡음)
const { LABEL } = await import("../lib/notify-plan.js");
const kinds = Object.keys(LABEL).sort().join(",");
const defOf = async (name) => (await col(`select pg_get_constraintdef(oid) from pg_constraint where conname='${name}'`))[0] ?? "";
const inDef = (d) => [...String(d).matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort().join(",");
const logDef = await defOf("notify_log_kind_choice"), schDef = await defOf("scheduled_send_kind_choice");
ok(`갈래 열이 셋 다 같다 — LABEL ${Object.keys(LABEL).length}개 = notify_log · scheduled_send 의 check((커) 확정-71: 하나만 고치면 보내다 막힌다)`, inDef(logDef) === kinds && inDef(schDef) === kinds, `LABEL ${kinds}\n     notify_log ${inDef(logDef)}\n     scheduled_send ${inDef(schDef)}`);
console.log(`\n■ 표·뼈대 규칙 DB 검사 ${n}건 · 실패 ${bad}`);
await c.end(); process.exit(bad ? 1 : 0);
