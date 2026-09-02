/**
 * 발송 갈래 표와 사람 말 — **글자를 두 벌로 두지 않으려고 여기 한 벌만 둔다** (원칙 1).
 *
 * ⚠️ 이 파일은 **아무것도 안 들여온다.** 화면(클라이언트)과 읽기·쓰기(서버)가 같이 쓰는데,
 *    여기서 `lib/` 을 들여오면 서버 셈이 통째로 브라우저 꾸러미에 실린다.
 *    (`./read.js` 는 `lib/close.js`·`lib/notify.js` 를 들여오므로 화면이 그것을 들여오면 안 된다.)
 *
 * ⚠️⚠️ **제목·본문의 기본값을 여기 두지 않는다.** 데일리·하원은 `lib/push.js` 가 이미 기본 글을
 *    갖고 있고(`sendDaily`·`sendLate`), 안내는 공지 줄 자신이 제목·본문이다.
 *    여기에 또 적으면 문구가 두 벌이 되어 **화면에 보이는 글과 진짜 나가는 글이 갈린다.**
 */

/**
 * 갈래 셋. `tag` 는 **옛 서비스워커 계약서 ② 의 이름 그대로**다.
 * ⚠️ 갈래마다 달라야 한다 — 같은 `tag` 는 앞 통을 **덮고, 오류도 안 난다.**
 *    (`lib/notify.js` 가 아이마다 뒤에 아이디를 한 번 더 붙여 형제 집을 지킨다.)
 * ⚠️ 안내의 `url` 이 `null` 인 것은 일부러다 — `lib/notify.js` 가 **받는 사람 역할에 맞춰**
 *    학부모는 `/parent`, 아이는 `/me` 로 열어 준다. 여기서 하나로 박으면 한쪽이 남의 화면으로 간다.
 */
export const KIND = Object.freeze({
  daily:  { key: "daily",  tag: "send-daily",  name: "데일리리포트", icon: "📨", url: "/parent" },
  late:   { key: "late",   tag: "send-late",   name: "하원",         icon: "🕘", url: "/parent" },
  notice: { key: "notice", tag: "send-notice", name: "안내",         icon: "📢", url: null },
});

/** 화면에 세우는 차례 — **급한 것이 위**다 (§속도 1 · ⑮ 1) */
export const KINDS = Object.freeze(["daily", "late", "notice"]);

/**
 * ⭐ **밖으로 나갈 글 한 통의 모양** — `lib/notify.js` 가 받는 그대로.
 * **안내(공지)에만 쓴다.** 데일리·하원은 `lib/push.js` 가 제 모양을 갖고 있어 이 자리를 안 지난다.
 *
 * ⚠️ **제목에 숫자·성적을 안 싣는다** (계약서 ⑤ — 알림 미리보기는 폰을 안 열어도 옆 사람에게 보이고,
 *    형제 폰에 어머니가 로그인해 두신 집에서는 아이가 본다). 안내의 제목은 **원장님이 적은 그 제목**이다.
 * ⚠️ 본문은 `notify` 가 학부모·아이에게 「앱에서 확인해주세요.」로 갈아 끼운다.
 *    여기서 미리 갈아 끼우지 않는다 — 갈아 끼우는 자리가 두 벌이 되면 언젠가 한 곳이 빠진다.
 */
export function msgFor({ kind, text = {}, targets = [] }) {
  const k = KIND[kind];
  if (!k) throw new Error(`모르는 발송 갈래 「${kind}」`);
  return { kind: k.key, title: text.title, body: text.body, tag: k.tag, url: k.url, targets };
}

/**
 * `lib/` 이 준 글을 화면에 그대로 띄우기 전에 **별표만 뗀다.**
 *
 * ⚠️ `lib/push.js`·`lib/notify.js` 의 안내 글에는 강조 별표(`**…**`)가 들어 있다.
 *    그것은 사람이 코드에서 읽으라고 붙인 표시인데, 화면에 그대로 그리면 **별이 글자로 보인다.**
 * ⚠️ 그렇다고 화면이 그 글을 **다시 쓰지는 않는다** — 다시 쓰면 lib 이 글을 고친 날
 *    화면만 옛말을 한다(원칙 1). **표시만 떼고 뜻은 손대지 않는다.**
 */
export const plain = (s) => String(s ?? "").replace(/\*\*/g, "");

/** 못 나가는 까닭 — **낱말 하나에 글 하나.** 화면이 글자를 또 짓지 않는다 */
export const BLOCK_WHY = Object.freeze({
  no_sheet:     "판이 없습니다 — 오늘 화면에서 출결을 찍어야 판이 섭니다",
  not_closed:   "아직 마감 전입니다 — 지금 보내면 학부모는 「아직 정리 중이에요」만 봅니다",
  already_sent: "이미 보냈습니다 — 다시 보내려면 그 줄의 「다시 보내기」를 눌러야 합니다",
  no_reason:    "남는 까닭이 비어 있습니다 — 그 글이 학부모에게 그대로 갑니다",
  no_title:     "제목이 비어 있습니다",
  no_parent:    "이 아이에게 이어진 학부모 계정이 없습니다 — 보낼 곳이 없습니다",
  hole:         "문구에 안 채운 자리({{…}})가 있습니다 — 보내도 되돌아와 「안 보낸 판」이 됩니다",
});

/** 발송 스위치가 지금 무엇인가 — 글은 여기 한 벌뿐이다 */
export const SINK_SAID = Object.freeze({
  off:  { pill: "pillbad",  what: "꺼짐",      why: "아무 데도 안 나갑니다 — 자취에만 줄이 남습니다" },
  self: { pill: "pillwarn", what: "원장 폰만", why: "아이·학부모 폰으로는 한 발도 안 나갑니다" },
  live: { pill: "pillok",   what: "켜짐",      why: "학부모 폰으로 진짜 나갑니다" },
});
