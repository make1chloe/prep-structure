/** (어67) 그림 두 벌 — 원장님 2026-09-16 「단순장식이 아닌 기능이있는 버튼역할의 이모지는 직관적으로 기능을 암시하면서
 *  디자인상에 서로 뚜렷한 차별화가 필요해」.
 *
 *  **장식(FACE)** 과 **기능(ACT)** 은 다른 물건이라 표를 나눈다.
 *   · FACE — 카드·화면의 얼굴. 화면마다 하나씩, 겹치면 카드가 구별이 안 된다.
 *   · ACT  — 단추 위의 그림. **기능이 읽혀야 하고, 두 기능이 같은 그림을 쓰면 안 된다.**
 *
 *  2026-09-16 실측(scripts/check-emoji.mjs): 단추 안의 그림 **119자리·39종** · 그 가운데 이 표를 안 거친 것이 **60자리·26종**
 *  (◀ 🧪 📁 ❗ 📄 ✔ 💰 🔥 ↗ 🚪 🙈 📡 📅 🔄 🔗 📝 📋 ♻ ⚠ 📎 ✉ 🔒 🗑 🌙 🗺 ✨).
 *  같은 그림이 여러 뜻을 맡고 있어 원장님께 「너무 단조로워모두」로 보인 것이다 — 그림이 적어서가 아니라 **서로 안 달라서**다.
 *  래칫은 60 에서 **내려가기만** 한다 — 하나씩 이 표로 옮기고 그때마다 숫자를 내린다(올리지 않는다).
 *
 *  ⚠️ **화살표를 더 만들지 않는다** — 같은 뜻에 이미 두세 벌이라 늘릴수록 헷갈린다.
 *     **때 옮기기(어제·내일·지난달·다음달)는 그림을 떼고 글자+날짜로** 적는다(날짜가 곧 설명이다). 그래서 이 표에 없다.
 *  ⚠️ **숙제 검사 카드는 그림을 아예 안 쓴다**(원장님 「숙제검사는 그냥 이모지쓰지말자」) — 글자 단추 넷으로. */

/** 장식 — 화면·카드의 얼굴. 한 화면에 하나 · 서로 겹치지 않는다 */
export const FACE = Object.freeze({
  dash: "🏠", today: "☀️", send: "📨", schedule: "📅", prep: "🎯", todo: "📋", scores: "🏆",
  books: "📕", students: "🧑‍🎓", files: "📎", settings: "⚙️",
  videos: "🎬", classes: "🏫", exams: "🗓️", grid: "🗃️", inquiry: "🤝", notice: "📢", routine: "🔁",
  access: "🔐", staff: "👤", keys: "🔌", skin: "🎨", progress: "✏️", password: "🔑", monthly: "📊",
  bag: "🎒", myBook: "🛤️", parent: "👨‍👩‍👧", arrive: "🚪", attend: "🙋", unitTest: "✍️",
  memo: "🗒️", past: "📜", fee: "💳", areaMemo: "🗺️", letter: "✉️", late: "🌙", quiz: "🔤",
  cc: "🃏", site: "📡", upload: "📦", stay: "⏳",
  // (어67)-② 한 그림이 여러 뜻을 맡던 것을 갈랐다 — 🏫 은 다섯(학교·반·학원 전체·학원으로·중학교), 📝 는 일곱(시험 기간·영어 시험일·단원평가·다음 시간 시험·내신·직접 출제·첨부)이었다
  school: "🏛️", academy: "🏢",          // 학교(기관) · 학원 전체(기본값) · 반은 위의 classes 🏫
  examTerm: "📝", examEng: "🅰️",        // 시험 기간 · 영어 시험일 · 학교 시험 화면은 위의 exams 🗓️ · 단원평가는 unitTest ✍️ · 다음 시간 시험은 quiz 🔤
  selfMade: "🖊️",                       // 직접 낸 것(이그잼 📄 · 클래스카드 🃏 와 가르는 출처)
});

/** 기능 — 단추 위의 그림. **기능 이름 → 그림** · 두 기능이 같은 그림을 쓰면 check-emoji 가 빨개진다 */
export const ACT = Object.freeze({
  orderUp: "⬆️", orderDown: "⬇️",      // 차례 바꾸기(위·아래)
  colPrev: "⬅️", colNext: "➡️",        // 칸 옮기기(앞·뒤)
  start: "▶️", end: "⏹️",              // 아이 타이머
  skip: "⏭️",                          // 건너뛰기 · 다음 시간으로
  none: "🚫",                          // 안 함
  done: "✅",                          // 다 함 · 완료 · 채점 · 받음
  add: "➕", remove: "➖",              // 더하기 · 빼기(지우지 않는다)
  drop: "📥", restore: "↩️",           // 내리기 · 복구
  edit: "✏️",                          // 고치기
  sms: "📨", push: "🔔", plan: "⏰", preview: "👀",   // 문자 · 앱 알림 · 예약 · 미리보기
  asView: "👁️",                        // 그 사람 화면 보기((어6))
  account: "🔑", moveId: "🔀",          // 계정 발급 · 아이디 옮기기
  upload: "📤", print: "🖨️",           // 올리기 · 인쇄
  fold: "▾", unfold: "▴",              // 접기 · 펴기(숨긴 것 보기도 이것)
  home: "🏠", school: "🏫",            // 집에서 할 숙제로 · 학원에서 할 것으로
});

/** 그림이 겹치나 — 검사와 화면이 같은 셈을 쓴다(원칙-1) */
export const dupes = (table) => {
  const by = new Map();
  for (const [k, e] of Object.entries(table)) { if (!by.has(e)) by.set(e, []); by.get(e).push(k); }
  return [...by].filter(([, ks]) => ks.length > 1).map(([e, ks]) => `${e} ← ${ks.join(" · ")}`);
};
