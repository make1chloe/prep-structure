/**
 * **교재 정렬** — 무엇을 기준으로 늘어세울까.
 *
 * 원장님 (2026-08-06) — 「교재정렬이 기준이 없어 정렬기능 넣어줘」
 *
 * ── 왜 기준이 없어 보였나 ────────────────────────────────
 *
 * 지금까지는 `created_at desc`, **넣은 순서의 거꾸로**였다. 기계에는 기준이지만
 * 사람에게는 아무 기준이 아니다 — 문법 교재와 단어 교재가 뒤섞이고, 같은 시리즈
 * 1·2·3권이 흩어진다. 「그 단어책 어디 있더라」 를 매번 검색으로 찾게 된다.
 *
 * ── 기본은 「영역 › 이름」 ────────────────────────────────
 *
 * 교재를 찾을 때 머릿속에 먼저 떠오르는 것은 **무슨 영역이냐**다 (단어책을
 * 찾는가, 문법책을 찾는가). 그다음이 이름이다. 그래서 기본값을 그렇게 둔다.
 *
 * 여기에는 **계산만** 둔다 (화면도 DB 도 안 탄다).
 */

/** 영역을 늘 같은 차례로 — 목록을 열 때마다 자리가 바뀌면 못 찾는다 */
export const AREA_ORDER = ["독해", "듣기", "영작", "문법", "단어", "내신"];

/**
 * 레벨을 숫자로 — 「중2」 는 「중10」 보다 앞이고 「고1」 보다 앞이다.
 *
 * 글자로 견주면 **「고1」 이 「중1」 보다 앞에** 온다 (ㄱ < ㅈ). 학년은 글자가
 * 아니라 차례가 있는 값이라, 초 → 중 → 고 로 세어야 한다.
 * 「중1~중3」 처럼 범위로 적힌 것은 **시작 학년**으로 본다.
 */
export function gradeRank(v) {
  const s = (v ?? "").toString().trim();
  if (!s) return Infinity;                       // 안 적은 것은 늘 맨 뒤
  const m = s.match(/(초|중|고)\s*(\d)/);
  if (m) {
    const base = { 초: 0, 중: 10, 고: 20 }[m[1]];
    return base + Number(m[2]);
  }
  // 「예비중」 처럼 숫자가 없는 것 — 학교급만이라도 맞춰준다
  if (s.includes("초")) return 0;
  if (s.includes("중")) return 10;
  if (s.includes("고")) return 20;
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && s !== "" ? n : Infinity;
}

/**
 * 이름 차례 — **엑셀과 같은 차례로.**
 *
 * 원장님은 교재 목록을 늘 엑셀과 견주신다. 엑셀의 한글 정렬은
 * **숫자 → 영문 → 한글** 차례인데, `localeCompare(_, "ko")` 는 그 반대로
 * **한글을 영문 앞에** 둔다 (실제로 「어법끝」 이 「Grammar Build Up」 보다
 * 앞에 왔다). 둘 다 틀린 차례는 아니지만, **원장님이 아는 차례**여야 한다.
 *
 * 그래서 첫 글자가 어느 무리인지로 먼저 가르고, 그다음에 사전 차례로 본다.
 */
const scriptRank = (s) => {
  const c = (s ?? "").toString().trim().charAt(0);
  if (!c) return 9;                                   // 이름 없는 것은 맨 뒤
  if (/[0-9]/.test(c)) return 0;
  if (/[A-Za-z]/.test(c)) return 1;
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)) return 2;
  return 3;                                           // 기호·한자 등
};
export const byName = (a, b) => {
  const x = (a ?? "").toString();
  const y = (b ?? "").toString();
  const d = scriptRank(x) - scriptRank(y);
  return d || x.localeCompare(y, "ko");
};

const areaRank = (v) => {
  const i = AREA_ORDER.indexOf((v ?? "").toString().trim());
  return i < 0 ? AREA_ORDER.length : i;          // 모르는 영역·빈칸은 맨 뒤
};

/**
 * 숫자로 — **빈 것은 0 이 아니라 「없음」 이다.**
 *
 * `Number("")` 는 **0** 이다. 이걸 안 막으면 페이지를 안 적은 교재가 「0쪽」
 * 이 되어, 적은 순으로 늘어세울 때 맨 앞에 몰려 목록을 가린다. 이 앱에서
 * 이미 여러 번 당한 모양이다 (등급컷이 빈칸일 때 `[0]` 이 되던 것과 같다).
 */
const numOf = (v) => {
  const s = (v ?? "").toString().replace(/[^\d.-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const STATUS_ORDER = { active: 0, paused: 1, discontinued: 2 };

/**
 * 고를 수 있는 기준들.
 *
 * **오름/내림을 따로 두지 않는다** — 표의 열 이름을 누르면 뒤집힌다.
 * 여기 있는 것은 「무엇으로」 만이다.
 */
export const BOOK_SORTS = [
  { key: "area", label: "영역 › 이름", hint: "기본 — 찾을 때 영역이 먼저 떠오른다" },
  { key: "name", label: "이름" },
  { key: "target_grade", label: "레벨" },
  { key: "units", label: "단원 수", hint: "안 채운 교재가 위로" },
  { key: "total_pages", label: "페이지" },
  { key: "price", label: "교재비" },
  { key: "status", label: "상태" },
  { key: "created_at", label: "넣은 순서", hint: "예전 차례" },
];

export const DEFAULT_SORT = { key: "area", dir: "asc" };

/**
 * 한 쌍을 견준다. **같으면 늘 이름으로 갈라준다** — 안 그러면 값이 같은 줄들의
 * 차례가 열 때마다 달라져서, 「방금 거기 있었는데」 가 생긴다.
 *
 * @param unitCount { 교재id: 단원수 }  — 단원 수는 교재 줄에 없는 값이라 따로 받는다
 */
function cmp(a, b, key, unitCount = {}) {
  switch (key) {
    case "area": {
      const d = areaRank(a.area) - areaRank(b.area);
      return d || byName(a.name, b.name);
    }
    case "target_grade": {
      const d = gradeRank(a.target_grade) - gradeRank(b.target_grade);
      return d || byName(a.name, b.name);
    }
    case "units": {
      const d = (unitCount[a.id] || 0) - (unitCount[b.id] || 0);
      return d || byName(a.name, b.name);
    }
    case "status": {
      const d = (STATUS_ORDER[a.status || "active"] ?? 9) - (STATUS_ORDER[b.status || "active"] ?? 9);
      return d || byName(a.name, b.name);
    }
    case "total_pages":
    case "price": {
      const x = numOf(a[key]);
      const y = numOf(b[key]);
      // **빈칸은 늘 맨 뒤다** — 뒤집어도 뒤에 남는다. 0원짜리와 안 적은 것은
      // 다른 이야기인데, 안 적은 것을 0 으로 치면 맨 앞에 몰려 목록을 가린다
      if (x == null && y == null) return byName(a.name, b.name);
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y || byName(a.name, b.name);
    }
    case "created_at":
      return (a.created_at || "").localeCompare(b.created_at || "");
    case "name":
    default:
      return byName(a.name, b.name);
  }
}

/**
 * 교재를 늘어세운다.
 *
 * **빈칸은 뒤집어도 맨 뒤에 둔다** (페이지·교재비·레벨). 「페이지 많은 순」 을
 * 눌렀는데 안 적은 교재가 맨 위에 오면 정렬을 누른 보람이 없다.
 */
export function sortBooks(books = [], { key, dir } = DEFAULT_SORT, unitCount = {}) {
  const HAS_BLANKS = ["total_pages", "price", "target_grade"];
  const blank = (t) =>
    key === "target_grade" ? gradeRank(t.target_grade) === Infinity : numOf(t[key]) == null;

  return [...books].sort((a, b) => {
    if (HAS_BLANKS.includes(key)) {
      const ba = blank(a);
      const bb = blank(b);
      if (ba !== bb) return ba ? 1 : -1;         // 방향과 상관없이 빈칸이 뒤
      if (ba && bb) return byName(a.name, b.name);
    }
    const d = cmp(a, b, key, unitCount);
    return dir === "desc" ? -d : d;
  });
}
