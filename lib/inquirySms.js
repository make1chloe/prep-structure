/**
 * **신규 문의에 나가는 문자 두 통** (0109).
 *
 * 원장님 (2026-08-07)
 *   「1. 전화옴 / 2. 문자로 설문지 제출할 링크 보내줌
 *    3. 레시간, 상담시간 및 오는 길 안내 문자 보내줘야함」
 *
 * 문구를 만드는 일만 여기 둔다 — 보내는 일과 화면은 따로다. 그래야
 * 「무슨 글이 나가나」 를 검사로 못 박을 수 있다.
 */

import { longLabel } from "./day.js";

const pad = (n) => String(n).padStart(2, "0");

/**
 * 「8월 12일 (수) 오후 5시」 — 날짜만 있으면 날짜만.
 *
 * **요일을 직접 세지 않는다.** `new Date("2026-08-12T00:00:00+09:00").getDay()`
 * 는 **서버가 있는 곳의 시각**으로 요일을 센다. 서버가 UTC 면 그 순간은
 * 아직 8월 11일이라 「화요일」 이 나온다 — 어머니께 가는 문자에 요일이
 * 하루 틀리게 적힌다. 실제로 이 검사에서 그렇게 나왔다.
 *
 * 날짜 글자를 그대로 읽는 lib/day.js 를 쓴다 (앱 전체가 그것을 쓴다).
 */
export function whenText(date, time) {
  if (!date) return "";
  const day = longLabel(date);
  if (!time) return day;
  const [hRaw, m] = time.slice(0, 5).split(":");
  const h = Number(hRaw);
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day} ${ampm} ${h12}시${m && m !== "00" ? ` ${pad(m)}분` : ""}`;
}

/**
 * 문구의 {{빈칸}} 을 채운다.
 *
 * **못 채운 빈칸은 지운다.** 「{{상담일시}}」 가 그대로 적힌 문자가 나가면
 * 어머니는 뭘 보신 건지 알 수가 없다. 지우고 그 줄까지 함께 걷어낸다 —
 * 「부모님 방문상담: 」 만 남는 것도 안 하느니만 못하다.
 */
export function fill(body = "", vars = {}) {
  const lines = body.split("\n");
  const out = [];
  for (const line of lines) {
    let dropped = false;
    const filled = line.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
      const v = vars[k.trim()];
      if (v === undefined || v === null || `${v}`.trim() === "") { dropped = true; return ""; }
      return `${v}`;
    });
    /**
     * **말꼬리가 잘린 줄은 통째로 뺀다.**
     *
     * 「부모님 방문상담: {{상담일시}}」 에서 빈칸을 못 채우면
     * 「부모님 방문상담:」 만 남는다. 글자 수로 세면 여덟 자라 남게 되는데,
     * 그건 어머니께 아무 말도 안 하면서 자리만 차지한다.
     * **빈칸이 줄 끝이었으면** 그 줄은 없던 것으로 한다.
     */
    if (dropped && (/[:：]\s*$/.test(filled) || filled.replace(/[\s:·—\-]/g, "").length < 2)) continue;
    out.push(filled);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 일정 안내에 들어갈 값.
 *
 * **레벨테스트도 상담도 안 잡혔으면 보낼 것이 없다** — 그때는 null 을
 * 돌려주고, 화면이 「먼저 일정을 정해주세요」 라고 말한다. 빈 문자가 나가는
 * 것보다 안 나가는 편이 낫다.
 */
export function guideVars(inq = {}, settings = {}) {
  const test = whenText(inq.test_on, inq.test_at);
  const consult = whenText(inq.consult_on, inq.consult_at) || whenText(inq.visit_on, inq.visit_at);
  if (!test && !consult) return null;
  return {
    학원명: settings.academy?.name || "",
    학생명: inq.name || "",
    레테일시: test,
    상담일시: consult,
    주소: settings.message?.address || "",
    전화: settings.message?.phone || "",
  };
}

export function linkVars(inq = {}, settings = {}, url = "") {
  return {
    학원명: settings.academy?.name || "",
    학생명: inq.name || "",
    링크: url,
  };
}

/** 문구가 없을 때 쓰는 기본 글 — 0109 를 아직 안 돌린 DB 에서도 나가야 한다 */
export const FALLBACK = {
  apply_link:
    "[{{학원명}}] 안녕하세요, 문의 주셔서 감사합니다.\n\n" +
    "아래 링크에서 몇 가지만 적어주시면 상담 준비에 큰 도움이 됩니다.\n{{링크}}\n\n" +
    "빈칸이 있어도 접수되니 아시는 것만 적어주세요.",
  visit_info:
    "[{{학원명}}] {{학생명}} 학생 일정 안내드립니다.\n\n" +
    "레벨테스트: {{레테일시}}\n부모님 방문상담: {{상담일시}}\n\n" +
    "오시는 길: {{주소}}\n문의: {{전화}}\n\n" +
    "레벨테스트는 40~60분 정도 걸립니다. 시간 변경이 필요하시면 편하게 연락 주세요.",
};
