/** 처음-9 「이관 표시와 묶음 번호」 · 속도-4 「줄 수 상한을 안 건다」((사2) 2026-09-11 — 옛 check-import 를 다시 세운다).
 *
 *  처음-9 의 뜻: 옛 앱에서 옮겨 온 줄은 **어느 묶음으로 왔는지**가 남아야 되돌릴 수 있다.
 *  ⚠️ 있는 그대로: 옛 앱에서 줄을 옮겨 담는 표 25 중 **import_batch 를 가진 것은 17**이다.
 *     나머지 여덟(class_schedule · day_item · holiday · inquiry · makeup · notice · progress · score_wrong)과
 *     장부 셋(import_check · import_map · import_skip)·열쇠 하나(integration)는 칸이 없다.
 *     **이관은 이미 끝났다**(실 DB 2026-09-11 실측) — 지금 칸을 더해도 옛 줄은 빈 칸이라 쓸모가 없다.
 *     그래서 여기서는 ① **있는 17 이 그대로 있나**(빠지면 되돌리기가 깨진다) ② **앞으로 새로 옮겨 담는 표는 칸을 갖나**
 *     ③ 되돌리기 장부(import_check·import_map)가 그대로 있나 를 센다. 늘린 것이 아니라 **있는 그대로를 못 박는 것**이다.
 *
 *  속도-4 의 뜻: 학생·날짜로 좁혀 읽고 `.limit()` 으로 자르지 않는다. 자르면 **조용히 빠진 줄**이 생긴다.
 *     「가장 최근 N개」처럼 상한이 곧 뜻인 자리만 허용 목록에 이름과 까닭을 적는다. */
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };

console.log("■ 속도-4 — 줄 수 상한을 안 건다(자르면 조용히 빠진다)");
/** 상한이 곧 뜻인 자리만 — 「가장 최근 N개」·「한 줄만」. 늘리려면 여기에 **까닭**을 적어야 한다 */
const LIMIT_OK = {
  "arrival.js": "재원 시작 한 줄(order + limit 1)",
  "cal.js": "재원 시작 한 줄 — 지난 것은 재원 기간만(확정-⑯)",
  "classes.js": "그 반 시간표 한 줄 · 단가 한 줄(가장 가까운 것)",
  "comment.js": "AI 본보기로 쓸 **지난 글 다섯**(많으면 말투가 흐려진다 · (서))",
  "dash.js": "대시보드 띠 — 가장 최근 하나(확정 도장 · 받아오기 때)",
  "day.js": "그 아이 지난 판 하나(어제 숙제를 잇는다)",
  "homework.js": "직전 판 하나",
  "me.js": "내가 남긴 말 다섯 · 성적 열둘 · 지난 판 하나 — 화면이 그만큼만 보인다",
  "parent.js": "같은 결(보낸 것 · 성적 · 공지 · 지난 판)",
  "progress.js": "커서 한 줄",
  "queue.js": "한 번에 집는 큐 줄 수 — 상한이 곧 규칙이다(v2.rule)",
  "quiz.js": "그 아이 방식 한 줄",
  "routine.js": "그 교재 루틴 한 줄",
  "score.js": "같은 갈래 지난 회차 하나(추이 ▲▼)",
};
for (const f of readdirSync("lib").filter((x) => x.endsWith(".js"))) {
  const s = strip(readFileSync(`lib/${f}`, "utf8"));
  const hits = (s.match(/\.limit\(/g) ?? []).length;
  if (!hits) continue;
  ok(`lib/${f} — 상한 ${hits}곳에 까닭이 적혀 있다: ${LIMIT_OK[f] ?? ""}`, Boolean(LIMIT_OK[f]),
     "줄 수를 자르는데 까닭이 없다 — 학생·날짜로 좁혀 읽어라(속도-4). 「가장 최근 N개」처럼 상한이 곧 뜻이면 check-import 의 LIMIT_OK 에 까닭을 적어라");
}
ok("화면(app)은 줄 수를 안 자른다 — 자를지는 판단(lib)이 정한다", readdirSync("app", { recursive: true }).filter((f) => String(f).endsWith(".js")).every((f) => !/\.limit\(/.test(strip(readFileSync(`app/${f}`, "utf8")))));

const url = process.env.DATABASE_URL;
if (!url) { console.log("   ⏭ 처음-9 는 DATABASE_URL 이 없어 건너뜀 — 초록이 아니다"); }
else {
  const c = new pg.Client({ connectionString: url, ssl: /supabase|amazonaws/.test(url) ? { rejectUnauthorized: false } : false });
  await c.connect();
  const q = async (s) => (await c.query(s)).rows;
  const marked = new Set((await q(`select table_name from information_schema.columns where table_schema='v2' and column_name='import_batch'`)).map((r) => r.table_name));
  console.log("■ 처음-9 — 이관 표시(있는 그대로 못 박기)");
  const HAVE = ["area_routine", "books", "class_member", "classes", "consult", "day_sheet", "exams", "learn_items", "parent_student", "payment", "profiles", "schools", "score", "student_book", "student_routine", "students", "units"];
  const 빠진 = HAVE.filter((t) => !marked.has(t));
  ok(`묶음 번호를 가진 표 ${HAVE.length} 이 그대로다 — 하나라도 빠지면 되돌리기(어느 묶음으로 왔나)가 깨진다`, 빠진.length === 0, 빠진.join(", "));
  ok(`늘어난 것이 있으면 위 목록에 이름을 적는다(지금 ${marked.size})`, marked.size === HAVE.length, [...marked].filter((t) => !HAVE.includes(t)).join(", "));
  const 장부 = (await q(`select table_name from information_schema.tables where table_schema='v2' and table_name in ('import_check','import_map','import_skip')`)).map((r) => r.table_name);
  ok("되돌리기 장부 셋(import_check · import_map · import_skip)이 그대로 있다 — 묶음 칸이 없는 표는 이것으로 되짚는다", 장부.length === 3, 장부.join(", "));
  await c.end();
}
console.log(`\n■ 이관 표시·줄 수 상한 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
