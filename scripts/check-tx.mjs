/** 0-4·표-8 동작마다 트랜잭션 경계(글자 검사) — lib 의 내보낸 손 하나가 표 둘 이상에 쓰면(insert·update·upsert·delete) 「어디까지가 한 덩어리인가」가 적혀 있어야 한다:
 *  SQL 함수(plpgsql — 한 트랜잭션) · 걸음마다 ✓/✕ 로 보이는 것(등록 전환 일곱 · 자료 올리기) · 뒤 표가 앞 표를 가리켜 반쯤 돼도 다음에 이어지는 것. 여기 목록에 없는 새 손이 두 표에 쓰면 빨갛다 — 목록에 까닭과 함께 적는다.
 *  주석을 먼저 지운다(폰-5) */
import { readFileSync, readdirSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
/** 손 → 까닭. 한 덩어리로 묶지 않아도 되는 까닭이 적혀 있다 */
const KNOWN = {
  "lib/quiz.js:setStyle": "방식 줄(quiz_style) + 아직 안 본 같은 시험의 style_id·통과선 — 방식 줄이 서면 시험은 다음 저장·style_for 로 다시 맞출 수 있다(반쯤 돼도 이어진다 · 5단계-③)",
  "lib/student.js:setState": "퇴원 = 학생 상태 + 반 줄 닫기 — 반 줄은 학생 상태를 보고 다시 닫을 수 있다",
  "lib/student.js:issueStudentAccount": "auth 계정 + profiles + 학생 잇기 — 계정이 서고 줄이 안 서면 다음 발급이 「이미 있는 아이디」로 말한다",
  "lib/student.js:issueParentAccount": "auth 계정 + profiles + parent_student — 같은 결",
  "lib/todo.js:addMaterial": "자료 + 항목 + 배정 + 할 일 셋 — 자료가 서면 할 일은 sync_material_todos(SQL) 가 다시 세운다",
  "lib/todo.js:reuseMaterial": "같은 결(♻️)",
  "lib/fee.js:savePayments": "수납(student, ym 유니크 upsert) + 단가 줄 — 단가 줄이 안 서면 다음 달 화면에 「금액 없음」으로 드러나 다시 적으면 선다",
  "lib/grid.js:addGrid": "표 + 본의 칸들 — 칸이 안 서면 빈 표로 보이고 + 칸으로 잇는다",
  "lib/notify.js:notify": "알림 자취(받는 사람마다 한 줄)가 먼저 · 끈 기기 표시는 다음 발송이 다시 본다(끈 기기는 지우지 않는다)",
  "lib/plan.js:planSave": "결석 예정(makeup) 또는 지각 예정(late_plan) — 갈래에 따라 한 표만 쓴다(둘 다 쓰는 길은 없다)",
  "lib/routine.js:layRoutine": "판 항목 + 판×교재 줄 — 깔기는 멱등(laid_at · 다시 열면 이어 깔린다)",
  "lib/routine.js:applyTune": "조절 = 판 항목 + 판×교재 tuned_at — 같은 결(다시 눌러도 같다)",
  "lib/routine.js:addItem": "학습 항목 + 영역 루틴 줄 — 줄이 안 서면 루틴 11 에 항목만 보여 다시 잇는다",
  "lib/student.js:resetPassword": "auth 비밀번호 0000 이 먼저 · profiles.must_change_pw 표시가 안 서면 첫 로그인에 안 물을 뿐 — 다시 초기화하면 선다(대전제-12 는 issued_by_app 이 지킨다)",
  "lib/todo.js:dropMaterial": "자료 내림 + 할 일 내림 — sync_material_todos(SQL) 가 다시 맞춘다",
  "lib/todo.js:handOut": "나눠 줌 + 할 일 hand 끝 — 같은 결(sync)",
  "lib/classes.js:addClass": "반 줄 + 첫 시간표 — 시간표가 안 서면 「시간표 없음」으로 보여 다시 적는다(반은 남는다)",
  "lib/classes.js:closeClass": "반 닫기 = 상태 + 시간표·명단·단가 줄을 전날까지로 닫기(뒤에 시작하는 줄은 빈 기간으로) — 상태가 먼저 닫혀 화면·회차에서 빠지고, 줄 하나가 안 닫히면 다시 닫으면 선다(지우지 않는다)",
  "lib/warn.js:reflect": "반성문(원본) + 그날 판 항목(보이는 표시) — 항목이 안 서면 3b 카드가 반성문 줄을 원본으로 안다",
};
const files = (d) => readdirSync(d).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`);
const bad = [], seen = [];
for (const f of files("lib")) {
  const s = strip(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/export (?:async )?function (\w+)\s*\([^)]*\)\s*\{/g)) {
    const name = m[1]; let d = 0, i = m.index + m[0].length - 1, j = i;
    do { if (s[j] === "{") d++; else if (s[j] === "}") d--; j++; } while (d > 0 && j < s.length);
    const body = s.slice(i, j);
    const tables = new Set([...body.matchAll(/\.from\(["'](\w+)["']\)\s*\.(insert|update|upsert|delete)\(/g)].map((x) => x[1]));
    if (/\.storage\.from\(/.test(body) || /storagePut\(/.test(body)) tables.add("(보관함)");
    if (/auth\.admin\./.test(body)) tables.add("(auth)");
    if (tables.size >= 2) { const key = `${f}:${name}`; seen.push(key); if (!KNOWN[key]) bad.push(`${key} — 표 ${[...tables].join("·")} 에 쓰는데 경계가 안 적혀 있다(check-tx 의 KNOWN 에 까닭과 함께)`); }
  }
}
const stale = Object.keys(KNOWN).filter((k) => !seen.includes(k));
if (stale.length) bad.push(...stale.map((k) => `${k} — 목록에만 있고 lib 에 그런 손이 없다(지우거나 이름을 맞춘다)`));
if (bad.length) { console.log("check-tx ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-tx ✓ 두 표 이상에 쓰는 손 ${seen.length} — 전부 경계가 적혀 있다(0-4·표-8)`);
