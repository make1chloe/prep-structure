/** 그림(이모지) 검사 — (어67) · 원장님 2026-09-16 「단순장식이 아닌 기능이있는 버튼역할의 이모지는 직관적으로 기능을 암시하면서 디자인상에 서로 뚜렷한 차별화가 필요해」 ·
 *  「그리고 숙제검사는 그냥 이모지쓰지말자 · 삭제. 오늘. 남아서. 숙제. 이렇게 만드러줘」.
 *  그림은 두 표에서만 온다(lib/emoji.js) — FACE(카드·탭 얼굴 · 장식) · ACT(손 · 단추). 표 안에서 같은 그림이 두 뜻을 맡으면 실패한다(뚜렷한 차별화).
 *  두 표 사이는 겹쳐도 된다 — 얼굴과 손은 서는 곳이 달라 헷갈리지 않는다. 다만 뜻이 같을 때만(🏠 집 · 🏫 학원 · 📨 문자 · ✏️ 수정 · ✅ 다 함).
 *  숙제 검사 카드는 그림 밖이다 — 글자가 곧 기능이다. 손 넷의 글은 lib/item-plan CHECK_MOVE 한 벌(화면이 다시 안 적는다).
 *  마지막은 래칫 — ACT 를 안 거치고 단추에 직접 박힌 그림 자리가 늘면 실패한다. 줄이는 것이 답이지 숫자를 올리는 것이 답이 아니다 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FACE, ACT, dupes } from "../lib/emoji.js";
import { CHECK_MOVE, UPTO } from "../lib/item-plan.js";
import { menuFor } from "../lib/menu.js";
import { ROLES } from "../lib/roles.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" || f === ".next" ? [] : files(p)) : /\.(js|mjs)$/.test(f) ? [p] : []; });
const PIC = /\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*/gu;
const pics = (s) => [...String(s).matchAll(PIC)].map((m) => m[0].replace(/️/g, ""));
/** <button …> … </button> 한 덩이씩 (겹친 것도 센다 · 여는 표와 닫는 표를 짝지어 잘라 낸다) */
function buttons(src) {
  const out = []; let i = 0;
  while ((i = src.indexOf("<button", i)) !== -1) {
    const end = src.indexOf("</button>", i);
    if (end === -1) break;
    out.push(src.slice(i, end)); i += 7;
  }
  return out;
}
/** 이름이 name 인 함수 한 벌을 중괄호 짝으로 잘라 낸다 */
function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`); if (at === -1) return "";
  const open = src.indexOf(") {", at); if (open === -1) return "";   // 매개변수의 { (구조 분해)가 아니라 몸통의 { 부터 센다
  let depth = 0;
  for (let j = open + 2; j < src.length; j++) { const c = src[j]; if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) return src.slice(at, j + 1); } }
  return src.slice(at);
}

console.log("■ 그림은 두 표에서만 온다(lib/emoji.js) · 표 안에서 같은 그림이 두 뜻을 맡지 않는다(원장님 「서로 뚜렷한 차별화」)");
ok(`카드·탭 얼굴 FACE ${Object.keys(FACE).length}종 · 겹침 0`, dupes(FACE).length === 0, dupes(FACE).join(" · "));
ok(`손(단추) ACT ${Object.keys(ACT).length}종 · 겹침 0`, dupes(ACT).length === 0, dupes(ACT).join(" · "));
{ const f = new Map(Object.entries(FACE).map(([k, e]) => [e.replace(/️/g, ""), k])), same = { dash: "home", classes: "school", send: "sms", progress: "edit", password: "account" };
  const cross = Object.entries(ACT).filter(([k, e]) => f.has(e.replace(/️/g, "")) && same[f.get(e.replace(/️/g, ""))] !== k).map(([k, e]) => `${e} ${f.get(e.replace(/️/g, ""))}(얼굴) ↔ ${k}(손)`);
  ok("두 표가 같은 그림을 쓰는 다섯(🏠 집 · 🏫 학원 · 📨 문자 · ✏️ 수정 · 🔑 계정)은 뜻이 같다 · 그 밖의 겹침 0", cross.length === 0, cross.join(" · ")); }
const seg = new Intl.Segmenter("ko", { granularity: "grapheme" });
ok("한 글자짜리 손이 아니면 표에 안 넣는다(단추는 좁다) · ACT 는 전부 한 글자", Object.values(ACT).every((e) => [...seg.segment(e)].length === 1), Object.entries(ACT).filter(([, e]) => [...seg.segment(e)].length !== 1).map(([k]) => k).join(" "));

console.log("■ (어82) 숙제 검사의 ○△✕← 는 **글자**다 — 상자 색을 입어야 해서(원장님 2026-09-18 「기호색깔을 박스랑 통일해줘」) · 손 넷(삭제·수업중·수업후·숙제)도 글자");
{ const src = readFileSync("app/today/row.js", "utf8");
  const card = fnBody(src, "CheckCard"), item = fnBody(src, "CheckItem");
  ok("app/today/row.js 에 CheckCard · CheckItem 이 있다(잘라 보는 검사라 이름이 바뀌면 여기부터 고친다)", card.length > 200 && item.length > 200);
  const inButtons = [...buttons(card), ...buttons(item)].flatMap(pics);
  // (어76) 검사 값 단추 넷만 그림이다 · 그 그림은 **제 손으로 안 적고** 기능 표(ACT)에서 온다 — lib/status.js CHECK 를 거친다(원칙-1 · 대전제-25)
  const st = readFileSync("lib/status.js", "utf8");
  // (어82) 그림이면 상자 색을 못 입는다 — 넷은 lib/status.js 한 곳에 **글자**로 산다(그림이 아님을 글자로 잰다)
  { const 넷 = (st.match(/export const CHECK = [^\n]*/) ?? [""])[0] + (st.match(/export const REJECT_MARK = [^\n]*/) ?? [""])[0];
    ok("검사 넷의 기호는 lib/status.js 한 곳 · ○ △ ✕ ← · **그림이 하나도 없다**(그림은 제 색이 있어 상자 색을 못 따라간다 · 원장님 2026-09-18)",
       /\[\["done", "○"\], \["weak", "△"\], \["missing", "✕"\]\]/.test(st) && /REJECT_MARK = "←"/.test(st)
       && pics(넷).length === 0 && !/from "\.\/emoji\.js"/.test(st), pics(넷).join(" ")); }
  ok("반려는 넷째 손 · REJECT_MARK 하나 · 사유 여섯은 lib/status.js REJECT 한 벌(DB 0176 과 같은 목록)",
     /data-act="reject"/.test(item) && /\{REJECT_MARK\}/.test(item) && /REJECT\.map/.test(item) && ["화질 저하", "페이지 잘림", "페이지 누락", "과제 미완료", "근거 누락", "기타"].every((w) => st.includes(w)));
  // (어82) 「기호색깔을 박스랑 통일」 — 넷 다 **누르기 전에도** 제 상자 색을 글자색으로 입는다(미흡만 --on-weak: 노랑·주황은 글씨로 못 쓴다)
  { const css = readFileSync("app/globals.css", "utf8");
    const rule = (v) => (css.match(new RegExp(`\\.chk button\\[data-v="${v}"\\]\\{([^}]*)\\}`)) || [, ""])[1];
    const 짝 = [["o", "--ok"], ["x", "--miss"], ["r", "--navy"]];
    const 어긋난 = 짝.filter(([v, c]) => !(rule(v).includes(`color:var(${c})`) && rule(v).includes(`border-color:var(${c})`)));
    ok("기호 색 = 상자 색 · 완료 --ok · 미완료 --miss · 반려 --navy 셋은 글자색과 테두리색이 같다(원장님 2026-09-18 「기호색깔을 박스랑 통일해줘」)",
       어긋난.length === 0, 어긋난.map(([v]) => v).join(" "));
    ok("미흡만 글자가 진하다(--on-weak) · 상자는 --amber 테두리로 제 색을 낸다(노랑·주황을 글씨로 쓰면 대비 4.5 를 못 넘는다 · 원장님 9/5 「이 색 금지」)",
       rule("w").includes("color:var(--on-weak)") && rule("w").includes("border-color:var(--amber)"), rule("w")); }
  ok(`검사 카드·검사 줄이 그리는 단추에 **표를 안 거친** 그림 0 (단추 ${buttons(card).length + buttons(item).length}개)`, inButtons.length === 0, [...new Set(inButtons)].join(" "));
  ok("검사 줄의 손 넷은 글자다 · 삭제 · 수업중 · 수업후 · 숙제(언제 하느냐로 읽힌다 · 원장님 9/16 「삭제 수업중 수업후 숙제」)", CHECK_MOVE.map(([, t]) => t).join(" · ") === "삭제 · 수업중 · 수업후 · 숙제" && CHECK_MOVE.every(([, t]) => pics(t).length === 0));
  ok("넷의 구분은 off(줄을 내린다 · 대전제-6) · class · stay · home 셋(carryRest)", CHECK_MOVE.map(([w]) => w).join() === "off,class,stay,home");
  ok("화면은 글을 다시 안 적는다 · row.js 가 CHECK_MOVE 를 들여온다(원칙-1)", /import \{[^}]*CHECK_MOVE[^}]*\} from "@\/lib\/item-plan"/.test(src) && !/\[\["class", "오늘/.test(src));
  ok("「삭제」한 검사 줄은 되돌릴 길이 있다 · 카드 밑 「복구」(대전제-19)", /data-g="check-off"/.test(card) && /item-restore/.test(card)); }
{ const hw = readFileSync("lib/homework.js", "utf8");
  ok("「어디까지」 세 마디도 한 벌(lib/item-plan UPTO) · lib/homework.js·화면에 두 번째 벌 0", UPTO.join() === "시작만,절반,거의 다" && !/UPTO|"오늘 학습으로"/.test(hw));
  ok("검사 줄도 뺄 수 있다(off) · lib/homework.js removeItem 이 check 를 받는다", /\["check", "class", "home", "next", "stay"\]\.includes\(it\.slot\)/.test(hw)); }

console.log("■ (어67)-② 얼굴 · 탭마다 하나 · 한 그림이 한 뜻(원장님 2026-09-16 「장식이모지는 계획대로」)");
{ const items = menuFor(ROLES.PRINCIPAL, []);
  const emos = items.map((m) => m.emo);
  const faces = new Set(Object.values(FACE));
  ok(`상단 탭 ${items.length}개마다 얼굴 하나 · 서로 겹침 0 · 전부 FACE 에서 온다`, items.length >= 11 && emos.every((e) => e && faces.has(e)) && new Set(emos).size === emos.length, items.map((m) => `${m.emo ?? "없음"} ${m.name}`).join(" · "));
  ok("탭 얼굴을 화면이 제 손으로 안 적는다(lib/menu.js 가 FACE 를 들여온다 · 원칙-1)", /import \{ FACE \} from "\.\/emoji\.js"/.test(readFileSync("lib/menu.js", "utf8"))); }
{ const noC = (x) => x.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
  const src = [...files("app"), ...files("lib")].filter((p) => p !== "lib/emoji.js").map((p) => [p, noC(readFileSync(p, "utf8"))]);
  const outside = (needle, allow) => src.flatMap(([p, t]) => (allow.includes(p) ? [] : t.includes(needle) ? [p] : []));
  // 🏫 은 반 하나 · 학교는 🏛️ · 학원 전체는 🏢 · 학교 시험은 🗓️ (단추의 「학원으로」는 ACT.school)
  const ban1 = outside("🏫", ["app/today/board.js", "app/today/row.js", "app/schedule/classes/board.js", "app/schedule/classes/page.js", "app/schedule/page.js", "app/ops/students/board.js", "app/login/page.js", "app/settings/staff/board.js"]);
  ok("🏫 은 반(과 단추 「학원으로」·역할 🧑‍🏫)만 맡는다 · 학교 🏛️ · 학원 전체 🏢 · 학교 시험 🗓️", ban1.length === 0, ban1.join(" · "));
  // 📝 은 시험 기간 하나 · 영어 시험일 🅰️ · 단원평가 ✍️ · 다음 시간 시험 🔤 · 직접 출제 🖊️
  const ban2 = outside("📝", ["app/page.js", "app/schedule/panel.js", "app/today/row.js", "lib/cal-plan.js", "lib/schedule-plan.js"]);
  ok("📝 은 시험 기간 하나만 맡는다 · 영어 시험일 🅰️ · 단원평가 ✍️ · 다음 시간 시험 🔤 · 직접 출제 🖊️", ban2.length === 0, ban2.join(" · ")); }

{ const OLD = String.fromCodePoint(0x2197);   // 옛 우상향 화살표 — 이 파일이 그 글자를 품으면 제가 저를 잡으므로 코드포인트로 적는다
  const stray = [...files("app"), ...files("lib"), ...files("scripts")].filter((p) => readFileSync(p, "utf8").includes(OLD));
  ok(`(어67)-③ 「다른 화면으로」는 ACT.goto 👉 하나 · 옛 우상향 화살표(${OLD}) 0(원장님 2026-09-16 「우상향 화살표 그거좀 아이콘 자체를 바꿔 개못생김」 → 9/17 「다른이모지!!!!」)`, ACT.goto === "👉" && stray.length === 0, stray.join(" · ")); }

console.log("■ 래칫 · 손의 그림은 ACT 표에서 온다(늘면 실패 · 줄이는 것이 답)");
{ const act = new Set(Object.values(ACT).map((e) => e.replace(/️/g, "")));
  const out = [];
  for (const p of files("app")) for (const b of buttons(readFileSync(p, "utf8"))) for (const c of pics(b)) if (!act.has(c)) out.push([p, c]);
  const kinds = [...new Set(out.map(([, c]) => c))];
  const MAX = 52;   // (어67) 처음 60자리(26종) → (어67)-③ 「다른 화면으로」를 ACT.goto 👉 로 옮겨 59 → (어82) 실측 52 로 조임. ACT 로 옮길 때마다 이 숫자를 내린다 · 올리지 않는다
  ok(`ACT 밖 단추 그림 ${out.length}자리 · ${kinds.length}종 ≤ ${MAX}`, out.length <= MAX, `${kinds.join(" ")} · 늘었으면 lib/emoji.js ACT 에 넣고 그 이름을 쓴다`); }
{ const noC = (x) => x.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "));
  let face = 0;
  for (const p of [...files("app"), ...files("lib")]) { if (p === "lib/emoji.js") continue;
    const src = noC(readFileSync(p, "utf8")); const br = []; let i = 0;
    while ((i = src.indexOf("<button", i)) !== -1) { const e = src.indexOf("</button>", i); if (e === -1) break; br.push([i, e + 9]); i += 7; }
    for (const m of src.matchAll(PIC)) if (!br.some(([a, b]) => m.index >= a && m.index < b)) face++; }
  const FMAX = 603;   // (어67)-② 처음 잰 값. 얼굴을 FACE 로 옮길 때마다 내려간다(표에서 오면 글자가 아니라 이름이라 안 세어진다) · 올리지 않는다
  ok(`화면 얼굴 그림 ${face}자리 ≤ ${FMAX} (FACE 로 옮길수록 내려간다 · 탭 열하나는 이미 표에서 온다)`, face <= FMAX, "늘었으면 lib/emoji.js FACE 에 넣고 그 이름을 쓴다"); }

console.log(`\n■ 그림 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
