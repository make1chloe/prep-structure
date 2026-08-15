// 안내 문자 변수 채우기 — **한 곳** (원칙 1).
//
// 발송 안내 화면(NoticeSender)과 「보낼 것」 화면·예약 발송이 같은 셈을
// 쓴다. 따로 두면 화면마다 교재비가 다르게 나온다.

import { longLabel, todaySeoul } from "./day";

/**
 * 자동으로 채울 수 있는 변수 — 학생 정보에서 나온다.
 *
 * **교재는 학생에게 배정된 것이 아니라 「이번에 안내할 것」이다.**
 * 교재 안내는 아직 안 산 책을 사달라고 보내는 문자라, 이미 배정된 것을
 * 넣으면 갖고 있는 책을 또 사라고 보내게 된다. 그래서 고른 책(books)을
 * 그대로 받아서 목록·교재비·링크를 한 곳에서 셈한다.
 */
export function autoMap(r, academy, msg, books = []) {
  const today = longLabel(todaySeoul());
  const price = books.reduce((a, b) => a + (Number(b.price) || 0), 0);
  return {
    학원명: academy,
    학생명: r.name || "",
    날짜: r.testOn || today,
    교재목록: books.map((b) => `· ${b.name}`).join("\n") || "(배정된 교재 없음)",
    교재비: price ? `${price.toLocaleString()}원` : "(미정)",
    // 여러 권이면 **전권** — 첫 권만 나가면 나머지 링크가 통째로 유실된다 (값-지도 P0-4)
    구매링크:
      books.filter((b) => b.url).map((b) => (books.length > 1 ? `${b.name}: ${b.url}` : b.url)).join("\n") ||
      "(링크 없음)",
    테스트결과: r.testResult || "",
    학원주소: msg?.address || "",
    학원전화: msg?.phone || "",
  };
}

/** 본문에서 자동으로 못 채우는 변수 이름들 — 보내기 전에 입력칸으로 뜬다 */
export function askedVars(body, r, academy, msg) {
  const auto = autoMap(r || {}, academy, msg, []);
  const out = [];
  (body || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    const key = k.trim();
    if (!(key in auto) && !out.includes(key)) out.push(key);
    return "";
  });
  return out;
}

/** {{변수}} 를 실제 값으로 바꾼다. extra 는 내가 직접 채운 값 */
export function fill(body, r, academy, msg, extra = {}, books = []) {
  const map = { ...autoMap(r, academy, msg, books), ...extra };
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    const key = k.trim();
    const v = map[key];
    return v === undefined || v === "" ? `{{${key}}}` : v;
  });
}
