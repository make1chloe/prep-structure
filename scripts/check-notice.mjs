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

console.log("== 적어도 안 울린다 ==");
const act = read("app/today/actions.js");
const make = act.slice(act.indexOf("export async function createNotice"));
const nextFn = make.indexOf("\nexport async function", 10);
const body = nextFn > 0 ? make.slice(0, nextFn) : make;
/**
 * 공지·전달사항은 **어차피 나가는 글에 실려서** 닿는다 —
 *   수업 전달사항 → 교실에서 말로 + 그날 숙제 안내에 함께
 *   공지          → 데일리리포트에 함께
 * 따로 울릴 이유가 없다.
 */
eq(/pushTo/.test(body), false, "공지를 만들 때 알림을 안 보낸다");
// 진짜 지금 알려야 하는 것은 발송 화면의 「안내」 로 보내신다 — 거기는 그대로
eq(read("app/report/noticeActions.js").includes("pushToFamilies"), true,
   "발송 화면의 안내는 그대로 알린다 (보내려고 여는 자리다)");
// 숙제가 올라올 때는 여전히 알린다 — 그건 아이가 집에서 알아야 하는 일이다
eq(act.includes("pushToStudents"), true, "숙제 알림은 그대로");

console.log("\n== 이름 ==");
const top = read("app/today/TopNotices.jsx");
eq(top.includes('label: "수업 전달사항"'), true, "오늘 수업 화면");
eq(top.includes('label: "학생용 공지"'), false, "옛 이름이 남아 있다");
eq(read("app/check/AheadBoard.jsx").includes('"수업 전달사항"'), true, "숙제 검사 화면");
// 「알림은 가지 않는다」 를 화면에도 적어둔다 — 안 적으면 또 보내는 글로 읽는다
eq(/알림은 가지 않고/.test(top), true, "안 울린다는 것을 화면에 적는다");

console.log("\n== 어디에 실려 나가나 ==");
const rt = read("lib/reportText.js");
// 수업 전달사항(학생용) → 숙제 안내에
eq(rt.includes("r.studentNotices"), true, "수업 전달사항은 숙제 안내에 실린다");
// 공지(학부모용) → 데일리리포트에
eq(/notices\.push\(rep\.notice\)/.test(rt), true, "공지는 데일리리포트에 실린다");

console.log("\n== 아이 화면 맨 아래로 ==");
const me = read("app/me/page.jsx");
eq(me.includes("<AlertBox brief />"), true, "짧은 판으로");
/**
 * 맨 위에 있으면 앱을 열 때마다 설명부터 읽게 되고, 정작 「지금 할 것」 이
 * 한 화면 아래로 밀린다. 한 번 켜고 나면 다시 볼 일이 없는 칸이다.
 */
const boxAt = me.indexOf("<AlertBox");
const blocksAt = me.indexOf("blockOrder.map");
eq(boxAt > blocksAt, true, "할 일들보다 아래에 있다");
// 꺼져 있을 때는 AlertGate 가 화면 앞에서 막아선다 — 맨 아래여도 안 놓친다
eq(me.includes("<AlertGate>"), true, "꺼져 있으면 여전히 막아선다");

const box = read("components/AlertBox.jsx");
eq(box.includes("brief = false"), true, "짧은 판이 있다");
eq(box.includes("방해금지 시간"), true, "방해금지 설정은 남는다");
const toggle = read("app/me/PushToggle.jsx");
// 켠 뒤 카드 설명과 똑같은 말을 한 줄 더 붙이면 두 번 읽게 된다
eq(toggle.includes('"이제 숙제가 올라오면 알림이 옵니다."'), false, "같은 말을 두 번 안 한다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 수업 전달사항 · 알림 자리 통과");
