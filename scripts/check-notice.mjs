/**
 * **수업 전달사항은 메모다 — 알림이 가면 안 된다** (2026-08-07)
 *
 * 원장님
 *   「공지는 알림없이 숙제에 포함되었으면 좋겠고
 *    전달사항은 이름을 수업전달사항으로 바꿔줘
 *    수업중에 얼굴보고 말할거를 잊지않게 메모하는 용도인거라 알림이 가면안돼」
 *   「알림 켜면 끄기랑 방해금지모드 설정만 남기고 페이지 맨밑으로 내려줘」
 *
 * 이건 오류로 안 잡힌다. 적는 순간 아이 폰이 울리는데, 원장님은 **아직
 * 아무 말도 안 하신 상태**다. 아이는 무슨 소린지 모르고 열어보고,
 * 그런 알림이 몇 번 오면 그다음부터 안 누른다.
 *
 * 쓰는 법:  node scripts/check-notice.mjs
 */
import { readFileSync } from "node:fs";

let bad = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); bad = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 울리는 갈래와 안 울리는 갈래 ==");
const act = read("app/today/actions.js");
const make = act.slice(act.indexOf("export async function createNotice"));
const nextFn = make.indexOf("\nexport async function", 10);
const body = nextFn > 0 ? make.slice(0, nextFn) : make;
/**
 * 다섯 갈래 중 **「알림」 으로 끝나는 둘만** 울린다 (2026-08-07).
 *   숙제 공지   → 숙제 안내에 실려서 닿는다
 *   리포트 공지 → 데일리리포트에 실려서 닿는다
 *   수업 메모   → 아무 데도 안 나간다 (교실에서 말로)
 * 이 셋이 울리면 원장님이 아직 아무 말도 안 하신 채 아이 폰이 울린다.
 */
eq(/isAlert\(row\.kind\)/.test(body), true, "울리는 갈래인지 먼저 본다");
eq(/if \(isAlert\(row\.kind\)\) \{[\s\S]*?pushTo/.test(body), true,
   "알림 갈래일 때만 보낸다");
// isAlert 밖에서 부르는 곳이 있으면 안 울려야 할 것이 울린다
const beforeIf = body.slice(0, body.indexOf("isAlert(row.kind)"));
eq(/pushTo/.test(beforeIf), false, "그 앞에서는 아무것도 안 보낸다");

const nk = read("lib/notices.js");
eq(/isAlert[\s\S]*alert_student[\s\S]*alert_parent/.test(nk), true,
   "울리는 갈래는 두 개뿐");
// 「공지」 로 끝나는 것과 「메모」 는 push:false 여야 한다
for (const k of ["homework", "notice", "memo"]) {
  const seg = nk.slice(nk.indexOf(`key: "${k}"`), nk.indexOf(`key: "${k}"`) + 300);
  eq(/push: false/.test(seg), true, `${k} 는 안 울린다`);
}

// 진짜 지금 알려야 하는 것은 발송 화면의 「안내」 로 보내신다 — 거기는 그대로
eq(read("app/report/noticeActions.js").includes("pushToFamilies"), true,
   "발송 화면의 안내는 그대로 알린다 (보내려고 여는 자리다)");
// 숙제가 올라올 때는 여전히 알린다 — 그건 아이가 집에서 알아야 하는 일이다
eq(act.includes("pushToStudents"), true, "숙제 알림은 그대로");

console.log("\n== 다섯 갈래 이름 (원장님이 고르신 것) ==");
for (const [k, label] of [
  ["homework", "숙제 공지"],
  ["alert_student", "학생 알림"],
  ["notice", "리포트 공지"],
  ["alert_parent", "학부모 알림"],
  ["memo", "수업 메모"],
]) {
  eq(nk.includes(`label: "${label}"`), true, `${k} = ${label}`);
}
const top = read("app/today/TopNotices.jsx");
eq(top.includes("NOTICE_KINDS"), true, "오늘 수업 화면이 한 곳에서 가져다 쓴다");
eq(read("app/check/AheadBoard.jsx").includes("NOTICE_KINDS.filter((k) => !k.push)"), true,
   "미리 넣기에는 울리는 갈래가 없다 (다음 주 것을 적는데 지금 울리면 안 된다)");
// 되돌릴 수 없는 것은 한 번 더 여쭙는다
eq(/isAlert\(kind\)[\s\S]{0,300}confirm\(/.test(top), true, "울리기 전에 한 번 물어본다");

console.log("\n== 특강 label 공지 (0167 — 이행계획서 v2 §8) ==");
/**
 * 특강은 반이 아니라 재원생 속성(0164)이라 notices.class_id (uuid) 에 못
 * 담는다. 비-uuid 가 uuid 칸으로 흘러들면 22P02 로 죽는다 — 「보강」 가상
 * 그룹이 그 잠복 버그였다. label 공지는 extra_label 한 칸에 정체성을 남긴다.
 */
eq(body.includes('startsWith("extra:")'), true,
   "옛 판이 반 자리에 실어 보낸 「extra:라벨」 도 label 공지로 받아준다");
eq(body.includes("extra_label"), true,
   "어느 특강에 보냈는지(extra_label)를 남긴다 — 재발송·감사의 근거");
eq(/반이 아닌 그룹/.test(body), true,
   "「보강」 같은 비-uuid 가상 그룹은 반 공지로 못 흘러든다");
const todayPage = read("app/today/page.jsx");
eq(/g\.klass\.id !== "makeup"/.test(todayPage), true,
   "공지 반 목록에서 「보강」 가상 그룹은 뺀다 (특강 그룹은 label 로 선다)");
eq(top.includes("extraLabel"), true,
   "반별 목록의 특강 그룹은 classId 가 아니라 extraLabel 로 보낸다");

console.log("\n== 실려 나가는 것 / 이미 나간 것 ==");
const rd = read("lib/reportData.js");
// 「알림」 갈래는 적는 순간 이미 나갔다 — 리포트에 또 실으면 두 번 받으신다
eq(/\.in\("kind", \["notice", "homework", LEGACY\]\)/.test(rd), true,
   "리포트·숙제 문자에는 「공지」 갈래만 싣는다");
eq(/alert_/.test(rd), false, "알림 갈래는 안 싣는다 (이미 나갔다)");
// 발송 화면의 안내도 「알림」 으로 적힌다 — 예전에는 deliver 라서 숙제 문자에
// 한 번 더 실려 나갔다
eq(read("lib/notify.js").includes('"alert_parent" : "alert_student"'), true,
   "발송 화면의 안내는 알림 갈래로 남는다");

console.log("\n== 수업 메모는 아이·어머니 화면에 안 뜬다 ==");
// 교실에서 말하려고 적어둔 것이라, 아이가 앱에서 먼저 읽으면 그 말을 할
// 이유가 없어진다
eq(/kind === "memo"\) return false/.test(nk), true, "메모는 아무에게도 안 보인다");
eq(read("app/me/page.jsx").includes("showsTo(n.kind"), true, "학생 화면이 걸러낸다");
eq(read("app/parent/page.jsx").includes('showsTo(n.kind, "parent")'), true, "학부모 화면도");

console.log("\n== 맨 위 공지와 학생별 공지가 한자리에 ==");
/**
 * 원장님 (2026-08-07) — 「오늘 수업 맨위 공지랑 학생별 검사 밑에 공지랑
 * 내용이 연동되어야 해」
 *
 * 둘 다 **같은 글에 실려 나간다** — 반 전체에 한 말과 이 아이에게만 하는
 * 말이 어머니께는 한 통으로 간다. 그런데 화면에서는 하나가 판 맨 위에,
 * 하나가 맨 아래에 떨어져 있어서 같이 읽어볼 수가 없었다. 그러면 같은
 * 말을 두 번 적거나, 앞에 적은 것을 잊는다.
 */
const panel = read("app/today/StudentPanel.jsx");
eq(panel.includes('{/* 전체 공지 (읽기용) */}'), false, "맨 위에 따로 떠 있던 칸을 뺐다");
// 학생공지 옆에는 전체 「수업 전달사항」, 부모님공지 옆에는 전체 「공지」
eq(/Row\("숙제 공지", "homework"/.test(panel), true, "숙제 공지 옆에 전체 숙제 공지");
eq(/Row\("리포트 공지", "notice"/.test(panel), true, "리포트 공지 옆에 전체 리포트 공지");
// **여기서 고치면 반 전체가 바뀐다** — 그래서 읽기만 된다
eq(/전체 것은 여기서 못 고친다/.test(panel), true, "전체 것은 읽기만 (고칠 자리를 알려준다)");

console.log("\n== 공지에 제목은 없다 ==");
// 한 줄짜리 말에 제목을 또 다는 것은 같은 말을 두 번 적는 일이었다
const top2 = top;
eq(/placeholder="제목/.test(top2), false, "제목 칸을 뺐다");
eq(/const \[title, setTitle\]/.test(top2), false, "제목 상태도 뺐다");
// 본문이 없으면 저장할 것이 없다 (예전에는 제목만으로도 저장됐다)
eq(top2.includes("if (!body.trim()) return;"), true, "본문이 있어야 저장된다");

console.log("\n== 어디에 실려 나가나 ==");
const rt = read("lib/reportText.js");
// 수업 전달사항(학생용) → 숙제 안내에
eq(rt.includes("r.studentNotices"), true, "수업 전달사항은 숙제 안내에 실린다");
// 공지(학부모용) → 데일리리포트에
eq(/notices\.push\(rep\.notice\)/.test(rt), true, "공지는 데일리리포트에 실린다");

console.log("\n== 아이 화면의 알림 설정은 탭줄 🔔 뒤로 ==");
/**
 * 2026-08-07 에는 「페이지 맨 밑으로」 였다 — 맨 위에 있으면 「지금 할 것」
 * 이 한 화면 아래로 밀리기 때문이다. 탭(2026-08-27)이 생기자 그 카드가
 * **어느 탭에서든** 맨 밑에 상주하게 됐고, 원장님이 다시 정하셨다 —
 * 「어플가이드처럼 아이콘으로 알림설정을 추가해줘. 페이지 맨 밑마다
 * 나오는 건 별로같아」. 한 번 켜고 나면 다시 볼 일이 없는 칸이라(그 판단은
 * 그대로), 상시 카드가 아니라 🔔 을 눌러야 열리는 팝업이 됐다.
 */
const me = read("app/me/page.jsx");
eq(me.includes("<AlertBox brief />"), true, "짧은 판으로");
eq(me.split("<AlertBox").length, 2, "상시 카드로는 더 안 그린다 (한 벌만 — 🔔 팝업 속)");
const meTabs = read("app/me/MeTabs.jsx");
eq(meTabs.includes('aria-label="알림 설정"'), true, "탭줄에 🔔 알림 설정 아이콘이 있다");
// 잔소리 창이 도는 중에도 그걸 고치는 문(설정)만은 게이트가 안 삼킨다
eq(meTabs.includes("data-alertgate"), true, "게이트가 설정 여는 길목은 안 삼킨다");
// 꺼져 있을 때는 AlertGate 가 화면 앞에서 막아선다 — 팝업 속이어도 안 놓친다
eq(me.includes("<AlertGate>"), true, "꺼져 있으면 여전히 막아선다");

const box = read("components/AlertBox.jsx");
eq(box.includes("brief = false"), true, "짧은 판이 있다");
eq(box.includes("방해금지 시간"), true, "방해금지 설정은 남는다");
const toggle = read("app/me/PushToggle.jsx");
// 켠 뒤 카드 설명과 똑같은 말을 한 줄 더 붙이면 두 번 읽게 된다
eq(toggle.includes('"이제 숙제가 올라오면 알림이 옵니다."'), false, "같은 말을 두 번 안 한다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 수업 전달사항 · 알림 자리 통과");
