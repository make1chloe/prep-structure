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

console.log("\n■ (어80)-A 삭제한 것 복구 — 대전제-6 의 짝");
ok("복구하는 손이 있다(lib/todo restoreTodo) · **삭제한 것만** 되살린다", /export async function restoreTodo/.test(todo) && /삭제한 업무가 아닙니다/.test(todo));
ok("한 번에도 된다(todoMany restore)", /restore: \(id\) => restoreTodo\(sb, id\)/.test(todo) && /export async function restoreAct/.test(acts));
ok("카드에 「복구」 · 띠에 「복구 N」(삭제한 것을 고른 만큼만)",
  /data-act="restore"/.test(board) && /data-act="restore-picked"/.test(board) && /toRestore = pickedCards\.filter\(\(x\) => x\.state === "dropped"\)/.test(board));

console.log("\n■ (어80)-A 칸마다 전체 선택 — 원장님 「전체선택버튼이 없음」");
ok("칸 머리에 **그 칸만 집는 「전체」**가 있다(20 올린 기록과 같은 부품 PickGroup)",
  /<div className="nb-colh"><PickGroup pick=\{pk\} ids=\{col\.cards\.filter\(\(x\) => x\.todoId\)/.test(board));
ok("판 머리의 「전체」(PickAll)도 그대로 — 둘은 뜻이 다르다(판 전부 · 이 칸만)", /<PickAll pick=\{pk\} \/>/.test(board) && /PickGroup/.test(board));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기가 ① 칸마다 전체 ② ✎ 로 제목 고치기 ③ 빼고 복구를 본다",
  /\(어80\)/.test(walk) && /card-edit/.test(walk) && /data-act=restore/.test(walk));


/* (어88) 원장님 2026-09-18 업무 05 여섯 — 「이거 기능이 뭐야 대체 · 눌리지도않음」(묶기 딱지) · 「가로배치 카드 드래그」
   · 「내리기랑 빼기가 정확히 무슨 기능인지 모르겠고」 · 「메모에 추가한 사진은 확인이 안 됨」 · 「눌러서 세부내용확인 불가능」
   · 「근데 업무종류를 고르는건 가능하게해야함」. 여섯을 하나씩 지킨다. */
console.log("\n■ (어88) 업무 05 — 눌리는 것만 눌리게 · 끌 수 있게 · 이름 하나 · 사진 · 세부 내용 · 종류");
{ const css = readFileSync("app/globals.css", "utf8");
  ok("보기줄에 **안 눌리는 딱지**가 없다(「묶기: 업무 종류 · 고정」은 span 이면서 눌린 단추 색이었다)",
     !/nb-tool nb-on/.test(board) && !/묶기: 업무 종류/.test(board));
  ok("카드를 **끌어서** 칸을 옮긴다 · pointer 이벤트 한 벌(폰에서도 된다 · HTML5 draggable 은 check-pref 가 금지)",
     /onPointerDown=\{\(e\) => grab\(e, c\)\}/.test(board) && /setPointerCapture/.test(board) && !/draggable|onDragStart/.test(board));
  ok("끌어 놓는 것도 **띠와 같은 손**(moveKindAct · 새 손 0 · 원칙-1) · 띠의 「↔ 분류 옮기기」는 그대로 산다(폰·키보드·여러 장)",
     /run\(\(\) => moveKindAct\(\[c\.todoId\], to\)/.test(board) && /data-act="move-kind"/.test(board));
  ok("놓을 자리가 **눈에 보인다**(.nb-col[data-drop] · 끌리는 카드는 흐려진다)",
     /data-drop=\{drag && over === col\.kind/.test(board) && /\.nb-col\[data-drop="1"\]/.test(css) && /\.nb-card\[data-drag="1"\]/.test(css));
  ok("카드 클릭을 막는 것은 **여는 쪽 한 곳**이다(손마다 stopPropagation 을 붙이지 않는다 · today/row.js rowtop 과 같은 본 · 원칙-1)",
     /const openCard = \(c\) => \(e\) => \{ if \(e\.target\.closest\("button,a,input,select,textarea,label"\)\) return;/.test(board));
  ok("카드를 누르면 **세부 내용**이 열린다(분류 · 마감 · 첨부 · 왜 생겼나 · 메모) · 고치기는 같은 양식 한 벌",
     /data-g="card-detail"/.test(board) && /data-g="detail-props"/.test(board) && /<QuickMemo inline edit=\{dCard\}/.test(board));
  ok("**모든 카드가** 모달을 연다(원장님 2026-09-18 「이거 그냥 다 모달 가능하게해줘」)",
     /setSel\(c\.id\); setDetail\(c\.id\); \};/.test(board));
  ok("자료 카드는 모달 **안에서** 📦 단계 흐름을 본다(아래까지 안 내려간다) · 흐름은 한 벌(Flow · 두 벌로 안 그린다 · 원칙-1)",
     /const Flow = \(\{ card \}\) =>/.test(board) && /data-g="detail-flow"/.test(board) && /Flow\(\{ card: selCard \}\)/.test(board));
  ok("첨부 **사진은 썸네일**로 보인다(app/_shell/photo.js 한 벌 — 07·20·아이·학부모가 쓰는 그것) · 사진 아닌 것만 이름 링크",
     /isImage\(f\.mime\)/.test(board) && /<Photo /.test(board));
  ok("업무를 넣을 때 **종류를 고른다**(퀵 메모 · 05 · 12 일정) · 상단 띠는 표를 안 읽는다(속도-4 — 화면이 내려준 것 · 없으면 씨앗)",
     /data-g="quick-kind"/.test(readFileSync("app/_shell/quickmemo.js", "utf8"))
     && /kinds = null/.test(readFileSync("app/_shell/quickmemo.js", "utf8"))
     && /data-g="sched-kind"/.test(readFileSync("app/schedule/panel.js", "utf8")));
  const sched = readFileSync("lib/schedule.js", "utf8");
  ok("아무 글자나 종류로 안 들어간다 — **문지기 한 곳**(okKind: 표에 있고 · 업무에 보이고 · 살아 있는 것만)",
     /async function okKind\(sb, kind\)/.test(sched) && /없는 업무 종류입니다/.test(sched) && /kind: await okKind\(sb, kind\)/.test(sched));
  const todo = readFileSync("lib/todo.js", "utf8");
  ok("업무 하나를 지울 때 **자료까지 지웠으면 화면이 그 말을 한다**(대전제-0 — 알림이 「삭제 ✓」만 하던 자리)",
     /return \{ material: alsoMaterial \? t\.material_id : null \}/.test(todo) && /자료와 남은 업무도 함께/.test(board));
  const due = readFileSync("app/duecard.js", "utf8");
  ok("대시보드 ⏰ 업무 줄이 **원장님이 만드신 분류 이름**을 쓴다(0182 kind_name · 씨앗에 없으면 열쇠가 그대로 보였다)",
     /t\.kind_name \?\? kindName\(t\.kind\)/.test(due));
  ok("대시보드 ⏰ 업무 줄도 **그 자리에서** 끝낸다(원장님 「모달로 바로바로 처리」가 아이 줄에만 지켜져 있었다) · 05 와 같은 손",
     /data-act="due-todo-done"/.test(due) && /doneAct/.test(due)); }

/* (어89) 원장님 2026-09-18 「재시험지 만들면 할일이뭐야 · 재시함지는 왜 완료가 없어?」 —
   🔁 재시험 카드만 「✓ 끝냄」이 없어 종이만 찍고 영영 서 있었다(끝내는 자리가 01 에만 있었다). */
console.log("\n■ (어89) 재시험도 끝난다 — 종이는 중간, 끝냄이 따로");
{ const plan = readFileSync("lib/todo-plan.js", "utf8"), acts = readFileSync("app/schedule/todo/actions.js", "utf8");
  ok("재시험 카드가 **판 열쇠**를 들고 다닌다(0183 sheet_id) — 그 아이 그날 일지에 적어야 한다",
     /sheetId: q\.sheet_id \?\? null/.test(plan));
  ok("카드에 「✓ 끝냄」이 있다(다른 카드와 같다 · 종이 ✓ 는 중간 표시일 뿐)",
     /data-act="retest-done"/.test(board) && /✓ 끝냄<\/button>\}/.test(board));
  ok("끝낼 때 **틀린 개수만** 그 자리에서 묻는다(대전제-22 · 페이지를 안 떠난다)",
     /data-g="retest-take"/.test(board) && /data-g="retest-wrong"/.test(board) && /data-act="retest-save"/.test(board));
  ok("쓰는 손은 **01 과 같은 것**(lib/quiz takeQuiz) · 새 손 0(원칙-1) — 넘김·못 넘김 판단도 같다",
     /import \{ takeQuiz \} from "@\/lib\/quiz"/.test(acts) && /takeQuiz\(sb, sheetId, quizId, \{ wrong \}\)/.test(acts) && !/from\("quiz"\)\.update/.test(acts));
  ok("**마감한 판이면 「✓ 끝냄」을 안 그린다** · 「마감함 · 잠김」이라 말한다(검사-⑤ assertOpen · 안 눌리는 단추 0 · 원장님 9/18 「눌리지도않음」)",
     /!c\.closed && <button className="btn sm pri"[\s\S]{0,200}data-act="retest-done"/.test(board) && /data-g="retest-locked"/.test(board)
     && /closed: Boolean\(q\.closed\)/.test(readFileSync("lib/todo-plan.js", "utf8")));
  ok("결과를 말한다 — 넘김 ✓ / 못 넘김이면 재시험이 다시 선다(대전제-0)",
     /넘김 ✓/.test(board) && /못 넘김 · 재시험이 다시 섭니다/.test(board)); }
console.log(`\n■ (어80)-A 업무 칸반 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
