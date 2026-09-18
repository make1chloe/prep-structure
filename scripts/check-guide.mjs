/** (어77) 묶음 C — 🔒 3초 · 「완료」 · 완료 뒤 다음 걸음 · 아이·학부모 상단 단추 셋 · ❓ 사용 가이드.
 *  원장님 2026-09-17:
 *   「학생어플에서 오늘학습앞엣것부터를 자물쇠 이모지로 바꿔주고 3초누르면 자물쇠여도 시작가능하게 해줘 /
 *     숙재도 타이머 필요해필수는 아니지만 다했어요 앞에 넣어줘 /
 *     다했어요 누르면 클래스카드 숙제는 클래스카드 라고 버튼 누르고 넘어가규 교재숙제는 사진으로 제출 가능하게해줘」
 *   「다했어요를 완료로 수정」
 *   「새로고침, 알림 설정, 사용가이드를 이모지를 이용한 버튼의 형태로 학생 어플 학부모 어플 상단의 배치 해 줘
 *     최대한 스크롤늘리지 않는 방향으로.」
 *  글자만 본다(DB·브라우저 없이) — 화면이 실제로 그러는지는 걷기(e2e/today)가 본다. */
import { readFileSync, readdirSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };

const sql0177 = read("supabase/migrations/0177_item_app.sql");
const item = read("lib/item-plan.js"), ccPlan = read("lib/cc-plan.js"), day = read("lib/day.js");
const cards = read("app/me/cards.js"), mePage = read("app/me/page.js"), mebar = read("app/_shell/mebar.js");
const shell = read("app/_shell/shell.js"), bell = read("app/_shell/bell.js"), guide = read("app/guide/page.js");
const rboard = read("app/settings/routine/board.js"), ract = read("app/settings/routine/actions.js"), rlib = read("lib/routine.js");
const css = read("app/globals.css"), mock = read("docs/목업/클로이영어-화면-목업.html");
const ext = read("extension/background.js");
const walk = read("scripts/e2e/today.mjs"), seed = read("scripts/e2e/seed.sql");

console.log("■ (어77) 이 항목을 어느 앱에서 하나 — 이름이 아니라 칸(0177)");
ok("0177 이 learn_items.by_app 칸을 더하고(멱등) · 값을 check 로 묶고 · VALIDATE 하고 · 스키마를 다시 읽힌다",
  /alter table v2\.learn_items add column if not exists by_app text/.test(sql0177)
  && /check \(by_app is null or by_app in \('cc'\)\)/.test(sql0177)
  && /validate constraint learn_items_by_app_chk/.test(sql0177)
  && /notify pgrst, 'reload schema'/.test(sql0177));
ok("0177 은 v2 만 건드린다(storage·auth·public 에 손대지 않는다 · check-v2only 와 같은 뜻)",
  !/(update|insert into|alter table)\s+(storage|auth)\./i.test(sql0177));
ok("루틴 판(routine_board)이 by_app 을 실어 준다 — 11 이 칩을 그릴 재료(앞 정의의 키는 check-redefine 이 본다)",
  /'by_app', i\.by_app/.test(sql0177) && /'by_app', li\.by_app/.test(sql0177));
ok("가르는 잣대가 **이름**이 아니다 — 판단 어디에도 항목 이름으로 클래스카드를 짚는 자리가 없다",
  !/learn_items\?\.name[^\n]*(클래스카드|클카)/.test(item) && !/name.*includes\("클래스카드"\)/.test(item + cards));

console.log("\n■ 완료 뒤 다음 걸음 — 판단은 lib/item-plan 한 곳");
ok("nextStep 은 완료(said_done_at) 전에는 null · cc 면 \"cc\" · 그 밖은 \"photo\"",
  /export function nextStep/.test(item) && /if \(!it\?\.said_done_at\) return null/.test(item) && /byApp\(it\) === APP_CC \? "cc" : "photo"/.test(item));
ok("APP_CC 는 한 곳에서 나오고(lib/item-plan) 화면·설정이 그것을 가져다 쓴다",
  /export const APP_CC = "cc"/.test(item) && /APP_CC/.test(rboard));
ok("🃏 클래스카드 주소는 lib/cc-plan CC_URL 한 곳 · 확장(extension)의 CC 와 같다(둘이 어긋나면 여기서 잡는다)",
  /export const CC_URL = "([^"]+)"/.test(ccPlan) && /const CC = "([^"]+)"/.test(ext)
  && /export const CC_URL = "([^"]+)"/.exec(ccPlan)[1] === /const CC = "([^"]+)"/.exec(ext)[1]);
ok("07 이 읽는 두 조회가 항목 표를 통째로 싣는다(learn_items(*) · 판이 선 날 · 아직 안 선 날 둘 다) — **칸 이름을 박지 않는다**((어78) 사고: 칸을 더한 SQL 이 실 DB 에 들기 전에 앱이 올라가 오늘 화면이 죽었다)",
  (strip(day).match(/learn_items\(\*\)/g) ?? []).length === 2 && !/learn_items\(name/.test(day));
ok("SubmitLine 은 완료 뒤에 뜬다 — 다만 반려받았거나 이미 낸 것이 있으면 그 전에도 뜬다(다시 내는 길)",
  /const step = nextStep\(item\)/.test(cards) && /step === "photo" \|\| Boolean\(rj\) \|\| mine\.length > 0/.test(cards) && /if \(!id \|\| \(!send && step !== "cc"\)\) return null/.test(cards));
ok("클래스카드 줄은 🃏 단추 하나(새 창) · 교재 줄은 사진·음성 · 둘을 한 자리에서 가른다",
  /data-g="go-cc"[^>]*href=\{CC_URL\}/.test(cards.replace(/\n/g, " ")) && /target="_blank"/.test(cards) && /\{send && <><Upload/.test(cards));

console.log("\n■ 🔒 앞엣것부터 — 3초 길게 누르면 열린다(화면의 안내지 서버 문이 아니다)");
ok("자물쇠는 ACT.lock 그림 · 이름은 「앞엣것부터」 · 누름은 data-act=\"lock-hold\" · 3000ms",
  /\{ACT\.lock\}/.test(cards) && /icon\("앞엣것부터"/.test(cards) && /data-act="lock-hold"/.test(cards) && /ms = 3000/.test(cards));
ok("누르는 동안 얼마나 눌렀는지 보인다(--hold 를 조각이 주고 CSS 가 띠로 그린다 · 대전제-0)",
  /"--hold": `\$\{Math\.round\(held \* 100\)\}%`/.test(cards) && /button\.btn\.lockb::after\{[^}]*width:var\(--hold,0%\)/.test(css));
ok("자물쇠 단추는 제 높이를 안 정한다(작은 단추 높이는 하나 · check-sizes 와 같은 뜻)",
  !/(^|;)\s*(min-|max-)?height:/.test(/button\.btn\.lockb\{([^}]*)\}/.exec(css)?.[1] ?? "height:"));
ok("목업이 그 CSS 의 원본이다(globals.css 를 손으로 고치지 않는다)",
  /button\.btn\.lockb::after/.test(mock) && /\.appbar \.mebar/.test(mock));

console.log("\n■ 한 줄이 내는 손은 한 벌(DoRow) · 이름은 「완료」");
ok("화면은 DoRow 하나만 가져다 쓴다(SaidButton·TimerButton 은 그 안에서만 · 잠금을 두 곳에서 그리지 않는다 · 원칙-1)",
  /export function DoRow/.test(cards) && !/export function SaidButton/.test(cards) && !/export function TimerButton/.test(cards)
  && !/SaidButton|TimerButton/.test(strip(mePage)) && (strip(mePage).match(/<DoRow/g) ?? []).length === 3);
ok("학원 줄은 「■ 끝」이 곧 완료(hands=\"timer\") · 숙제·낼 숙제 줄은 타이머 곁에 「완료」",
  /hands = "both"/.test(cards) && /if \(hands === "timer"\)/.test(cards) && /<DoRow item=\{it\} state=\{it\.state\} hands="timer"/.test(mePage));
ok("아이 화면 어디에도 「다 했어요」 단추가 없다(원장 검사와 같은 말 「완료」 하나 · 08 교재 로드맵의 진도 말은 lib/mark 라 딴 자리)",
  !/>다 했어요</.test(cards) && /\{on \? "완료 ✓ · 취소" : "완료"\}/.test(cards));

console.log("\n■ 아이·학부모 상단 단추 셋 — 탭이 없는 자리에");
ok("🔄 새로고침 · 🔔 알림 설정 · ❓ 사용 가이드 셋 · 그림은 ACT 한 곳에서",
  /\{ACT\.reload\}/.test(mebar) && /\{ACT\.push\}/.test(mebar) && /\{ACT\.guide\}/.test(mebar)
  && /data-act="reload"/.test(mebar) && /data-act="bell"/.test(mebar) && /data-act="guide"/.test(mebar));
ok("🔄 는 화면만 다시 받는다(router.refresh — 통째로 다시 열지 않아 적던 글이 안 날아간다)",
  /router\.refresh\(\)/.test(mebar) && !/location\.reload/.test(mebar));
ok("🔔 은 **있는 카드로 데려간다** — 알림 설정을 두 벌로 안 만든다(원칙-1)",
  /href=\{`\$\{home\}#bell`\}/.test(mebar) && /id="bell"/.test(bell) && !/PushManager|serviceWorker/.test(mebar));
ok("띠는 아이·학부모 화면에만 선다(원장은 그 자리를 탭이 쓴다) · 학부모는 /parent · 아이는 /me",
  /ROLES\.STUDENT \|\| me\?\.role === ROLES\.PARENT/.test(shell) && /\{mine && <MeBar home=\{me\.role === ROLES\.PARENT \? "\/parent" : "\/me"\}/.test(shell));
ok("단추 셋은 좁게 선다(폰에서 상단 띠 줄이 안 는다 · 원장님 「최대한 스크롤늘리지 않는」)",
  /\.appbar \.mebar\{display:flex/.test(css) && /@media\(max-width:760px\)\{[\s\S]{0,400}?\.appbar \.mebar\{gap:2px\}/.test(css));

console.log("\n■ ❓ 사용 가이드 — 설명이 내용인 하나뿐인 화면");
ok("가이드는 아이·학부모로 갈린다 · 줄은 그림·무엇·어디 셋",
  /const parent = me\.role === ROLES\.PARENT/.test(guide) && /data-g="guide-row"/.test(guide));
ok("가이드의 그림도 lib/emoji 에서 온다(그림을 바꾸면 가이드가 저절로 따라온다 · 대전제-25)",
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(strip(guide)) && /from "@\/lib\/emoji"/.test(guide));
ok("가이드 글도 앱 말투다(「~니다 · ~세요 · ~십시오」 0 · check-plain 과 같은 잣대)",
  !/(습니다|입니다|합니다|됩니다|세요|십시오)/.test(strip(guide)));
ok("가이드는 DB 를 안 읽는다(조회 0 · 속도)", !/db\(sb\)|\.from\(|\.rpc\(/.test(guide));

console.log("\n■ 원장님이 켜신다 — 설정 › 루틴 항목마다");
ok("항목 양식에 🃏 클래스카드 칩(켜고 끈다) · 켠 값이 손까지 이어진다",
  /data-act="item-cc"/.test(rboard) && /byApp: f\.byApp \|\| null/.test(ract) && /by_app: byApp \|\| null/.test(rlib));
ok("더하기·수정 **둘 다** 적는다(한쪽만 적으면 수정할 때 꺼진다) · 다만 **한 문장에 같이 싣지 않는다**(setItemApp 한 벌 · (어78) 사고 · 대전제-27)",
  (rlib.match(/await setItemApp\(/g) ?? []).length === 2 && /async function setItemApp/.test(rlib) && /byApp = null \}\) \{/.test(rlib));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기 씨앗에 클래스카드 항목이 하나 있다(by_app = cc)", /'zz_클카 문장훈련'.*'cc'/.test(seed));
ok("걷기가 3초 누르기 · 완료 뒤 사진 자리 · 🃏 단추 · 상단 단추 셋 · 가이드 화면을 본다",
  /lock-hold/.test(walk) && /data-g=go-cc/.test(walk) && /data-g=mebar/.test(walk) && /data-card=guide/.test(walk) && /mouse\.down\(\)/.test(walk));

console.log(`\n■ (어77) 묶음 C 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
