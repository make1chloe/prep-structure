// 결제선생 등 수납 엑셀 읽기
//
// 서비스마다 열 이름이 다르고, 같은 서비스도 버전마다 바뀐다.
// 그래서 **열 이름을 정확히 맞추라고 요구하지 않는다.** 아래 후보 중 하나만 있으면 읽는다.
// (원장님이 엑셀을 손보게 만들지 않는 것이 목적이다)

import { parseDate } from "./importNotion.js";

function pick(row, keys) {
  for (const k of Object.keys(row)) {
    const key = k.replace(/\s/g, "");
    if (keys.some((c) => key === c || key.includes(c))) {
      const v = row[k];
      if (v !== undefined && v !== null && v.toString().trim() !== "") {
        return v.toString().trim();
      }
    }
  }
  return "";
}

function money(v) {
  const d = (v ?? "").toString().replace(/[^\d-]/g, "");
  return d ? parseInt(d, 10) : null;
}

/** "2026-09" · "2026년 9월" · "9월" · 결제일에서 뽑기 */
function toYM(v, paidOn, fallbackYear) {
  const s = (v ?? "").toString().trim();
  const ym = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  const only = s.match(/^(\d{1,2})\s*월?$/);
  if (only) {
    const y = fallbackYear || new Date().getFullYear();
    return `${y}-${only[1].padStart(2, "0")}`;
  }
  if (paidOn) return paidOn.slice(0, 7);   // 달을 안 적었으면 받은 날의 달로 본다
  return null;
}

// 미납으로 읽어야 하는 말들. 이게 보이면 받은 것으로 치지 않는다
const UNPAID_WORDS = ["미납", "미결제", "미수", "실패", "취소", "환불", "대기"];

/**
 * 수납 엑셀 한 줄 → 저장할 모양
 *
 * 판단 규칙
 *   · 상태 칸에 미납·실패·취소가 있으면 **안 받은 것**
 *   · 받은 날이 있으면 받은 것
 *   · 상태가 완료·결제인데 날짜가 없으면 → 받은 것으로 보되 날짜는 비운다
 */
export function parsePaymentRow(row, fallbackYear) {
  const name = pick(row, ["학생명", "학생이름", "이름", "성명", "학생"]);
  const paidOn = parseDate(pick(row, ["결제일", "납부일", "수납일", "입금일", "결제일시"]), fallbackYear);
  const ym = toYM(pick(row, ["청구월", "수강월", "해당월", "귀속월", "월"]), paidOn, fallbackYear);
  const status = pick(row, ["상태", "결제상태", "납부상태", "수납상태"]);
  const amount = money(pick(row, ["결제금액", "납부금액", "수납액", "금액", "청구금액"]));
  const method = pick(row, ["결제수단", "수단", "결제방법"]);

  const unpaid = UNPAID_WORDS.some((w) => status.includes(w));
  const paid = !unpaid && (!!paidOn || /완료|성공|결제|납부|수납/.test(status));

  return {
    name,
    ym,
    amount,
    method: method || null,
    paidOn: paid ? paidOn : null,
    paid,
    status: status || null,
  };
}
