/**
 * **상담일지 옮기기** — 노션 재원생상담일지DB (원장님, 2026-08-06).
 *
 * 노션에서 내린 CSV 를 **그대로** 올려도 되게 만든다. 내가 중간에 정리한
 * 엑셀도 같은 코드로 읽힌다 — 다음에 또 내보내실 텐데, 그때마다 나에게
 * 정리를 부탁하셔야 하면 옮기는 일이 끝난 게 아니다.
 *
 * ── 규칙 ─────────────────────────────────────────────────────
 *
 * **날짜는 내용에 적힌 것이 이긴다** (원장님).
 *   상담일은 **적어둔 날**이고, 내용 머리의 「10/1)」 은 **있었던 날**이다.
 *   실제로 22줄이 서로 달랐다. 연도는 상담일에서 가져오되, 1월에 적으신
 *   「12/27」 은 전년으로 넘긴다 — 안 그러면 한 해 뒤로 밀린다.
 *
 * **형제 상담은 학생별로 나눈다.**
 *   노션은 한 줄에 학생 여럿을 걸 수 있지만, 앱의 상담일지는 학생 한 명에
 *   붙는다. 나누지 않으면 동생 상담이 형 것으로만 남는다.
 *
 * **학생을 모르면 안 넣는다.**
 *   제목이 「2503」 뿐인 줄이 둘 있었다. 아무에게나 붙이면 남의 상담이 된다.
 *   제목이 「25/06/12 유경민 상담」 이면 거기서 이름을 꺼낸다.
 */

/** 열 이름 후보 — 노션 원본과 내가 정리한 엑셀을 둘 다 받는다 */
const COLS = [
  ["name", ["학생이름", "학생명", "학생", "이름"]],
  ["date", ["날짜", "상담일", "일자"]],
  ["title", ["제목", "title"]],
  ["body", ["상담내용", "내용", "본문"]],
  ["kind", ["상담유형", "종류", "유형"]],
  ["how", ["상담방식", "방식"]],
];

function key(s) {
  return (s || "").toString().replace(/\s+/g, "").toLowerCase();
}

export function mapHeaders(headers = []) {
  const ks = headers.map(key);
  const out = new Array(headers.length).fill(null);
  const taken = new Set();
  for (const [field, names] of COLS) {
    let at = ks.findIndex((h, i) => out[i] === null && names.some((n) => h === key(n)));
    if (at < 0) {
      at = ks.findIndex((h, i) => out[i] === null && h && names.some((n) => h.includes(key(n))));
    }
    if (at >= 0 && !taken.has(field)) {
      out[at] = field;
      taken.add(field);
    }
  }
  return out;
}

/**
 * 노션 관계 칸에서 이름만 꺼낸다.
 *   "공시연 (https://…), 정현우 (https://…)"  →  ["공시연", "정현우"]
 *   "공시연"                                   →  ["공시연"]
 * 내가 정리한 엑셀에는 이름만 있으므로 둘 다 받는다.
 */
export function namesOf(v) {
  const s = (v || "").toString().trim();
  if (!s) return [];
  if (s.includes("https://")) {
    return [...s.matchAll(/([^,]*?)\s*\(https?:\/\/[^)]*\)/g)].map((m) => m[1].trim()).filter(Boolean);
  }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** 「25/06/12 유경민 상담」 에서 이름을 건진다 (관계가 비어 있는 줄) */
export function nameFromTitle(t) {
  const m = (t || "").toString().match(/\d{2}\/\d{2}\/\d{2}\s+(\S+?)\s*상담/);
  return m ? m[1] : "";
}

/** "2025/03/14 오후 1:53 (GMT+9)" · "2025-03-14" · 엑셀 숫자 → "2025-03-14" */
export function toDate(v) {
  const s = (v || "").toString().trim();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) {
    return new Date((Number(s) - 25569) * 86400000).toISOString().slice(0, 10);
  }
  const m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

/**
 * **내용 머리에 적힌 날짜가 이긴다.**
 * @returns { date, from }  from: 'body' | 'field'
 */
export function pickDate(field, body) {
  const base = toDate(field);
  const m = (body || "").toString().match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m || !base) return { date: base, from: "field" };

  const y = Number(base.slice(0, 4));
  const mo = Number(base.slice(5, 7));
  const cm = Number(m[1]);
  // 1~2월에 적으신 11~12월 이야기는 전년이다
  const yy = mo <= 2 && cm >= 11 ? y - 1 : y;
  const date = `${yy}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  return { date, from: date === base ? "field" : "body" };
}

/**
 * CSV·엑셀 한 장 → 상담일지 줄들 (학생별로 나뉜 상태).
 *
 * @returns { rows, unknown }  unknown = 못 읽은 열 이름
 */
export function parseNoteAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { rows: [], unknown: [] };
  const headers = (aoa[0] || []).map((h) => (h ?? "").toString().trim());
  const fields = mapHeaders(headers);
  const unknown = headers.filter((h, i) => h && fields[i] === null);

  const out = [];
  aoa.slice(1).forEach((cells) => {
    const o = {};
    fields.forEach((f, i) => {
      if (f) o[f] = (cells?.[i] ?? "").toString().trim();
    });

    const body = (o.body || "").trim();
    const { date, from } = pickDate(o.date, body);
    if (!date) return;                       // 날짜가 없으면 어디에 놓을지 알 수 없다

    let who = namesOf(o.name);
    if (who.length === 0) {
      const n = nameFromTitle(o.title);
      if (n) who = [n];
    }
    // 학생을 모르면 버린다 — 아무에게나 붙이면 남의 상담이 된다
    if (who.length === 0) return;

    who.forEach((name) => {
      out.push({
        name,
        date,
        dateFrom: from,
        title: (o.title || "").trim() || null,
        body: body || null,
        // 「전화☎️」 처럼 이모지가 붙어 온다 — 한글만 남긴다
        how: (o.how || "").replace(/[^가-힣]/g, "").trim() || null,
        kind: (o.kind || "").trim() || null,
        // 형제 상담을 나눈 줄인가 (화면에 표시해서 늘어난 이유를 알려준다)
        split: who.length > 1,
      });
    });
  });

  return { rows: out, unknown };
}
