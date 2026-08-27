/**
 * **공지 확인 도장 — 판정은 여기 한 벌** (탭 개편 C2, 2026-08-27).
 *
 * NoticeGate(길목)와 학생 화면 일정 탭 배지(안 본 공지 수)가 같은 판정을
 * 써야 한다 — 게이트는 닫혔는데 배지가 켜져 있으면 둘 다 못 믿게 된다.
 *
 * 키는 페이지별(`chloe.noticeSeen.<page>`)이고 **학생별이 아니다** —
 * NoticeGate 가 운영 중인 키라 sid 를 붙이면 전 기기가 재게이트된다.
 * 공용 기기 결함은 현행 NoticeGate 수준으로 수용 (실행계획서 v5 §3-5).
 */

export const keyOf = (page) => `chloe.noticeSeen.${page}`;

/**
 * 공지의 도장 — 「id + 고친 시각」 (원장님 2026-08-14, 고치면 재공지).
 * NoticeGate 의 판정과 같은 것이다.
 */
export const stampOf = (n) => `${n.id}|${n.edited_at || n.editedAt || ""}`;

/** 이 기기에서 아직 확인 안 한 공지만 남긴다 */
export function unseenOf(page, notices = []) {
  let seen;
  try {
    seen = new Set(JSON.parse(localStorage.getItem(keyOf(page)) || "[]"));
  } catch {
    return notices;   // 사파리 비공개 — 못 읽으면 다 안 본 것으로
  }
  return notices.filter((n) => {
    const st = stampOf(n);
    if (seen.has(st)) return false;
    // 옛 형식(맨 id) — 고친 적 없는 공지면 그걸로도 확인한 것으로 친다
    if (!st.split("|")[1] && seen.has(n.id)) return false;
    return true;
  });
}
