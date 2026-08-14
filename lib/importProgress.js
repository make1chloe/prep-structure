// 진도 엑셀 읽기 (원장님, 2026-08-14 — 「진도 기록도 엑셀로 좀 하고 싶어」).
//
// 한 줄 = 학생 한 명의 교재 하나. 단원 칸에는 **단원 이름**을 · 로 이어 적는다.
// **적힌 단원만 바꾼다** — 안 적은 단원은 안 건드린다 (지우는 용도가 아니다).
// 학생명·교재명은 빈 칸이면 위 줄 것을 이어받는다.

export const PG_HEADERS = ["학생명", "교재명", "완료 단원(·로 구분)", "하는 중(·로 구분)", "페이지"];

const splitNames = (v) =>
  String(v ?? "")
    .split(/[·,;/]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function parseProgressAoA(aoa = []) {
  const rows = [];
  const problems = [];
  const body = aoa.length && String(aoa[0]?.[0] || "").trim() === "학생명" ? aoa.slice(1) : aoa;
  let lastStudent = "";
  let lastBook = "";
  body.forEach((r, i) => {
    const line = i + 2;
    const student = String(r?.[0] ?? "").trim() || lastStudent;
    const book = String(r?.[1] ?? "").trim() || lastBook;
    const done = splitNames(r?.[2]);
    const doing = splitNames(r?.[3]);
    const pageRaw = String(r?.[4] ?? "").trim();
    if (!student && !book && done.length === 0 && doing.length === 0 && !pageRaw) return;
    if (!student) { problems.push(`${line}줄 — 학생명이 없어요`); return; }
    if (!book) { problems.push(`${line}줄(${student}) — 교재명이 없어요`); return; }
    lastStudent = student;
    lastBook = book;
    const page = pageRaw === "" ? null : Number(pageRaw.replace(/[^\d]/g, ""));
    if (pageRaw !== "" && !Number.isFinite(page)) {
      problems.push(`${line}줄(${student}) — 페이지 「${pageRaw}」 는 숫자가 아니에요`);
      return;
    }
    if (done.length === 0 && doing.length === 0 && page === null) return;   // 바꿀 것이 없다
    rows.push({ student, book, done, doing, page });
  });
  return { rows, problems };
}
