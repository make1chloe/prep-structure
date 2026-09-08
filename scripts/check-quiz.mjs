/** 시험 검사 — 판정과 리포트 문이 SQL 한 곳에서 맞게 도나(0038~0041, 원장님 9/2) · lib 이 그 판정을 다시 만들지 않나.
 *  진짜 DB(눌러보기 또는 실제)로 트랜잭션 안에서 쓰고 되돌린다. 리허설 학생(fixture)으로만 쓴다(대전제-12). */
import { parseStyle, scopeLabel, scopeText, S_WAY, QUIZ_POS, quizPosOf, quizPosEnd, quizPosName, quizTag } from "../lib/quiz-plan.js";
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
console.log("■ 판정은 SQL 한 곳 — lib 이 통과선을 다시 세지 않는다");
for (const f of ["lib/quiz.js", "lib/quiz-plan.js", "app/today/row.js"]) { const s = strip(readFileSync(f, "utf8")); ok(`${f} 에 「>= cut」 같은 판정이 없다`, !/(>=|<)\s*(q\.)?cut_pct|cut_pct\s*(<=|>)/.test(s) && !/\* 100\s*>=/.test(s)); }
const S = "00000000-0000-4000-9000-000000000001";   // 0004 fixture 학생
const STAFF = "00000000-0000-4000-8000-000000000001";   // 0004 fixture 원장 — routine_board 는 학원 사람만
const st = (await c.query(`select id from v2.students where id=$1 and import_batch='fixture'`, [S])).rows[0];
if (!st) { console.log("   ⏭ 검사용 학생이 없다(0004_fixture)"); process.exit(1); }
await c.query("begin");
try {
  const sh0 = (await c.query(`insert into v2.day_sheet(student_id, date) values ($1, '2026-10-19') returning id`, [S])).rows[0].id;   // 낸 날
  const sh = (await c.query(`insert into v2.day_sheet(student_id, date) values ($1, '2026-10-20') returning id`, [S])).rows[0].id;    // 본 날
  const style = (await c.query(`select * from v2.style_for($1, null, 1::smallint, 'word')`, [S])).rows[0];
  console.log("■ 통과선·방식은 한 곳(style_for: 아이 → 교재 → 학원 기본값)");
  ok("학원 기본값 1회독 단어 = 통과 90 · 객뜻 50/주뜻 50", style?.cut_pct === 90 && style.mc_meaning === 50 && style.sa_meaning === 50);
  ok("2회독은 더 어렵다(주관식 100)", (await c.query(`select sa_meaning from v2.style_for($1, null, 2::smallint, 'word')`, [S])).rows[0]?.sa_meaning === 100);
  await c.query(`insert into v2.quiz_style(student_id, book_id, round, kind, mc_meaning, sa_meaning, cut_pct) values ($1, null, 1, 'word', 30, 70, 80)`, [S]);
  ok("아이 것이 있으면 아이 것(통과 80)", (await c.query(`select cut_pct from v2.style_for($1, null, 1::smallint, 'word')`, [S])).rows[0]?.cut_pct === 80);
  console.log("■ 틀린 개수만 적는다 — 맞은 개수·%·통과는 세어 나온다(0039)");
  const q = (await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_sheet_id, assigned_on, total, cut_pct, state) values ($1, 'word', 'manual', '검사용 범위', $2, '2026-10-19', 20, 90, 'planned') returning id`, [S, sh0])).rows[0].id;
  const read = async () => (await c.query(`select v2.passed(q) passed, v2.pct(q) pct, v2.quiz_correct(q.id) correct from v2.quiz q where id=$1`, [q])).rows[0];
  ok("틀린 개수를 안 적으면 판정도 없다(「안 봤다」≠「0점」)", (await read()).passed === null);
  await c.query(`update v2.quiz set wrong=2, taken_sheet_id=$2, taken_on='2026-10-20' where id=$1`, [q, sh]);
  let r = await read(); ok("2개 틀림 → 맞은 18 · 90% · 통과(경계값은 통과)", r.correct === 18 && Number(r.pct) === 90 && r.passed === true);
  await c.query(`update v2.quiz set wrong=3, state='failed' where id=$1`, [q]);
  r = await read(); ok("3개 틀림 → 85% · 못 넘음", Number(r.pct) === 85 && r.passed === false);
  console.log("■ 리포트 문 — 값이 없으면 안 나간다(원장님 9/2)");
  const q2 = (await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_sheet_id, assigned_on, cut_pct, state) values ($1, 'sentence', 'manual', '공영2 2과 본문', $2, '2026-10-20', 90, 'planned') returning id`, [S, sh])).rows[0].id;
  ok("다음 시간 — 전체 개수를 안 적은 시험은 리포트에 안 선다", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='다음 시간'`, [sh])).rows[0].n === 0);
  await c.query(`update v2.quiz set total=14 where id=$1`, [q2]);
  ok("전체 개수를 적으면 선다", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='다음 시간'`, [sh])).rows[0].n === 1);
  ok("오늘 본 것 — 틀린 개수를 적은 것만 나간다(1건)", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='오늘 본 것'`, [sh])).rows[0].n === 1);
  ok("미통과가 늦귀가 사유 후보로 세어 나온다(quiz_failed_today 1건 · 85%)", (await c.query(`select count(*)::int n, min(pct) pct from v2.quiz_failed_today($1)`, [sh])).rows[0].n === 1);
  console.log("■ 교재멈춤이면 시험도 못 낸다(0037 · quiz_guard) — 내신·직접 범위는 별개");
  const bk = (await c.query(`insert into v2.books(name, area, import_batch) values ('zz_검사 단어책', '단어', 'fixture') returning id`)).rows[0].id;
  await c.query(`insert into v2.student_book(student_id, book_id, from_date, stop_mode) values ($1, $2, '2026-01-01', 'book_off')`, [S, bk]);
  let blocked = false; try { await c.query("savepoint g"); await c.query(`insert into v2.quiz(student_id, kind, source, book_id, assigned_on, state) values ($1, 'word', 'book', $2, '2026-10-20', 'planned')`, [S, bk]); await c.query("release savepoint g"); } catch (e) { blocked = /교재멈춤/.test(e.message); await c.query("rollback to savepoint g"); }
  ok("교재멈춤 교재로 낸 시험은 DB 가 막는다", blocked);
  let free = true; try { await c.query("savepoint h"); await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_on, state) values ($1, 'word', 'manual', '직접 범위', '2026-10-20', 'planned')`, [S]); await c.query("release savepoint h"); } catch (e) { free = false; await c.query("rollback to savepoint h"); }
  ok("직접 범위는 멈춤과 상관없다", free);
  console.log("■ 🔤 시험 카드 자리는 아이마다(0143 students.quiz_pos · (가)-①) — 기본 시작하자마자 · 루틴 11 판(routine_board)이 읽는다 · 셋째 값은 DB 가 막는다(표-6)");
  ok("새 칸의 기본값은 start(시작하자마자) — 옛 줄도 그대로 맨 위", (await c.query(`select quiz_pos from v2.students where id=$1`, [S])).rows[0]?.quiz_pos === "start");
  await c.query(`update v2.students set quiz_pos='end', state='active' where id=$1`, [S]);
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: STAFF, role: "authenticated" })]);
  const rb = (await c.query(`select v2.routine_board($1, '2026-10-20') b`, [S])).rows[0]?.b, meRow = (rb?.students ?? []).find((s) => s.id === S);
  ok("루틴 11 판 students 에 quiz_pos 한 칸(end) — 화면은 이것으로 세그를 그린다", meRow?.quiz_pos === "end", JSON.stringify(meRow ?? (rb?.students ?? []).slice(0, 2)));
  let third = false; try { await c.query("savepoint qa"); await c.query(`update v2.students set quiz_pos='middle' where id=$1`, [S]); await c.query("release savepoint qa"); } catch (e) { third = /students_quiz_pos_choice/.test(e.message); await c.query("rollback to savepoint qa"); }
  ok("start·end 말고는 DB 가 막는다(students_quiz_pos_choice)", third);
} finally { await c.query("rollback"); await c.end(); }
// ── 순수(5단계-③) — 방식 읽기 · 내신 범위 글
ok("방식 읽기 — 단어는 네 비율 합 100(아니면 던진다) · 첫글자 힌트 · 몇 단원씩 · 통과선 0~100 · 문장은 받아쓰기·녹음 둘 중 하나(0041 — 구두는 걷혔다)", JSON.stringify(parseStyle("word", { mc_meaning: "60", sa_meaning: "40", first_hint: "on", cut_pct: "85" })) === JSON.stringify({ mc_meaning: 60, sa_meaning: 40, mc_word: 0, sa_word: 0, first_hint: true, units_per: null, s_way: null, cut_pct: 85 }) && (() => { try { parseStyle("word", { mc_meaning: "80", sa_meaning: "30" }); return false; } catch { return true; } })() && (() => { try { parseStyle("word", { mc_meaning: "100", cut_pct: "101" }); return false; } catch { return true; } })() && parseStyle("sentence", { s_way: "dictation" }).s_way === "dictation" && (() => { try { parseStyle("sentence", { s_way: "oral" }); return false; } catch { return true; } })() && S_WAY.length === 2);
ok("내신 범위 글 — 「2학기 중간 내신 범위 — 교재 · CH5 › 5-2」 · 직접 적은 것 · 시험 줄에서도 같은 글(scopeText prep)", scopeLabel({ books: { name: "공영2 능률" }, units: { chapter: "CH2", short: "2과 본문" } }, "2학기 중간") === "2학기 중간 내신 범위 — 공영2 능률 · CH2 › 2과 본문" && scopeLabel({ free_note: "2409 학평 22-24번" }) === "내신 범위 — 2409 학평 22-24번" && scopeText({ source: "prep", prep_scope: { free_note: "22-24번", exams: { name: "중간" } } }) === "중간 내신 범위 — 22-24번");
// ── 순수((가)-①) — 카드 자리
ok("카드 자리 둘(시작하자마자 · 다 끝내고) — 모르는 값·빈 값은 시작하자마자 · 「다 끝내고」인 아이만 아래 · 이름은 01 제목·11 세그가 같은 글(0143)", QUIZ_POS.length === 2 && quizPosOf({ quiz_pos: "end" }) === "end" && quizPosOf({ quiz_pos: "middle" }) === "start" && quizPosOf(null) === "start" && quizPosEnd({ quiz_pos: "end" }) && !quizPosEnd({}) && quizPosName("end") === "다 끝내고" && quizPosName("start") === "시작하자마자" && quizPosName(undefined) === "시작하자마자");
ok("자리 판단은 quiz-plan 한 곳 — 오늘 01 줄·루틴 11 화면에 「quiz_pos === 'end'」 같은 견주기가 없다 · 오늘 조회(반 lib/day · 보강 lib/plan)가 quiz_pos 을 읽는다", ["app/today/row.js", "app/settings/routine/board.js"].every((f) => !/quiz_pos\s*[!=]==?\s*["']/.test(strip(readFileSync(f, "utf8")))) && ["lib/day.js", "lib/plan.js"].every((f) => /students!inner\([^)]*quiz_pos/.test(readFileSync(f, "utf8"))));
ok("아이 화면 꼬리표((가)-⑨) — 건너뛴 재시험 「오늘 건너뜀」 · 재시험 「재시험」 · 보통 시험은 없음", quizTag({ state: "skipped", retry_of: "x" }) === "오늘 건너뜀" && quizTag({ state: "planned", retry_of: "x" }) === "재시험" && quizTag({ state: "planned" }) === null && quizTag(null) === null);
console.log(`\n■ 시험 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
