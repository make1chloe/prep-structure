/**
 * **학교 홈페이지 학사일정 읽기** (원장님, 2026-08-10 — 「나이스 말고 학교
 * 홈페이지에 등록된 내용으로 기록할 수 없을까? 학교 홈페이지랑 다르다
 * 나이스가」 · 「학교 홈페이지를 넣어놓고 확인해서 긁어오게 할 수는 없어?」).
 *
 * ── 크롬은 필요 없다 ────────────────────────────────────
 *
 * 학교 홈페이지(icems·eduro 등)는 **서버가 HTML 을 다 그려서 보내주는**
 * 옛날식 페이지다. 브라우저를 띄워 자바스크립트를 돌릴 것이 없다 —
 * 주소를 그냥 받아서 글자를 읽으면 된다. 브라우저를 띄우면 느리고, 배포
 * 환경(Vercel)에서는 아예 안 뜨는 일이 흔하다.
 *
 * ── 남의 집 모양에 기대지 않는다 ────────────────────────
 *
 * 학교마다 홈페이지가 다르고, 같은 학교도 개편하면 바뀐다. 그래서 특정
 * 표·칸 이름에 기대지 않고 **「날짜처럼 생긴 것 옆에 붙은 글」** 을 찾는다.
 * 못 읽은 줄은 버리지 않고 그대로 돌려준다 — 조용히 사라지면 원장님이
 * 「없다」 와 「못 읽었다」 를 구별할 수 없다.
 *
 * 여기에는 **읽기만** 둔다 (망을 안 탄다). 받아오는 것은 서버 액션이 한다.
 */

/** 태그를 걷어내고 사람이 읽는 글만 남긴다 — 줄바꿈은 살린다 */
export function toText(html = "") {
  return String(html)
    // script·style 안의 글은 화면에 안 나오는 것이라 통째로 버린다
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|li|p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 날짜처럼 생긴 것 하나를 읽는다.
 *
 * 학교마다 적는 모양이 다르다 —
 *   2026-10-13 · 2026.10.13 · 2026/10/13 · 2026년 10월 13일 · 10.13 · 10/13
 *
 * **해가 안 적힌 것이 흔하다** (달력 화면이라 그 해가 당연해서). 그때는
 * 보고 있는 학년도로 채운다 — 3~12월은 그 해, 1·2월은 다음 해다.
 * 학년도를 안 주면 해 없는 날짜는 못 읽은 것으로 둔다 (지어내지 않는다).
 */
export function readDate(s = "", year = null) {
  const t = String(s).trim();
  let m = t.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  if (!year) return null;
  m = t.match(/(?:^|[^\d])(\d{1,2})\s*[-./월]\s*(\d{1,2})(?!\d)/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // 학년도는 3월에 시작한다 — 1·2월은 다음 해다
  const y = mm >= 3 ? Number(year) : Number(year) + 1;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * 일정 이름에서 군더더기를 턴다 (요일 표시 · 기간 화살표 · 목록 번호).
 *
 * **맨 앞 숫자를 함부로 떼면 안 된다.** 「2학기 중간고사」 의 2 를 목록
 * 번호로 보고 떼어내서 「학기 중간고사」 가 됐다 (2026-08-10 에 겪었다).
 * 번호는 「1.」 「1)」 처럼 **점이나 괄호가 붙어 있을 때만** 번호다.
 */
function cleanTitle(s = "") {
  return String(s)
    .replace(/\(\s*[월화수목금토일]\s*\)/g, " ")
    .replace(/^\s*\d{1,2}\s*[.)]\s+/, "")
    .replace(/^[\s\-–~·|>»]+/, "")
    .replace(/[\s\-–~·|]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * **글에서 「날짜 + 일정 이름」 을 뽑는다.**
 *
 * 한 줄에 둘 다 있는 경우(「2026-10-13 2학기 중간고사」)와, 날짜와 이름이
 * 줄이 갈린 경우(표를 붙여넣으면 흔하다)를 둘 다 받는다.
 *
 * 기간으로 적힌 것(「10.13 ~ 10.16 중간고사」)은 끝날까지 읽는다.
 *
 * @param year 해가 안 적힌 날짜를 채울 학년도 (3월 시작)
 * @returns {{ rows: [{date, endDate, title}], unread: string[] }}
 *   unread — 날짜는 있는데 이름을 못 찾은 줄. **버리지 않고 돌려준다.**
 */
export function readSchedule(text = "", year = null) {
  const lines = String(text).split("\n").map((s) => s.trim()).filter(Boolean);
  const rows = [];
  const unread = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const from = readDate(line, year);
    if (!from) continue;

    // 기간인가 — 「~」 뒤에 날짜가 하나 더 있으면 끝날이다
    let endDate = null;
    const range = line.match(/[~∼-]\s*((?:20\d{2}\s*[-./년]\s*)?\d{1,2}\s*[-./월]\s*\d{1,2})/);
    if (range) {
      const to = readDate(range[1], year);
      if (to && to > from) endDate = to;
    }

    // 같은 줄에서 날짜를 걷어낸 나머지가 이름이다
    let title = cleanTitle(
      line
        .replace(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/g, " ")
        // 「2학기」 의 2 를 날짜로 보면 안 된다 — 월·일 사이 구분자가 있을 때만
        .replace(/(?:^|[^\d])(\d{1,2})\s*[-./]\s*(\d{1,2})(?!\d)/g, " ")
        .replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, " ")
    );

    /**
     * **줄이 갈려 있으면 다음 줄이 이름이다.** 표를 붙여넣으면 날짜 칸과
     * 이름 칸이 각각 한 줄로 떨어진다. 다음 줄이 또 날짜면 이름이 없는
     * 것이니 못 읽은 것으로 둔다 — 지어내지 않는다.
     */
    if (!title && i + 1 < lines.length && !readDate(lines[i + 1], year)) {
      title = cleanTitle(lines[i + 1]);
      i += 1;
    }
    if (!title) { unread.push(line); continue; }
    rows.push({ date: from, endDate, title });
  }

  return { rows, unread };
}
