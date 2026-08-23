/**
 * **잠금화면에 내용이 새지 않나** (2026-08-07)
 *
 * 원장님
 *   「미리보기에서 내용 알 수 없게 해줘. 그냥 공지사항 전달사항.
 *    눌러서 어플 들어와야 알 수 있게」
 *   「뭔가 알림제목이 이상하, from은 뭐야」
 *
 * 알림 미리보기는 **폰을 안 열어도 보인다.** 옆 사람에게도 보이고, 형제
 * 폰에 어머니가 로그인해 두신 집에서는 아이가 보게 된다. 거기 「단어
 * 6/20」 이나 코멘트 첫 줄이 적히면 그건 우리가 흘린 것이다.
 *
 * 이 검사가 지키는 것은 하나다 — **집으로 가는 알림에는 내용이 안 실린다.**
 *
 * 쓰는 법:  node scripts/check-preview.mjs
 */
import { readFileSync } from "node:fs";
import { OPEN_TO_SEE, noticeLabel } from "../lib/notify.js";

let bad = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); bad = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 집으로 가는 알림 ==");
const push = read("app/push/actions.js");
/**
 * **한 군데에서 지운다.** 부르는 곳이 여덟 군데라 각자 조심하게 하면
 * 언젠가 한 곳이 빠지고, 그 한 곳이 사고가 된다.
 */
eq(/pushToFamilies[\s\S]*?body: OPEN_TO_SEE/.test(push), true,
   "학부모·학생 알림은 본문을 지운다");
eq(/pushToStudents[\s\S]*?body: OPEN_TO_SEE/.test(push), true,
   "아이 폰도 마찬가지");
/**
 * 원장님 (2026-08-07) — 「[클로이영어] 공지사항 이거면 됐지」
 *
 * 아이폰이 붙이는 「from ○○」 는 지울 수가 없다. 그러면 **제목 한 줄로**
 * 어디서 온 무슨 알림인지 알 수 있어야 한다.
 */
eq(push.includes("async function withAcademy"), true, "제목 앞에 학원 이름을 붙인다");
eq(/withAcademy\(supabase, payload\)/.test(push), true, "두 문에서 다 붙인다");
// 자취(누가 봤나)에도 지운 본문이 실려야 한다 — 안 그러면 거기서 샌다
eq(push.includes("withReceipts(supabase, subs, safe"), true, "자취에도 지운 것이 실린다");

console.log("\n== 선생님 폰은 그대로 ==");
/**
 * 원장님 폰에는 내용이 보여야 한다 — 무슨 일인지 알아야 답을 하신다.
 * (그 폰은 원장님 것이고, 흘릴 데가 없다)
 */
const staff = push.slice(push.indexOf("export async function pushToStaff"));
eq(staff.includes("pushToAll(keys, subs, payload)"), true, "선생님 알림은 안 지운다");

console.log("\n== 제목으로도 안 샌다 ==");
/**
 * 본문을 감춰도 **제목으로 새면** 감춘 것이 아니다. 공지 알림의 제목은
 * 원장님이 쓰신 첫 줄(`head`) 그대로였다.
 */
/**
 * 오늘 수업의 공지·전달사항은 2026-08-07 에 **알림 자체를 끊었다**
 * (수업 중 얼굴 보고 말할 메모라서). 그래서 여기서 샐 제목도 없어졌다 —
 * 그것을 scripts/check-notice.mjs 가 지킨다.
 *
 * 남아서 알리는 것들의 제목은 **종류 이름**이어야 한다. 본문을 감춰도
 * 제목으로 새면 감춘 것이 아니다.
 */
const resend = read("app/resend/actions.js");
eq(/title: noticeLabel\(k\)/.test(resend), true, "재발송 알림 제목은 종류 이름");
const notices = read("app/report/noticeActions.js");
eq(/const title = noticeLabel\(kind\)/.test(notices), true, "안내 알림 제목도 종류 이름");

console.log("\n== 뭐라고 적히나 ==");
eq(OPEN_TO_SEE, "앱에서 확인해주세요.", "미리보기에 적히는 한 줄");
// 원장님 — 「그냥 공지사항 전달사항」
eq(noticeLabel("notice"), "공지사항", "학부모께 가는 것");
eq(noticeLabel("deliver"), "전달사항", "아이에게 가는 것");
eq(noticeLabel(undefined), "공지사항", "모르는 종류");

console.log("\n== 「from 학부모」 ==");
/**
 * 아이폰은 홈 화면에 담은 앱의 알림에 「제목 — from 〈짧은 이름〉」 을 붙인다.
 * 짧은 이름이 「학부모」 라서 「전달사항 from 학부모」 로 읽혔다 —
 * 어머니가 보내신 것처럼. 어디서 온 알림인지가 거꾸로였다.
 */
const mani = read("app/manifest/[role]/route.js");
/**
 * 학부모·학생은 **자기 앱 하나만** 담는다 — 이름이 겹칠 일이 없다.
 * 그래서 그냥 「클로이영어」 다. 폰이 붙이는 말도 「from 클로이영어」 가 되어
 * 거슬리지 않는다. 원장님만 셋을 담으시니 원장용에만 「원장」 을 붙인다.
 */
eq(/parent: \{ name: "클로이영어", short: "클로이영어"/.test(mani), true,
   "학부모 앱 이름은 학원 이름 그대로");
eq(/student: \{ name: "클로이영어", short: "클로이영어"/.test(mani), true,
   "학생 앱도 마찬가지");
/**
 * 「from 클로이 학부모」 는 여전히 「학부모가 보낸 것」 으로 읽힌다 —
 * 실제로 원장님이 그렇게 읽으셨다. 「…용」 이 붙어야 「학부모용 앱이
 * 받았다」 가 된다. 아이폰이 붙이는 이 말은 **누가 보냈나가 아니라
 * 어느 앱이 받았나**다.
 */
// 「from 학부모」 는 「학부모가 보낸 것」 으로 읽힌다 — 실제로 그렇게 읽으셨다
eq(/short: "(클로이 )?학부모(용)?"/.test(mani), false, "받는 사람 이름이 남아 있으면 안 된다");

console.log("\n== 제출한 것은 원장님께만 ==");
/**
 * 원장님 (2026-08-07) — 「학생·학부모가 제출하면 원장 어플에 떠야지,
 * 그게 왜 학생·학부모한테 떠」
 *
 * 실제로는 그렇게 돌고 있었다 — 「from ○○」 를 보낸 사람으로 읽으신 것이다.
 * 그래도 **그렇게 도는지**는 못 박아 둔다. 여기가 뒤집히면 어머니 폰에
 * 어머니가 보낸 글이 다시 오게 된다.
 */
const req = read("app/requests/actions.js");
const create = req.slice(req.indexOf("export async function createRequest"),
                         req.indexOf("export async function handleRequest"));
eq(/pushToStaff\(/.test(create), true, "제출하면 선생님께 간다");
/**
 * **되돌아오는 메아리만 막는다** (2026-08-23 규칙 다듬기).
 *
 * 원래는 「제출한 집으로는 아예 안 간다」 였다. 그런데 원장님이
 * 「늦게 등원하거나 결석한다고 **학생에게** 알림을 받은 것에 대해 엄마에게
 * 더블체크하기 위한 목적으로 알림을 보내고 싶어」 (2026-08-23) 라고 하셨다.
 *
 * 두 가지는 다른 일이다 —
 *   ① 어머니가 보낸 글이 어머니 폰에 다시 뜨는 것 (막아야 한다)
 *   ② 아이가 보낸 결석을 어머니께 여쭈는 것 (보내야 한다)
 * 그래서 「집으로 가는 것은 **아이가 보낸 것만**」 으로 조인다.
 */
eq(
  !/pushToFamilies\(/.test(create) || /authorRole === "student"/.test(create),
  true,
  "집으로 가는 것은 아이가 보낸 것만 (어머니 글이 되돌아오면 안 된다)"
);
// 답장은 반대로 — 그건 집으로 가야 한다
const handle = req.slice(req.indexOf("export async function handleRequest"));
// 2026-08-21 배치 규칙 — 답장 알림은 queuePush(다음 정각)로 나간다
eq(/(queuePush|pushToFamilies)\(/.test(handle), true, "선생님 답장은 집으로 간다");

console.log("\n== 학부모 화면은 한 줄 ==");
// 왜 켜야 하는지·요금 이야기는 다 맞는 말이지만 첫 화면에서 읽으실 글이 아니다
eq(read("app/parent/page.jsx").includes("<PushToggle onlyWhenOff brief />"), true,
   "어머니 화면에는 짧게");
const toggle = read("app/me/PushToggle.jsx");
eq(toggle.includes('"켜두시길 권합니다."'), true, "권한다는 한 줄");
// 차단은 앱에서 못 푼다 — 이 안내까지 지우면 켤 방법이 없어진다
eq(/brief[\s\S]{0,400}차단되어 있어요/.test(toggle) || toggle.includes("차단되어 있어요"), true,
   "차단된 경우 안내는 짧게 해도 남는다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 잠금화면 미리보기 통과");
