/** (어80)-A 업무 05 칸반에서 **고칠 수 있게** — 원장님 2026-09-18:
 *   「칸반보드에 입력한 세부내용자체도 추가수정삭제가 안됨」 · 「세부내용의 일괄처리 … 전체선택버튼이 없음」
 *  대전제-19(더하고 고치고 빼는 것이 기본) · 대전제-20(고르기 한 벌) · 대전제-6(지우지 않고 내린다 — 그러니 **되살리는 길**이 있어야 짝이 맞는다) */
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };

const board = strip(read("app/schedule/todo/board.js")), qm = strip(read("app/_shell/quickmemo.js"));
const acts = strip(read("app/schedule/todo/actions.js")), todo = strip(read("lib/todo.js")), sched = strip(read("lib/schedule.js"));
const walk = read("scripts/e2e/today.mjs");

console.log("■ (어80)-A ✎ 카드 세부 내용 고치기 — 넣기 양식이 그대로 고치기 양식");
ok("고치는 손이 하나 있다(lib/schedule editTodo) · 넣기(addTodo)와 **같은 잣대**로 본다(날짜 꼴 · 시작일 ≤ 마감)",
  /export async function editTodo/.test(sched) && /시작일이 마감보다 늦습니다/.test(sched) && (sched.match(/시작일이 마감보다 늦습니다/g) ?? []).length === 2);
ok("**안 보낸 칸은 안 건드린다** — 메모가 조용히 날아가지 않는다(대전제-0)", /if \(note !== undefined\) patch\.note/.test(sched));
ok("시작일(새 칸)은 **따로** 적는다 — 칸이 아직 없어도 나머지 고치기는 산다(대전제-27)",
  /async function setStartOn/.test(sched) && /does not exist/i.test(sched));
ok("퀵 메모가 **넣기와 고치기를 다 한다**(두 벌로 안 그린다 · 원칙-1) — edit 를 주면 고치기",
  /edit = null/.test(qm) && /const formOf = \(c\)/.test(qm) && /edit \? await editNoteAct\(edit\.todoId, f\) : await noteAct\(f\)/.test(qm));
ok("고치기에는 「취소」가 있고 「닫기」는 없다(넣기 자리가 아니다)", /data-act="quick-cancel"/.test(qm) && /!inline && !edit &&[\s\S]{0,80}quick-close/.test(qm));
ok("05 카드에 ✎ 가 선다 — **손으로 적은 업무만**(자료 흐름이 만든 카드는 그 화면에서 고친다)",
  /data-act="card-edit"/.test(board) && /c\.todoId && !c\.material &&[\s\S]{0,200}card-edit/.test(board));
ok("고치기는 **그 자리에서** 편다(모달로 화면을 안 떠난다 · 대전제-22)", /data-g="card-edit-form"/.test(board) && /<QuickMemo inline edit=\{c\}/.test(board));

console.log("\n■ (어80)-A 뺀 것 복구 — 대전제-6 의 짝");
ok("복구하는 손이 있다(lib/todo restoreTodo) · **뺀 것만** 되살린다", /export async function restoreTodo/.test(todo) && /뺀 업무가 아닙니다/.test(todo));
ok("한 번에도 된다(todoMany restore)", /restore: \(id\) => restoreTodo\(sb, id\)/.test(todo) && /export async function restoreAct/.test(acts));
ok("카드에 「복구」 · 띠에 「복구 N」(뺀 것을 고른 만큼만)",
  /data-act="restore"/.test(board) && /data-act="restore-picked"/.test(board) && /toRestore = pickedCards\.filter\(\(x\) => x\.state === "dropped"\)/.test(board));

console.log("\n■ (어80)-A 칸마다 전체 선택 — 원장님 「전체선택버튼이 없음」");
ok("칸 머리에 **그 칸만 집는 「전체」**가 있다(20 올린 기록과 같은 부품 PickGroup)",
  /<div className="nb-colh"><PickGroup pick=\{pk\} ids=\{col\.cards\.filter\(\(x\) => x\.todoId\)/.test(board));
ok("판 머리의 「전체」(PickAll)도 그대로 — 둘은 뜻이 다르다(판 전부 · 이 칸만)", /<PickAll pick=\{pk\} \/>/.test(board) && /PickGroup/.test(board));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기가 ① 칸마다 전체 ② ✎ 로 제목 고치기 ③ 빼고 복구를 본다",
  /\(어80\)/.test(walk) && /card-edit/.test(walk) && /data-act=restore/.test(walk));

console.log(`\n■ (어80)-A 업무 칸반 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
