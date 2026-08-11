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

/** &amp; 같은 것을 원래 글자로 되돌린다 (글에도 · 주소에도 쓴다) */
function decode(s = "") {
  return String(s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    // &amp; 는 맨 나중에 — 먼저 풀면 「&amp;lt;」 가 두 번 풀린다
    .replace(/&amp;/gi, "&");
}

/** 태그를 걷어내고 사람이 읽는 글만 남긴다 — 줄바꿈은 살린다 */
export function toText(html = "") {
  return decode(String(html)
    // script·style 안의 글은 화면에 안 나오는 것이라 통째로 버린다
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|li|p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * **적어두신 주소들** (원장님, 2026-08-11 — 「페이지에서 2학기를 눌러야
 * 할 수도 있는데」).
 *
 * 한 화면이 한 해를 다 보여주지 않는 학교가 많다. 그래서 주소를 **여러 개**
 * 적어둘 수 있게 한다 (1학기 화면 · 2학기 화면). 줄바꿈·쉼표·빈칸으로 나눈다.
 */
export function splitUrls(s = "") {
  const out = [];
  String(s || "")
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/[),.]+$/, ""))
    .forEach((t) => {
      if (/^https?:\/\/./i.test(t) && !out.includes(t)) out.push(t);
    });
  return out;
}

/** 태그 속성 하나를 꺼낸다 (따옴표가 있든 없든) */
function attr(tag = "", name = "") {
  const m = String(tag).match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  if (!m) return "";
  return decode(m[1] ?? m[2] ?? m[3] ?? "");
}

/** 학기·월을 가리키는 단추인가 — 「2학기」 「10월」 */
const TAB_WORD = /(^|[^\d])(\d\s*학기|\d{1,2}\s*월)([^\d]|$)/;

/**
 * **「2학기」 단추를 찾아 따라갈 주소를 뽑는다.**
 *
 * 학교 홈페이지는 학기·월을 단추로 나눠 놓는 일이 흔하다. 적어두신 주소만
 * 읽으면 **한 학기치만** 들어온다 — 2학기 시험이 통째로 빠진다.
 *
 * 따라갈 수 있는 것은 **주소가 붙은 단추**뿐이다. `javascript:` 로 화면을
 * 바꾸는 단추는 서버가 따라갈 수 없다 — **버리지 말고 이름을 돌려준다.**
 * 그래야 원장님이 「그 화면 주소를 직접 넣어달라」 는 말을 들으실 수 있다.
 *
 * 남의 집(다른 도메인)은 따라가지 않는다.
 *
 * @returns {{ go: [{label, url}], blocked: string[] }}
 */
export function tabLinks(html = "", baseUrl = "") {
  const go = [];
  const blocked = [];
  let base = null;
  try {
    base = baseUrl ? new URL(baseUrl) : null;
  } catch {
    base = null;
  }
  const here = base ? base.toString() : "";
  const seen = new Set(here ? [here] : []);

  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = toText(m[2]).replace(/\n/g, " ").trim();
    if (!label || label.length > 20 || !TAB_WORD.test(label)) continue;
    const href = attr(m[1], "href").trim();
    if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) {
      if (!blocked.includes(label)) blocked.push(label);
      continue;
    }
    let u = null;
    try {
      u = new URL(href, here || undefined);
    } catch {
      u = null;
    }
    if (!u || !/^https?:$/.test(u.protocol)) {
      if (!blocked.includes(label)) blocked.push(label);
      continue;
    }
    // 남의 집은 안 따라간다
    if (base && u.host !== base.host) continue;
    const s = u.toString();
    if (seen.has(s)) continue;
    seen.add(s);
    go.push({ label, url: s });
  }

  /**
   * 학기 단추를 하나라도 찾았으면 **월 단추는 안 따라간다** — 같은 것을 열두
   * 번 부르게 된다. 학기 쪽이 한 번에 더 많이 준다.
   */
  const term = go.filter((x) => /학기/.test(x.label));
  if (term.length) {
    return { go: term, blocked: blocked.filter((b) => /학기/.test(b)) };
  }
  return { go, blocked };
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
