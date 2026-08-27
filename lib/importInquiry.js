import { WEEK_ORDER as DOW } from "./day.js";
/**
 * **신규 문의 옮기기** — 노션 방문상담목록DB (원장님, 2026-08-06 —
 * 「신규문의 방문상담목록은 업로드할 곳이 없어. 그리고 네가 먼저 데이터를
 * 가공해서 업로드해도 될 거 같아」).
 *
 * **한 번 쓰고 마는 코드다.** 노션은 이걸로 끝이고, 앞으로 신규 문의는
 * /consult 에서 쓴다.
 *
 * ── 노션 39열 중에 무엇을 남겼나 ─────────────────────────────
 *
 * 노션 표에는 같은 값이 서너 번씩 들어 있다. 「수업」·「수업시간-롤업」·
 * 「수업시간-메이크」가 같은 글자이고, 「교재-롤업」·「교재-메이크」·
 * 「구매링크」·「구입url-메이크」가 같은 목록이다. 메이크(Make 자동화)용으로
 * 만들어 둔 칸이라 앱에는 필요 없다 — **한 벌만 남긴다.**
 *
 * 「등록작성」·「예약작성」·「등록문자완료」·「예약안내완료」·「티오연락」은
 * 자동화가 어디까지 갔는지 표시하던 Yes/No 다. 그 자동화를 이제 앱이 하므로
 * 옮길 것이 없다. 「응답자」(Chloe/Automation)도 마찬가지다.
 *
 * 남는 것은 **사람과 약속과 이야기**다 —
 *   이름 · 연락처 · 학교/학년 · 방문상담 일시 · 레벨테스트 일시 ·
 *   진행 단계 · 최초상담내용, 그리고 등록까지 간 경우의 등원시작일 ·
 *   수강료 · 반 · 교재.
 *
 * 뒤엣것들은 따로 칸이 없어서 **메모 밑에 한 줄씩 붙인다.** 칸을 새로 파면
 * 옮기고 나서 아무도 안 쓰는 칸이 남는다.
 *
 * ── 조심한 것 ───────────────────────────────────────────────
 *
 * **학교와 학년이 서로 다른 줄이 셋 있었다.** 「대건고1 / 중3」처럼. 원장님께
 * 여쭤보니 **학교 칸이 맞다** (대건고1 · 신정중2). 학년 칸은 나중에 안 고친
 * 것이었다. 그래서 **학교 칸에 학년까지 적혀 있으면 그것을 쓴다.**
 * 계유담만 둘 다 틀려서(연수여고1) 아래 `FIXED` 에 따로 적어둔다.
 *
 * **같은 이름이 다른 사람일 수 있다.** 이민재가 둘인데 번호도 학교도 다르다 —
 * 남남이다. 반대로 오진우·문채현은 번호가 같은 한 사람이 두 줄로 나뉘어 있다.
 * 그래서 **이름만으로 합치지 않는다.** 번호가 같아야 한 사람으로 본다.
 * 그러고도 같은 이름이 남으면 **이민재A · 이민재B** 로 나눠 적는다 (원장님) —
 * 목록에서 이민재가 둘이면 어느 쪽에 적는 것인지 알 수 없다.
 *
 * **이름을 못 물어본 문의가 있다.** 「정상 최상위반」 은 학원 이름과 반 이름을
 * 적어두신 것이지 아이 이름이 아니다. 사람 이름 같지 않으면 **「이름 없음」**
 * 으로 두고 적혀 있던 글자는 메모에 남긴다 (원장님) — 아닌 것을 이름 자리에
 * 두면 목록에서 사람으로 보인다.
 *
 * **레벨테스트와 방문상담은 다른 약속이다** (원장님 — 「수업 구조상 연달아
 * 진행할 수가 없어」). 그래서 날짜가 둘인 것은 겹쳐 적힌 것이 아니라 **약속이
 * 둘**인 것이다. 하나로 합치면 안 된다.
 */

/**
 * 원장님이 짚어주신 정정 (2026-08-06).
 * 노션에도 앱에도 맞는 값이 없는 줄이라, 여기 적어두는 수밖에 없다.
 */
const FIXED = {
  계유담: { school: "연수여고", grade: "고1" },
};

/** 이름 자리에 이름이 아닌 것이 들어온 줄 */
const NO_NAME = "이름 없음";

/** 「화목」 → ["화","목"] */

function s(v) {
  return (v ?? "").toString().trim();
}

/** 노션 관계 칸에서 이름만 — "장원우 (https://…)" → "장원우" */
export function plain(v) {
  const t = s(v);
  if (!t) return "";
  if (t.includes("http")) {
    const m = t.match(/^([^(]+)\(/);
    return m ? m[1].trim() : t.replace(/\s*\(https?:\/\/[^)]*\)/g, "").trim();
  }
  return t;
}

/** 노션 관계 칸을 목록으로 — "A (https://…), B (https://…)" → ["A","B"] */
function listOf(v) {
  const t = s(v);
  if (!t) return [];
  if (t.includes("http")) {
    return [...t.matchAll(/([^,]*?)\s*\(https?:\/\/[^)]*\)/g)].map((m) => m[1].trim()).filter(Boolean);
  }
  return t.split(",").map((x) => x.trim()).filter(Boolean);
}

/** "2025/05/18 오후 3:59 (GMT+9)" · "2025년 6월 13일" · "2025-06-13" → "2025-06-13" */
export function toDate(v) {
  const t = s(v);
  if (!t) return null;
  const m = t.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

/**
 * "오후 3:59" → "15:59".
 *
 * **화살표가 있으면 뒤엣것을 쓴다** — 「오후 4:00 → 오후 8:00」 은 시간을
 * 옮긴 것이라 실제 약속은 8시다. 앞엣것을 쓰면 안 계신 시간으로 남는다.
 */
export function toTime(v) {
  const t = s(v);
  if (!t) return null;
  const all = [...t.matchAll(/(오전|오후)?\s*(\d{1,2}):(\d{2})/g)];
  if (all.length === 0) return null;
  const m = all[all.length - 1];
  let h = Number(m[2]);
  const mi = m[3];
  if (m[1] === "오후" && h < 12) h += 12;
  if (m[1] === "오전" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${mi}`;
}

/** 시간을 옮긴 줄인가 (「→」 가 있으면) */
function moved(v) {
  return /→/.test(s(v));
}

/**
 * "신송중2" · "박문여고 2학년" · "연송고/1학년" · "신송중학교1학년"
 *   → { school: "신송중", grade: "중2" }
 * 못 알아보면 적힌 그대로 학교에 넣고 학년은 비운다 (「옥련2」 처럼).
 */
export function splitSchool(v) {
  const raw = s(v);
  if (!raw) return { school: "", grade: "" };
  const t = raw.replace(/[\s/]/g, "");
  const m = t.match(/^(.+?[초중고])(?:등)?(?:학교)?(\d{1,2})?(?:학년)?$/);
  if (!m) return { school: raw, grade: "" };
  const level = m[1].slice(-1);
  return { school: m[1], grade: m[2] ? `${level}${Number(m[2])}` : "" };
}

/** 01027519837 · 010-9957-9837 → 010-2751-9837. 번호 같지 않으면 버린다 */
export function phoneOf(v) {
  const d = s(v).replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(d)) return null;
  return d.length === 11
    ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
    : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "35만원" · "350000" → "35만원" (메모에 적을 글자) */
export function feeText(v) {
  const t = s(v);
  if (!t) return "";
  if (/만원/.test(t)) return t;
  const n = Number(t.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return t;
  return n >= 10000 ? `${Math.round(n / 10000)}만원` : `${n.toLocaleString()}원`;
}

/** "화목 5:00~7:30" → { days: ["화","목"], start: "17:00" } */
export function classTime(v) {
  const t = s(v);
  if (!t) return { days: [], start: null };
  const days = DOW.filter((d) => t.split(/\s/)[0]?.includes(d));
  const m = t.match(/(\d{1,2})(?::(\d{2}))?/);
  let start = null;
  if (m) {
    let h = Number(m[1]);
    // 학원 수업은 낮 12시~밤 10시 사이다. 「5:00」 은 새벽 5시가 아니라 오후 5시
    if (h < 12) h += 12;
    start = `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
  }
  return { days, start };
}

/**
 * 노션 「재원/미등록」 → 앱의 진행 단계.
 *
 * **레벨테스트가 방문상담보다 먼저다** (원장님 — 둘은 따로 진행하고, 자료를
 * 보면 레테가 하루 이틀 앞선다). 그래서 「방문상담완료」 는 **레테 날짜가
 * 있어도 「상담 완료」** 다 — 상담이 더 멀리 간 것이다. 레테만 잡히고 방문
 * 약속은 아직인 줄이 「레벨테스트」 다.
 *
 *   입학결정      → 등록
 *   방문취소      → 미등록
 *   방문상담완료  → 상담 완료
 *   방문전        → 문의종료면 미등록 / 방문 약속이 있으면 상담 예정 /
 *                   레테만 잡혔으면 레벨테스트 / 아무것도 없으면 신규
 */
export function statusOf(stage, closed, hasVisit, hasTest) {
  const t = s(stage);
  if (t === "입학결정") return "enrolled";
  if (t === "방문취소") return "declined";
  if (t === "방문상담완료") return "consulted";
  if (closed) return "declined";
  if (hasVisit) return "scheduled";
  return hasTest ? "tested" : "new";
}

/** 열 이름 → 우리가 쓸 이름. 노션 표는 열 이름이 정확해서 그대로 찾는다 */
const WANT = {
  이름: ["학생이름", "학생명", "이름"],
  학부모: ["학부모연락처", "학부모 연락처", "부모연락처"],
  학생전화: ["학생연락처", "학생 연락처"],
  학교: ["학교"],
  학년: ["학년"],
  단계: ["재원/미등록", "재원미등록", "상태"],
  종료: ["문의종료"],
  방문: ["부모님방문시간", "방문시간", "방문상담"],
  레테: ["레테시간", "레벨테스트", "레테"],
  내용: ["최초상담내용", "상담내용", "문의내용"],
  등원: ["등원시작일"],
  수강료: ["수강료(+만원)", "수강료"],
  반: ["수업시간-롤업", "수업시간", "수업"],
  교재: ["교재-롤업", "교재"],
  생일: ["생일"],
  주소: ["주소"],
};

function norm(v) {
  return s(v).replace(/\s+/g, "").toLowerCase();
}

function indexOfCol(headers, names) {
  const ks = headers.map(norm);
  for (const n of names) {
    const at = ks.indexOf(norm(n));
    if (at >= 0) return at;
  }
  return -1;
}

/** 「테스트2751」 처럼 시험 삼아 만든 줄 */
function looksTest(name) {
  return /테스트|test|샘플|sample/i.test(name);
}

/**
 * 사람 이름인가 — 한글 두세네 글자.
 * 「정상 최상위반」 은 학원 이름과 반 이름이지 아이 이름이 아니다.
 */
function isPersonName(n) {
  return /^[가-힣]{2,4}$/.test(n);
}

/**
 * CSV·엑셀 한 장 → 신규 문의 줄들.
 *
 * @returns { rows, unknown }
 *   rows[].skip     이 줄은 안 옮긴다 (skipWhy 에 까닭)
 *   rows[].mergedTo 앞줄과 한 사람이라 합쳤다
 */
export function parseInquiryAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { rows: [], unknown: [] };
  const headers = (aoa[0] || []).map((h) => s(h));

  const col = {};
  Object.entries(WANT).forEach(([k, names]) => (col[k] = indexOfCol(headers, names)));
  const used = new Set(Object.values(col).filter((i) => i >= 0));
  const unknown = headers.filter((h, i) => h && !used.has(i));

  const g = (cells, k) => (col[k] >= 0 ? s(cells?.[col[k]]) : "");

  const out = [];
  aoa.slice(1).forEach((cells) => {
    if (!cells || cells.every((c) => !s(c))) return;

    // 이름 뒤의 「임시」 는 원장님 표시지 이름이 아니다
    const rawName = plain(g(cells, "이름"));
    const trimmed = rawName.replace(/\s*(임시|가등록)\s*$/, "").trim();
    if (!trimmed) return;
    // **이름을 못 물어본 문의는 「이름 없음」 으로.** 적혀 있던 글자는 메모에
    // 남는다 — 아닌 것을 이름 자리에 두면 목록에서 사람으로 보인다
    const noName = !isPersonName(trimmed) && !looksTest(trimmed);
    const name = noName ? NO_NAME : trimmed;

    const closed = /^yes$/i.test(g(cells, "종료"));
    const visitRaw = g(cells, "방문");
    const testRaw = g(cells, "레테");
    const consult_on = toDate(visitRaw);
    const test_on = toDate(testRaw);

    // **학교 칸이 이긴다** (원장님 — 대건고1 · 신정중2 가 맞다). 학년 칸은
    // 나중에 안 고친 것이라, 학교에 학년까지 적혀 있으면 그것을 쓴다
    const sc = splitSchool(g(cells, "학교"));
    const gradeCol = s(g(cells, "학년"));
    const fix = FIXED[name];
    const school = fix?.school || sc.school || null;
    const grade = fix?.grade || sc.grade || gradeCol || null;

    const { days, start } = classTime(g(cells, "반"));
    const memoHead = g(cells, "내용");

    // 칸이 없는 것들은 메모 밑에 한 줄로 (칸을 새로 파면 안 쓰는 칸이 남는다)
    const extra = [];
    const startOn = toDate(g(cells, "등원"));
    if (startOn) extra.push(`등원시작 ${startOn}`);
    const fee = feeText(g(cells, "수강료"));
    if (fee) extra.push(`수강료 ${fee}`);
    const born = toDate(g(cells, "생일"));
    if (born) extra.push(`생일 ${born}`);
    const addr = s(g(cells, "주소"));
    if (addr) extra.push(`주소 ${addr}`);
    const books = listOf(g(cells, "교재"));
    if (books.length) extra.push(`교재 ${books.join(", ")}`);
    if (rawName !== name) extra.push(`노션에 「${rawName}」 로 적혀 있던 줄`);
    if (fix) extra.push(`학교·학년은 원장님이 짚어주신 대로 ${fix.school} ${fix.grade}`);

    const memo = [memoHead, extra.length ? `(${extra.join(" · ")})` : ""]
      .filter(Boolean)
      .join("\n") || null;

    out.push({
      name,
      // 재원생과 이을 때 쓴다 — 「이민재A」 로는 못 찾는다
      baseName: name,
      noName,
      phone: phoneOf(g(cells, "학부모")),
      student_phone: phoneOf(g(cells, "학생전화")),
      // 번호 같지 않은 것이 적혀 있었나 (신수민의 「8397」)
      badPhone: !!(s(g(cells, "학생전화")) && !phoneOf(g(cells, "학생전화"))),
      school,
      grade,
      // 학년 칸과 어긋나서 **학교 칸을 쓴** 줄 — 화면에 표시한다
      gradeConflict: !!(gradeCol && sc.grade && gradeCol !== sc.grade),
      fixed: !!fix,
      stage: s(g(cells, "단계")),
      closed,
      status: statusOf(g(cells, "단계"), closed, !!consult_on, !!test_on),
      consult_on,
      consult_at: toTime(visitRaw),
      consultMoved: moved(visitRaw),
      test_on,
      test_at: toTime(testRaw),
      // 「공시연 소개」 처럼 적어두신 것만 짐작한다. 나머지는 비운다
      source: /소개|추천/.test(memoHead) ? "소개" : null,
      sourceGuessed: /소개|추천/.test(memoHead),
      want_days: days,
      want_time: s(g(cells, "반")) || null,
      classDays: days,
      classStart: start,
      memo,
      skip: looksTest(name),
      skipWhy: looksTest(name) ? "시험 삼아 만든 줄로 보여요" : "",
    });
  });

  return { rows: merge(out), unknown };
}

/**
 * **한 사람이 두 줄로 나뉜 것을 합친다.**
 *
 * 번호가 같으면 한 사람이다 (오진우·문채현). 번호가 없는 줄은, 같은 이름이
 * **딱 하나** 있을 때만 그리로 합친다 (최유정) — 이민재처럼 같은 이름이 둘이면
 * 어느 쪽인지 알 수 없으니 **합치지 않고 그냥 둔다.** 남의 상담에 붙는 것보다
 * 두 줄로 남는 편이 낫다.
 *
 * 합칠 때는 **채워진 값이 이긴다.** 빈 줄이 채워진 줄을 지우면 안 된다.
 */
function merge(rows) {
  // **적으신 차례를 지킨다.** 합치느라 줄이 뒤섞이면 미리보기에서 어느 줄이
  // 어디로 갔는지 못 따라가신다
  const out = [];
  const byPhone = new Map();

  rows.forEach((r) => {
    if (r.skip || !r.phone) {
      out.push(r);
      return;
    }
    const key = `${r.name}|${r.phone}`;
    const at = byPhone.get(key);
    if (at) {
      fold(at, r);
      at.merged = (at.merged || 1) + 1;
      return;
    }
    byPhone.set(key, r);
    out.push(r);
  });

  // 번호가 없는 줄은 **같은 이름이 딱 하나일 때만** 그리로 합친다.
  // 「이름 없음」 은 이름이 아니므로 이 규칙에서 뺀다 — 이름을 못 물어본
  // 문의 둘이 한 사람이 되어버린다
  const kept = [...byPhone.values()];
  const left = out.filter((r) => {
    if (r.skip || r.phone || r.noName) return true;
    const same = kept.filter((k) => k.name === r.name);
    if (same.length !== 1) return true;
    fold(same[0], r);
    same[0].merged = (same[0].merged || 1) + 1;
    return false;
  });

  return label(left);
}

/**
 * **합치고도 같은 이름이 남으면 A · B 로 나눠 적는다** (원장님).
 *
 * 이민재가 둘인데 번호도 학교도 다르다. 목록에 「이민재」 가 둘이면 어느 쪽에
 * 적는 것인지 알 수 없다 — 상담 기록이 남의 것에 붙는다.
 * 원래 이름은 `baseName` 에 남겨서 재원생과 이을 때 쓴다.
 */
function label(rows) {
  const count = new Map();
  rows.forEach((r) => {
    if (r.skip || r.noName) return;
    count.set(r.name, (count.get(r.name) || 0) + 1);
  });
  const seen = new Map();
  rows.forEach((r) => {
    if (r.skip || r.noName || (count.get(r.name) || 0) < 2) return;
    const n = (seen.get(r.name) || 0) + 1;
    seen.set(r.name, n);
    r.sameName = true;
    r.name = `${r.baseName}${String.fromCharCode(64 + n)}`;   // A · B · C
  });
  return rows;
}

/** b 의 채워진 값을 a 에 얹는다 (a 가 비어 있을 때만) */
function fold(a, b) {
  const FIELDS = [
    "phone", "student_phone", "school", "grade", "consult_on", "consult_at",
    "test_on", "test_at", "want_time", "source",
  ];
  FIELDS.forEach((f) => {
    if (!a[f] && b[f]) a[f] = b[f];
  });
  if ((!a.want_days || a.want_days.length === 0) && b.want_days?.length) a.want_days = b.want_days;
  if (!a.classStart && b.classStart) { a.classStart = b.classStart; a.classDays = b.classDays; }
  // 진행 단계는 **더 멀리 간 쪽**이 이긴다 (방문전 + 입학결정 → 입학결정)
  const RANK = { new: 0, scheduled: 1, consulted: 2, tested: 3, hold: 1, declined: 1, enrolled: 5 };
  if ((RANK[b.status] ?? 0) > (RANK[a.status] ?? 0)) a.status = b.status;
  if (b.memo && b.memo !== a.memo) a.memo = [a.memo, b.memo].filter(Boolean).join("\n");
}
