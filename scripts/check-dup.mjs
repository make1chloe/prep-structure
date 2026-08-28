/**
 * **같은 것을 두 벌로 적어두지 않았나** — 전수검사 (원장님, 2026-08-09 —
 * 「하나의 속성으로 작성할 수 있는 걸 여러 군데서 중복으로 작성하거나
 * 불러오거나 하는 경우가 또 있는지 코드 전수검사하고 확인해봐」).
 *
 * ── 왜 이게 늘 사고가 되나 ────────────────────────────
 *
 * 두 벌이 되는 순간 **언젠가 한쪽만 고친다.** 그리고 그날부터 두 화면이
 * 서로 다른 말을 하는데, **오류는 안 난다.** 실제로 겪은 것들 —
 *
 *   학교 견주기   세 벌이 서로 다른 답 → 아이가 시험기간에서 통째로 빠짐
 *   유입경로 목록 두 벌            → 설문지가 적어준 글이 수정창에서 지워짐
 *   권한 판단     열두 벌 · 여섯 가지 → 조교가 되는 자리·안 되는 자리가 뒤섞임
 *   SQL 오류 판단 서른한 벌 · 다섯 가지 → 어떤 화면은 안내 대신 날 오류를 보여줌
 *
 * 그래서 사람 눈으로 훑지 않고 여기서 기계로 훑는다.
 *
 * 쓰는 법:  node scripts/check-dup.mjs
 */
import { readdirSync, statSync, readFileSync } from "node:fs";

let bad = 0;
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const ok = (m) => console.log(`  ${m}`);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = `${d}/${f}`;
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git/.test(f)) walk(p); }
    else if (/\.jsx?$/.test(f)) files.push(p);
  }
})("app");
for (const d of ["lib", "components"]) {
  for (const f of readdirSync(d)) if (/\.jsx?$/.test(f)) files.push(`${d}/${f}`);
}
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/**
 * **뜻이 하나뿐인 이름들.** 이 이름의 함수가 두 군데 이상에 「직접 적혀」
 * 있으면 안 된다 — 불러 쓰는 것은 얼마든지 좋다.
 *
 * 새로 모은 규칙이 생기면 여기 한 줄 늘린다.
 */
const ONE_PLACE = [
  ["requireStaff", "lib/guard.js", "누가 이 일을 해도 되나"],
  ["requireTeacher", "lib/guard.js", "조교는 못 하는 일"],
  ["requirePrincipal", "lib/guard.js", "원장님만 하는 일"],
  ["schoolKey", "lib/schoolName.js", "학교 이름 견주기"],
  ["classifyExam", "lib/examKind.js", "시험 이름의 갈래 (내신·모의·수능·수행)"],
  ["sameSchool", "lib/who.js", "같은 학교인가"],
  ["takesExam", "lib/who.js", "이 아이가 이 시험을 보는가"],
  ["needSql", "lib/sqlError.js", "SQL 을 아직 안 돌리셨다"],
  ["noTable", "lib/sqlError.js", "표가 없다"],
  ["noColumn", "lib/sqlError.js", "칸이 없다"],
  ["cleanClassName", "lib/classLabel.js", "반 이름 속 시간 걷어내기"],
  ["planAssign", "lib/bookAssign.js", "교재 배정을 넣고 빼는 규칙 (학생 쪽 · 교재 쪽 공통)"],
  ["absenceLabel", "lib/absenceLabel.js", "이 결석을 뭐라고 부를까 (지난 것은 「예정」이 아니다)"],
  ["ensureReport", "lib/ensureReport.js", "그 날 리포트 한 줄 확보 (단건 — 벌크는 plan·import 의 upsert)"],
  // SQL 쪽 짝은 public.report_gate(daily_reports) — 뜻이 같아야 한다
  // (report_written or closed_at is not null). 0169 + 원장 확정 2026-08-28.
  ["isClosed", "lib/closeGate.js", "이 판은 마감되었나 (학생·학부모에게 공개해도 되나)"],
  ["maskUnclosed", "lib/closeGate.js", "마감 전 판에서 안 보일 칸 비우기"],
  // SQL 쪽 짝은 public.prep_ready(prep_materials) — 아래 절이 둘을 묶어둔다 (0178)
  ["prepReady", "lib/prepRoutine.js", "자료 준비가 끝났나 (stageOf 한 벌을 쓴다)"],
  ["receivedState", "lib/prepRoutine.js", "이 자료를 받았나 (안 받음 · 줬는데 안 누름 · 받음)"],
];

console.log("== 규칙이 한 곳에만 적혀 있나 ==");
for (const [name, home, what] of ONE_PLACE) {
  const where = files.filter((f) =>
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).test(src.get(f))
    || new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`).test(src.get(f))
  );
  const extra = where.filter((f) => f !== home);
  if (extra.length) say(`${what} (${name}) 가 ${home} 말고도 있습니다 — ${extra.join(" · ")}`);
}
if (!bad) ok(`${ONE_PLACE.length}가지 규칙이 저마다 한 곳에만 있습니다`);

console.log("\n== 같은 목록을 여러 파일에서 따로 적어두지 않았나 ==");
/**
 * 목록이 두 벌이면 한쪽에만 값을 더하게 된다. 유입경로가 그랬다 —
 * 설문지에는 여섯 가지, 상담 화면에는 다른 여섯 가지.
 */
const norm = (s) => s.replace(/\s+/g, " ").trim();
const lists = new Map();
for (const f of files) {
  for (const m of src.get(f).matchAll(/(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*(\[[^\]]{12,400}\])/g)) {
    const key = norm(m[2]);
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(`${f}:${m[1]}`);
  }
}
let dupList = 0;
for (const [body, where] of lists) {
  const filesOf = [...new Set(where.map((x) => x.split(":")[0]))];
  if (filesOf.length > 1) {
    say(`같은 목록이 ${filesOf.length}곳 — ${where.join(" · ")}\n     ${body.slice(0, 60)}…`);
    dupList++;
  }
}
if (!dupList) ok("따로 적어둔 목록 없음");

console.log("\n== 요일 두 종류를 섞어 쓰지 않았나 ==");
/**
 * **일요일 시작**은 `getDay()` 가 돌려주는 숫자의 자리이고, **월요일 시작**은
 * 화면에 늘어놓는 차례다. 섞으면 요일이 하루씩 밀리는데 **오류는 안 나고
 * 화면만 조용히 틀린다.** 그래서 이름을 갈라 두었다 — DOW · WEEK_ORDER.
 */
const day = src.get("lib/day.js");
if (!/export const DOW = \["일"/.test(day)) say("lib/day 의 DOW 가 일요일로 시작하지 않습니다 (getDay 자리)");
if (!/export const WEEK_ORDER = \["월"/.test(day)) say("lib/day 의 WEEK_ORDER 가 월요일로 시작하지 않습니다");
// getDay 로 색인하는데 WEEK_ORDER 를 쓰면 하루가 밀린다
for (const f of files) {
  if (/WEEK_ORDER\s*\[\s*[^\]]*(getDay|getUTCDay)/.test(src.get(f))) {
    say(`${f} — 화면 차례(WEEK_ORDER)를 getDay 자리로 씁니다 (요일이 하루 밀립니다)`);
  }
}
ok("일요일 시작(getDay)과 월요일 시작(화면)이 갈라져 있습니다");

console.log("\n== 권한이 이름대로인가 ==");
/**
 * 예전에는 `requireStaff` 열두 벌 중 넷이 조교를 막고 여덟이 통과시켰다.
 * 이름은 같은데 뜻이 달랐다 — 다음에 화면을 만드는 사람이 아무거나 베껴
 * 오면, 조교에게 열려서는 안 될 자리가 조용히 열린다.
 */
const guard = src.get("lib/guard.js");
if (!/STAFF_ROLES/.test(guard)) say("lib/guard 가 lib/roles 의 역할 목록을 안 씁니다 (또 두 벌이 됩니다)");
if (!/TEACHER_ROLES/.test(guard)) say("조교를 뺀 목록을 lib/guard 가 안 씁니다");
if (!/TEACHER_ROLES = \["principal", "instructor"\]/.test(src.get("lib/roles.js"))) {
  say("조교를 뺀 목록이 lib/roles 에 없습니다");
}
// 서버 액션이 자기 손으로 역할을 견주고 있지 않은지
for (const f of files) {
  if (f === "lib/guard.js" || f === "lib/roles.js") continue;
  if (/\["principal",\s*"instructor"/.test(src.get(f))) {
    say(`${f} — 역할 목록을 직접 적었습니다 (lib/guard 를 쓰세요)`);
  }
}
if (!bad) ok("역할 판단이 lib/guard 한 곳에 있습니다");

console.log("\n== 준비 끝 판정이 SQL 과 화면에서 같은 단계를 보나 ==");
/**
 * 「자료 준비가 끝났나」는 **몸이 둘**이다 —
 *   · SQL 쪽  public.prep_ready(prep_materials)  ← RLS 가 쓴다 (0178)
 *   · 화면 쪽 lib/prepRoutine prepReady()        ← 목록을 그릴 때 쓴다
 *
 * RLS 는 SQL 이라 JS 함수를 못 부르므로 어쩔 수 없이 두 곳에 몸이 있다.
 * 0169 의 report_gate() ↔ lib/closeGate isClosed() 가 같은 모양이다.
 *
 * **문제는 둘이 어긋나도 오류가 안 난다는 것이다.** 화면은 「뜬다」는데
 * REST 는 막거나, 그 반대가 된다. 그래서 여기서 세 쌍을 뽑아 견준다.
 */
const PREP_PAIRS = [
  ["need_make", "made_at"],
  ["need_print", "printed_at"],
  ["need_card", "card_at"],
];
const mig = readdirSync("supabase/migrations").find((f) => /^0178_/.test(f));
if (!mig) {
  say("supabase/migrations 에 0178(내신 자료 수령 체크)이 없습니다");
} else {
  const sql = readFileSync(`supabase/migrations/${mig}`, "utf8");
  const body = sql.split(/create or replace function public\.prep_ready/)[1] || "";
  const gate = body.split(/\$\$/)[1] || "";      // 함수 본문만
  for (const [need, at] of PREP_PAIRS) {
    if (!(gate.includes(need) && gate.includes(at))) {
      say(`SQL 쪽 prep_ready() 가 ${need}/${at} 를 안 봅니다 (${mig})`);
    }
  }
  // stageOf 의 앞 세 줄 — 화면 쪽이 같은 세 쌍을 본다
  const routine = src.get("lib/prepRoutine.js") || "";
  const stage = (routine.split(/export function stageOf/)[1] || "").split(/\n}/)[0];
  for (const [need, at] of PREP_PAIRS) {
    if (!(stage.includes(need) && stage.includes(at))) {
      say(`화면 쪽 stageOf 가 ${need}/${at} 를 안 봅니다 (lib/prepRoutine.js)`);
    }
  }
  // 세 줄을 다시 적지 않고 stageOf 를 불러 쓰는지
  if (!/NOT_READY\s*=\s*new Set\(\["make",\s*"print",\s*"card"\]\)/.test(routine)) {
    say("lib/prepRoutine 의 prepReady 가 stageOf 의 make·print·card 를 안 씁니다 (또 두 벌이 됩니다)");
  }
  if (!bad) ok("준비 끝 판정이 SQL(prep_ready)과 화면(stageOf)에서 같은 세 단계를 봅니다");
}

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 두 벌 검사 통과");
