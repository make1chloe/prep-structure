/**
 * **성적을 한 장으로 올린다** — 내신 · 문법 단원평가 · 모의고사 (원장님, 2026-08-06).
 *
 * 「성적은 내신, 문법단원평가, 모의고사 한번에 정리하고 싶은데 가능할까」
 *
 * 된다. 셋은 이미 **한 표(scores)** 에 들어간다 — 종류(kind)만 다르다.
 * 없던 것은 한 번에 올리는 길뿐이었다.
 *
 * ── 만드는 규칙 ─────────────────────────────────────────────
 *
 * **열 이름을 맞추라고 하지 않는다.** 학교마다·사이트마다 다르고, 원장님이
 * 엑셀을 손보게 만들면 그 순간부터 안 쓰시게 된다 (수납 이관에서 배운 것).
 * 비슷하면 읽고, 못 읽은 열은 그냥 버린다.
 *
 * **종류를 안 적어도 짐작한다.** 한 장에 섞어 적는 것이 목적인데 줄마다
 * 「내신」 을 쳐야 하면 한 장으로 만든 뜻이 없다.
 *   백분위가 있거나 학평·모평·수능이라 적혔으면  → 모의고사
 *   중간·기말이라 적혔으면                      → 내신
 *   Unit·단원·문법이라 적혔으면                 → 단원평가
 *   그래도 모르면                               → 내신 (제일 흔하다)
 *
 * 짐작한 것은 **짐작했다고 화면에 표시한다.** 조용히 정해버리면 나중에
 * 모의고사가 내신에 섞여 있는 것을 아무도 모른다.
 */

/** 열 이름 후보 — 앞엣것이 더 정확한 이름이다 */
const COLS = [
  ["name", ["학생명", "학생", "이름", "성명", "name"]],
  ["kind", ["종류", "구분", "시험종류", "유형", "kind"]],
  ["term", ["시험명", "시험", "회차", "학기", "term", "단원"]],
  ["taken_on", ["응시일", "시험일", "날짜", "본날", "date"]],
  ["raw_score", ["원점수", "점수", "score", "득점"]],
  ["full_score", ["만점", "총점", "배점"]],
  ["grade", ["등급", "grade"]],
  ["percentile", ["백분위", "percentile"]],
  ["rank_in", ["석차", "등수", "rank"]],
  ["rank_of", ["전체인원", "인원", "재적", "전체"]],
  ["school", ["학교", "school"]],
  ["cuts", ["등급컷", "컷", "cuts"]],
  ["subject", ["과목", "subject"]],
  ["note", ["메모", "비고", "note"]],
];

function key(s) {
  return (s || "").toString().replace(/\s+/g, "").toLowerCase();
}

/**
 * 머리줄을 우리 이름으로 옮긴다.
 *
 * **더 정확한 짝을 먼저 잡는다.** 「전체인원」 을 「전체」 로 먼저 잡아버리면
 * 「전체」 라는 다른 열이 왔을 때 자리를 빼앗는다. 그래서 완전히 같은 것을
 * 한 바퀴 먼저 돌고, 그다음에 포함 관계를 본다.
 */
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

/** 「2026-03-12」 「2026.3.12」 「26/3/12」 를 한 모양으로 */
export function toDate(v, fallbackYear) {
  const s = (v || "").toString().trim();
  if (!s) return null;
  // 엑셀이 날짜를 숫자로 준 것 (1900-01-01 부터의 날 수)
  if (/^\d{5}$/.test(s)) {
    const ms = (Number(s) - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = s.match(/(\d{2,4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) {
    let [, y, mo, d] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // 연도 없이 「3/12」 만 적힌 것 — 고른 연도를 붙인다
  const md = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (md && fallbackYear) {
    return `${fallbackYear}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  }
  return null;
}

function num(v) {
  const s = (v || "").toString().replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cutsOf(v) {
  return (v || "")
    .toString()
    .split(/[,\s/·]+/)
    // **빈 칸을 먼저 버린다.** Number("") 는 0 이라, 안 적은 등급컷이
    // [0] 으로 들어가서 「1등급컷 0점」 이 된다. 화면에는 멀쩡히 뜬다
    .filter((x) => x.trim() !== "")
    .map(Number)
    .filter(Number.isFinite);
}

/**
 * **무슨 시험인가.**
 * @returns { kind, guessed }  guessed = 우리가 짐작한 것인가
 */
export function kindOf(row) {
  const said = key(row.kind);
  if (said) {
    if (/모의|학평|모평|수능|mock/.test(said)) return { kind: "mock", guessed: false };
    if (/단원|문법|unit/.test(said)) return { kind: "unit", guessed: false };
    if (/내신|학교|중간|기말|school/.test(said)) return { kind: "school", guessed: false };
  }

  // 안 적었으면 나머지 칸을 보고 짐작한다
  const term = key(row.term);
  if (row.percentile != null || /학평|모평|수능|모의/.test(term)) {
    return { kind: "mock", guessed: true };
  }
  if (/unit|단원|문법|chapter/.test(term)) return { kind: "unit", guessed: true };
  if (/중간|기말/.test(term)) return { kind: "school", guessed: true };
  return { kind: "school", guessed: true };
}

/**
 * 엑셀 한 장 → 성적 줄들.
 *
 * @param aoa   배열의 배열 (첫 줄이 머리줄)
 * @param year  연도 없이 「3/12」 만 적힌 날짜에 붙일 해
 * @returns { rows, headers, fields, unknown }
 *          unknown = 못 읽은 열 이름 (화면에 그대로 보여준다 — 뭘 버렸는지
 *          알려주지 않으면 「점수가 왜 안 들어갔지」 를 혼자 알아내셔야 한다)
 */
export function parseScoreAoA(aoa, year) {
  if (!Array.isArray(aoa) || aoa.length < 2) {
    return { rows: [], headers: [], fields: [], unknown: [] };
  }
  const headers = (aoa[0] || []).map((h) => (h ?? "").toString().trim());
  const fields = mapHeaders(headers);
  const unknown = headers.filter((h, i) => h && fields[i] === null);

  const rows = aoa.slice(1)
    .map((cells) => {
      const o = {};
      fields.forEach((f, i) => {
        if (f) o[f] = (cells?.[i] ?? "").toString().trim();
      });
      if (!(o.name || "").trim()) return null;

      const parsed = {
        name: o.name.trim(),
        term: (o.term || "").trim() || null,
        taken_on: toDate(o.taken_on, year),
        raw_score: num(o.raw_score),
        full_score: num(o.full_score),
        grade: num(o.grade),
        percentile: num(o.percentile),
        rank_in: num(o.rank_in),
        rank_of: num(o.rank_of),
        school: (o.school || "").trim() || null,
        cuts: cutsOf(o.cuts),
        subject: (o.subject || "").trim() || "영어",
        note: (o.note || "").trim() || null,
        kind: o.kind || "",
      };
      const { kind, guessed } = kindOf(parsed);
      parsed.kind = kind;
      parsed.guessed = guessed;

      // 점수도 등급도 백분위도 없으면 빈 줄이다 — 넣어봐야 아무것도 안 보인다
      const empty =
        parsed.raw_score == null && parsed.grade == null && parsed.percentile == null;
      parsed.empty = empty;
      return parsed;
    })
    .filter(Boolean);

  return { rows, headers, fields, unknown };
}
