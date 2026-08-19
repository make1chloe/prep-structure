// 루틴 엑셀 읽기 (원장님, 2026-08-14). 한 줄 = 한 수업 회차.
//
// 등원·숙제 칸에는 **학습항목 이름**을 · 나 , 로 이어 적는다.
// 이름은 학습항목에 있는 그대로여야 한다 — 다르면 그 항목만 빠지고,
// 무엇이 빠졌는지 알려준다 (본보기 루틴 buildSteps 와 같은 규칙).

export const RT_HEADERS = ["교재명", "순서", "단계이름", "등원(·로 구분)", "숙제(·로 구분)", "회독(빈칸=전부)"];

const splitNames = (v) =>
  String(v ?? "")
    .split(/[·,;/]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function parseRoutineAoA(aoa = []) {
  const rows = [];
  const problems = [];
  const body = aoa.length && String(aoa[0]?.[0] || "").trim() === "교재명" ? aoa.slice(1) : aoa;
  let lastBook = "";
  body.forEach((r, i) => {
    const line = i + 2;
    // 교재명은 위 줄 것을 이어받는다 — 같은 교재 열 줄에 열 번 안 치게
    const book = String(r?.[0] ?? "").trim() || lastBook;
    const label = String(r?.[2] ?? "").trim();
    const inclass = splitNames(r?.[3]);
    const home = splitNames(r?.[4]);
    if (!book && !label && inclass.length === 0 && home.length === 0) return;   // 빈 줄
    if (!book) {
      problems.push(`${line}줄 — 교재명이 없어요`);
      return;
    }
    lastBook = book;
    if (inclass.length === 0 && home.length === 0) {
      problems.push(`${line}줄(${book}) — 등원도 숙제도 비어 있어요`);
      return;
    }
    const sortRaw = String(r?.[1] ?? "").trim();
    const sort = sortRaw === "" ? null : Number(sortRaw);
    if (sortRaw !== "" && !Number.isFinite(sort)) {
      problems.push(`${line}줄(${book}) — 순서 「${sortRaw}」 는 숫자가 아니에요`);
      return;
    }
    // 회독 (0135) — 빈칸이면 모든 회독, n 이면 n회독부터
    const roundRaw = String(r?.[5] ?? "").trim().replace(/회독.*$/, "");
    const round = roundRaw === "" ? null : Number(roundRaw);
    if (roundRaw !== "" && (!Number.isFinite(round) || round < 1)) {
      problems.push(`${line}줄(${book}) — 회독 「${String(r?.[5]).trim()}」 는 숫자가 아니에요`);
      return;
    }
    rows.push({ book, sort, label, inclass, home, round });
  });
  return { rows, problems };
}
