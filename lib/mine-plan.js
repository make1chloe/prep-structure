/** (어72) 아이가 제 **빈 칸**을 채운다 — 판단 한 벌(순수).
 *  원장님 2026-09-17: 「학생어플에서 학생이 직접 재원생정보의 비어있는 칸을 채울 수 있게 해줘 …
 *  모두 내가 설정페이지에서 켰을때 그리고 칸이 비어있을때만.」 · 「아 그럼 반은 빼」 · 「알겠어 그러면학교도 빼」
 *  조건은 **둘 다**(and) 걸려야 한다 — 원장님이 켠 칸이고 **그리고** 그 칸이 비었을 때.
 *  ⚠️ 교재 진도 체크는 여기 없다 — 이미 설정 › ✎ 진도 체크에서 아이마다 정하신다(students.progress_edit · 0008). 두 벌로 안 만든다(원칙-1). */
const digits = (s) => String(s ?? "").replace(/[^0-9]/g, "");

/** 채울 칸 다섯 — [열쇠, 규칙 열쇠, 화면 이름, 입력 갈래]. 화면·손·검사가 이 한 줄을 같이 본다 */
export const FILL = Object.freeze([
  ["parent_phone", "me.fill.parent_phone", "학부모 전화번호", "tel"],
  ["phone", "me.fill.phone", "내 전화번호", "tel"],
  ["grade", "me.fill.grade", "학년", "grade"],
  ["birth", "me.fill.birth", "생년월일", "date"],
  ["cc", "me.fill.cc", "클래스카드 아이디", "text"],
]);
export const FILL_KEYS = Object.freeze(FILL.map(([k]) => k));
export const RULE_KEYS = Object.freeze(FILL.map(([, rk]) => rk));
export const fillName = (k) => FILL.find(([x]) => x === k)?.[2] ?? k;
/** 규칙 줄의 값 — 켜짐은 「on」 하나뿐이다(없으면 꺼짐 · 기본이 꺼짐이라 안 켜면 카드가 아예 없다) */
export const isOn = (rules, ruleKey) => String(rules?.[ruleKey] ?? "off").trim() === "on";
/** 그 칸이 비었나 — 칸마다 뜻이 다르다. 클래스카드는 **줄 자체가 없는 것**이 빈 것이다 */
export const isEmpty = (st, cc, k) => (k === "cc" ? !cc?.cc_user_idx : st?.[k] === null || st?.[k] === undefined || String(st?.[k]).trim() === "");
/** 아이에게 보일 칸 — 켠 것 **그리고** 빈 것만. 하나도 없으면 카드를 아예 안 그린다 */
export const fillFields = (st, cc, rules) =>
  FILL.filter(([k, rk]) => isOn(rules, rk) && isEmpty(st, cc, k)).map(([key, , name, kind]) => ({ key, name, kind }));
/** 이미 찬 칸 — 아이는 보기만 한다(고치는 것은 원장님 몫 · 대전제-0 화면이 감추지 않는다) */
export const filledLines = (st, cc) =>
  FILL.filter(([k]) => !isEmpty(st, cc, k)).map(([key, , name]) => ({ key, name, text: key === "cc" ? String(cc?.cc_user_idx ?? "") : String(st?.[key] ?? "") }));

/** 적어 낸 값 읽기 — 꼴이 틀리면 던진다(조용히 안 저장한다). 클래스카드는 lib/cc.js parseCcIdx 한 곳(원칙-1) */
export function parseFill(key, raw, today = "") {
  if (key === "phone" || key === "parent_phone") {
    const d = digits(raw); if (d.length < 10 || d.length > 11) throw new Error("전화번호는 숫자 10~11자리");
    return d;
  }
  if (key === "grade") {
    const g = Number(String(raw ?? "").trim()); if (!Number.isInteger(g) || g < 1 || g > 6) throw new Error("학년은 1~6");
    return g;
  }
  if (key === "birth") {
    const s = String(raw ?? "").trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("생년월일 꼴은 2015-03-21");
    if (today && s > today) throw new Error("생년월일이 앞날");
    if (Number(s.slice(0, 4)) < 1980) throw new Error("생년월일 해가 1980 앞");
    return s;
  }
  throw new Error(`채울 칸이 아님: ${key}`);
}
