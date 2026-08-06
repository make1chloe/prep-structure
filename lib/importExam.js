/**
 * **성적 옮기기** — 노션 두 표 (원장님, 2026-08-06).
 *
 *   3단원평가DB        125줄  문법 단원평가 (단원 · 통과/재시험 · 점수)
 *   모의고사오답분석DB    11줄  문항별 오답 (틀린 번호 · 왜 틀렸나)
 *
 * **한 번 쓰고 마는 코드다.** 노션은 이걸로 끝이다.
 *
 * ── 단원평가에서 조심한 것 ───────────────────────────────
 *
 * **같은 학생·같은 단원이 여러 번 나온다.** 재시험 → 통과가 한 쌍이라
 * 「문장의 형식」 이 왕희연에게만 다섯 번 있다. 이것은 중복이 아니라
 * **기록**이다 — 몇 번 만에 통과했는지가 그 아이를 말해준다. 그래서
 * **날짜까지 같아야 한 건**으로 본다.
 *
 * **점수 칸이 「67점 (-10/30문제)」 이다.** 숫자가 아니라 글자다.
 * 앞의 숫자만 떼어 쓰고, 틀린 개수·전체 문항수는 따로 칸이 있다.
 *
 * **틀린 개수가 12.5 인 줄이 있다** (부분점수). 정수로 반올림하면 점수와
 * 안 맞으므로 그대로 둔다.
 *
 * ── 오답분석에서 조심한 것 ───────────────────────────────
 *
 * **실제총점수와 제출한 점수가 다르다.** 아이가 적어 낸 것(제출)과 원장님이
 * 매긴 것(실제)이다. 성적에는 **실제**를 쓰고, 어긋난 줄은 화면에 표시한다 —
 * 「선생님 점수를 잘못 체크해서 알려드린 것 같아요」 라고 적어 보낸 아이가
 * 실제로 있었다.
 *
 * **틀린 번호를 세 가지 모양으로 적으셨다.**
 *   "14,21,24"  ·  "21 22 23"  ·  "1,3,8,18 번"
 * 못 읽으면 그 아이 오답이 통째로 사라지므로 숫자만 골라낸다.
 *
 * **한 문항에 이유가 둘일 수 있다** ("단어를 몰랐어요, 해석을 못했어요").
 * 적힌 그대로 둔다 — 하나로 줄이면 어느 쪽을 버릴지 우리가 정하게 된다.
 */

import { parseWrongNos } from "./examSpec.js";

function s(v) {
  return (v ?? "").toString().trim();
}

/** 노션 관계 칸에서 이름만 — "양정호 (https://…)" → "양정호" */
export function nameOf(v) {
  const t = s(v);
  if (!t) return "";
  if (t.includes("http")) {
    const m = t.match(/^([^(]+)\(/);
    return m ? m[1].trim() : t.replace(/\s*\(https?:\/\/[^)]*\)/g, "").trim();
  }
  return t;
}

/** "2025/06/03" · "2025년 6월 3일 오전 11:23" → "2025-06-03" */
export function toDate(v) {
  const t = s(v);
  if (!t) return null;
  const m = t.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

/** 「67점 (-10/30문제)」 → 67 */
export function pointOf(v) {
  const t = s(v);
  if (!t) return null;
  // 「100-2-20-15=63」 처럼 계산식을 적어 놓으신 줄이 있다 → = 뒤엣것
  const eq = t.match(/=\s*(\d+(?:\.\d+)?)/);
  if (eq) return Number(eq[1]);
  const m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** 「제목」 에서 이름을 건진다 — "김서은-26/03/24" · "07/30/수 양정호 통과" */
export function nameFromTitle(t) {
  const raw = s(t);
  let m = raw.match(/^([가-힣]{2,4})\s*-\s*\d/);
  if (m) return m[1];
  m = raw.match(/\d{2}\/\d{2}\/\S\s+([가-힣]{2,4})\s/);
  return m ? m[1] : "";
}

function pick(headers, names) {
  const key = (x) => s(x).replace(/\s+/g, "").toLowerCase();
  const ks = headers.map(key);
  for (const n of names) {
    const at = ks.indexOf(key(n));
    if (at >= 0) return at;
  }
  for (const n of names) {
    const at = ks.findIndex((h) => h && h.includes(key(n)));
    if (at >= 0) return at;
  }
  return -1;
}

/* ════════════════════════════════════════════════════════════
   단원평가
   ════════════════════════════════════════════════════════════ */

export function parseUnitAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { rows: [], unknown: [] };
  const H = (aoa[0] || []).map((h) => s(h));
  const col = {
    name: pick(H, ["3재원생DB", "학생이름-메이크", "학생이름", "학생명", "이름"]),
    title: pick(H, ["제목"]),
    unit: pick(H, ["단원명", "단원"]),
    state: pick(H, ["상태"]),
    date: pick(H, ["날짜"]),
    made: pick(H, ["생성 일시", "생성일시"]),
    wrong: pick(H, ["틀린문제수", "틀린 문제수"]),
    total: pick(H, ["전체문항수", "전체 문항수"]),
    point: pick(H, ["점수"]),
  };
  const used = new Set(Object.values(col).filter((i) => i >= 0));
  const unknown = H.filter((h, i) => h && !used.has(i));
  const g = (c, k) => (col[k] >= 0 ? s(c?.[col[k]]) : "");

  const out = [];
  (aoa.slice(1) || []).forEach((c) => {
    if (!c || c.every((x) => !s(x))) return;

    let name = nameOf(g(c, "name"));
    if (!name) name = nameFromTitle(g(c, "title"));
    const unit = g(c, "unit");
    // **날짜가 빈 줄이 둘 있다** — 적어둔 날(생성 일시)로 대신한다.
    // 버리면 그 아이 단원 기록에 구멍이 난다
    const date = toDate(g(c, "date")) || toDate(g(c, "made"));

    const wrong = Number(g(c, "wrong"));
    const total = Number(g(c, "total"));
    const point = pointOf(g(c, "point"));
    const passed = g(c, "state") === "통과";

    out.push({
      name,
      unit,
      date,
      state: g(c, "state") || null,
      passed,
      wrongCount: Number.isFinite(wrong) ? wrong : null,
      total: Number.isFinite(total) && total > 0 ? total : null,
      point,
      // 못 옮기는 줄과 그 까닭 (감추지 않는다)
      skipWhy: !name ? "학생을 못 찾았어요" : !date ? "날짜가 없어요" : !unit ? "단원명이 없어요" : "",
    });
  });

  return { rows: out, unknown };
}

/* ════════════════════════════════════════════════════════════
   모의고사 오답분석
   ════════════════════════════════════════════════════════════ */

/** 「26년 3월 고1 모의고사」 → 그대로. 비어 있으면 날짜로 만든다 */
function termOf(title, date) {
  const t = s(title);
  if (t) return t;
  if (!date) return "모의고사";
  const [y, m] = date.split("-");
  return `${y.slice(2)}년 ${Number(m)}월 모의고사`;
}

export function parseWrongAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { rows: [], unknown: [] };
  const H = (aoa[0] || []).map((h) => s(h));

  const col = {
    name: pick(H, ["이름"]),
    title: pick(H, ["제목"]),
    term: pick(H, ["시험제목", "시험명"]),
    date: pick(H, ["시험본 날짜", "시험일", "날짜"]),
    grade: pick(H, ["학년"]),
    nos: pick(H, ["틀린 문제 번호", "틀린문제번호"]),
    real: pick(H, ["실제총점수", "실제 총점수"]),
    said: pick(H, ["제출한 점수", "제출점수"]),
    good: pick(H, ["이번 시험에서 내가 잘한 점", "잘한 점"]),
    bad: pick(H, ["이번 시험에서 부족했던 점", "부족했던 점"]),
    word: pick(H, ["기타 선생님에게 하고 싶은 말", "하고 싶은 말"]),
  };

  // **「N번 틀린 이유」 열이 45개 흩어져 있다.** 노션이 이름 차례로 늘어놓아서
  // 10번이 1번보다 앞에 온다. 열 이름에서 번호를 뽑아 제자리에 놓는다
  const reasonAt = new Map();
  H.forEach((h, i) => {
    const m = h.match(/^(\d{1,2})번\s*틀린\s*이유/);
    // 「9번 틀린 이유 (1)」 같은 겹친 열이 있다 — 앞엣것을 쓴다
    if (m && !reasonAt.has(Number(m[1]))) reasonAt.set(Number(m[1]), i);
  });

  const used = new Set([...Object.values(col).filter((i) => i >= 0), ...reasonAt.values()]);
  const unknown = H.filter((h, i) => h && !used.has(i));
  const g = (c, k) => (col[k] >= 0 ? s(c?.[col[k]]) : "");

  const out = [];
  (aoa.slice(1) || []).forEach((c) => {
    if (!c || c.every((x) => !s(x))) return;

    const name = g(c, "name") || nameFromTitle(g(c, "title"));
    const date = toDate(g(c, "date"));
    const real = pointOf(g(c, "real"));
    const said = pointOf(g(c, "said"));

    /**
     * **틀린 번호 칸이 이긴다.**
     *
     * 노션 폼에는 두 곳에 답이 있다 — 「틀린 문제 번호」 와 「N번 틀린 이유」.
     * 열한 줄을 맞춰보니 **여섯 줄은 똑같고 넷은 한 칸씩 어긋나 있었다**
     * (공시연 23↔22 · 구도은 29↔28 · 노주하 10,43↔7). 아이가 이유를 옆
     * 칸에 적은 것이다. 노션이 세어둔 듣기·독해 오답 개수와 견줘보니
     * **번호 칸 쪽이 맞았다.**
     *
     * 그래서 둘을 합치지 않는다. 합치면 그 넷의 오답이 하나씩 늘어나고,
     * 없는 문항이 「틀렸다」 로 남는다.
     *
     * **다만 번호 칸이 통째로 빈 줄이 있다** (김서은 25/11/04 — 이유만 13개).
     * 그때만 이유가 적힌 번호를 쓴다. 안 그러면 그 회차가 「다 맞음」 이 된다.
     *
     * 어긋난 것은 **버리지 않고 화면에 적어준다** — 아이에게 물어보실 수 있게.
     */
    const listed = parseWrongNos(g(c, "nos"));
    const reasoned = [...reasonAt.entries()]
      .filter(([, at]) => s(c?.[at]))
      .map(([no]) => no)
      .sort((a, b) => a - b);

    const nos = listed.length > 0 ? listed : reasoned;
    const items = nos.map((no) => ({
      no,
      wrong: true,
      reason: reasonAt.has(no) ? s(c[reasonAt.get(no)]) || null : null,
    }));

    // 번호에는 있는데 이유가 없는 것 · 이유만 있고 번호에 없는 것
    const noReason = listed.length > 0 ? listed.filter((n) => !reasoned.includes(n)) : [];
    const orphan = listed.length > 0 ? reasoned.filter((n) => !listed.includes(n)) : [];

    const self = [
      g(c, "good") && `잘한 점: ${g(c, "good")}`,
      g(c, "bad") && `부족했던 점: ${g(c, "bad")}`,
      g(c, "word") && `하고 싶은 말: ${g(c, "word")}`,
    ].filter(Boolean).join("\n");

    out.push({
      name,
      date,
      term: termOf(g(c, "term"), date),
      grade: g(c, "grade") || null,
      point: real ?? said,
      said,
      // 아이가 적어 낸 점수와 원장님이 매긴 점수가 다른 줄
      mismatch: real != null && said != null && real !== said,
      nos,
      items,
      // 번호 칸은 비었는데 이유로 알아낸 줄 (왜 번호가 생겼는지 알려준다)
      fromReasons: listed.length === 0 && reasoned.length > 0,
      // 번호와 이유가 어긋난 줄 — 아이에게 물어보셔야 한다
      noReason,
      orphan,
      self: self || null,
      skipWhy: !name ? "학생을 못 찾았어요" : !date ? "시험 본 날짜가 없어요" : "",
    });
  });

  return { rows: out, unknown };
}
