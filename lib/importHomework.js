// 학습항목 엑셀 읽기 (원장님, 2026-08-14 — 「교재 학습항목이랑 루틴 엑셀로
// 업로드 할 수 있게 해줘」). 입력은 엑셀 양식이 기본이다 (원칙 5-2).
//
// 한 줄 = 학습항목 하나. **이름이 같으면 덮어써진다** (단원 업로드와 같은
// 규칙) — 내려받아 고쳐 다시 올리는 왕복이 되게.

export const HW_HEADERS = ["이름", "분류", "순서", "준비물"];

export function parseHomeworkAoA(aoa = []) {
  const rows = [];
  const problems = [];
  // 머리줄은 건너뛴다 (첫 줄이 「이름」 으로 시작하면 머리줄이다)
  const body = aoa.length && String(aoa[0]?.[0] || "").trim() === "이름" ? aoa.slice(1) : aoa;
  body.forEach((r, i) => {
    const line = i + 2;
    const name = String(r?.[0] ?? "").trim();
    if (!name) return;   // 빈 줄은 조용히 넘어간다
    const category = String(r?.[1] ?? "").trim();
    const sortRaw = String(r?.[2] ?? "").trim();
    const sort = sortRaw === "" ? null : Number(sortRaw);
    if (sortRaw !== "" && !Number.isFinite(sort)) {
      problems.push(`${line}줄 — 순서 「${sortRaw}」 는 숫자가 아니에요`);
      return;
    }
    const tool = String(r?.[3] ?? "").trim();
    rows.push({ name, category, sort, tool });
  });
  return { rows, problems };
}
