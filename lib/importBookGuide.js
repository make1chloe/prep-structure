// 노션 「교재구매DB」 CSV — 지난 교재 안내 발송 기록을 재원생 교재 배정으로
// 옮긴다 (원장님, 2026-08-14 — 「교재구매안내내역 임포트 달라고 한 거야」).
//
// 노션 줄 하나(교재안내 한 통)에 교재가 여러 권 적혀 있을 수 있다 — 학생
// 하나에 교재 여러 권. 여기서는 그 줄을 교재 수만큼 펼쳐서 (학생, 교재, 날짜)
// 짝으로 만들기만 한다. **학생·교재를 실제 DB 와 맞춰보는 일, 그리고
// 없는 교재를 만들지 않는 일**은 옮기는 쪽(app/import/actions.js
// importBookGuide)이 한다 — 원장님: 「없는 교재는 직접 추가해야 해」.

function findCol(header, names) {
  for (const n of names) {
    const i = header.findIndex((h) => String(h || "").trim() === n);
    if (i >= 0) return i;
  }
  return -1;
}

// 「이름 (https://...)」 형태에서 이름만 뽑는다 — 콤마로 여러 개 이어져도 된다
const LINKED_RE = /([^,()][^,]*?)\s*\(https?:\/\/[^)]*\)/g;
function namesWithLinks(cell) {
  const s = String(cell || "");
  const out = [];
  let m;
  LINKED_RE.lastIndex = 0;
  while ((m = LINKED_RE.exec(s))) {
    const name = m[1].trim();
    if (name) out.push(name);
  }
  return out;
}

// "2025년 8월 18일 오후 5:59" → "2025-08-18"
function koreanDate(v) {
  const m = String(v || "").match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseBookGuideAoA(aoa = []) {
  const rows = [];
  const problems = [];
  if (!aoa.length) return { rows, problems };

  const header = aoa[0].map((h) => String(h || "").trim());
  const iBooks = findCol(header, ["3교재DB", "교재DB"]);
  const iBooksFallback = findCol(header, ["교재수식"]);
  const iName = findCol(header, ["학생이름-메이크"]);
  const iStudentLink = findCol(header, ["3재원생DB", "재원생DB"]);
  const iTitle = findCol(header, ["이름"]);
  const iDate = findCol(header, ["최종 편집 일시", "최종편집일시"]);

  aoa.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (!r || r.every((c) => !String(c || "").trim())) return;   // 빈 줄

    // 학생 이름 — 「학생이름-메이크」 가 제일 확실하고, 없으면 재원생DB
    // 칸(이름+링크)에서, 그것도 없으면 제목(「08/18/월 서지안 교재안내」)에서
    let name = iName >= 0 ? String(r[iName] || "").trim() : "";
    if (!name && iStudentLink >= 0) {
      name = namesWithLinks(r[iStudentLink])[0] || "";
    }
    if (!name && iTitle >= 0) {
      const m = String(r[iTitle] || "").match(/\d{2}\/\d{2}\/\S\s+(\S+)\s*교재안내/);
      if (m) name = m[1];
    }

    // 교재 이름들 — 「3교재DB」 가 제일 확실하고, 없으면 「교재수식」
    // 칸(줄마다 하나, 「✅ 구매링크」 줄 앞까지)에서
    let books = iBooks >= 0 ? namesWithLinks(r[iBooks]) : [];
    if (books.length === 0 && iBooksFallback >= 0) {
      const lines = String(r[iBooksFallback] || "").split("\n").map((s) => s.trim());
      for (const l of lines) {
        if (!l) continue;
        if (l.startsWith("✅")) break;
        books.push(l);
      }
    }

    const date = iDate >= 0 ? koreanDate(r[iDate]) : null;

    if (!name) { problems.push(`${line}줄 — 학생 이름을 못 읽었어요`); return; }
    if (books.length === 0) { problems.push(`${line}줄(${name}) — 교재를 못 읽었어요`); return; }
    if (!date) { problems.push(`${line}줄(${name}) — 날짜를 못 읽었어요`); return; }

    books.forEach((book) => rows.push({ name, book, date }));
  });

  return { rows, problems };
}
