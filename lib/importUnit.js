/**
 * 교재 단원 엑셀 올리기.
 *
 * ── 열이 늘었다 (2026-08-06, 0100) ──────────────────────────
 *
 * 원장님 — 「단원의 실제 내용과 분량을 오늘 수업에서 확인하고 숙제를 주고
 * 싶은 거야」
 *
 * 교재 세 권을 열어보니 **「분량」 을 말하는 방식이 교재마다 달랐다.**
 *
 *   중2 문법 워크북      Unit 02 = **딱 한 쪽**인데 문제가 25개
 *   수능 어법 교재       Testing Point 01 = pp.014~017 (네 쪽)
 *   교과서 워크북        Lesson 5 가주어 it = Practice 4문항
 *
 * 지금까지 받던 열은 **쪽수뿐**이었다. 그래서 중2 워크북은 어느 단원이든
 * 「1쪽」 이라 25문항짜리와 8문항짜리가 화면에 똑같이 보였다.
 *
 * 그래서 넷을 더 받는다 — **문항수 · 문항범위 · 단어수 · 핵심내용**
 * (+ 예상시간, 비우면 짐작한다).
 *
 * **단어수는 표에 원래 있던 칸인데 엑셀에만 없었다** (0070 에서 칸만 만들고
 * 올리는 길을 안 냈다). 그래서 단어책 단원마다 손으로 넣고 계셨다.
 *
 * 열 이름은 옛것 그대로 두었다 — 이미 만들어 쓰시던 파일이 그냥 올라간다.
 */

const HEADER_MAP = {
  교재명: "textbook",
  교재: "textbook",
  출판년도: "pub_year",
  출판연도: "pub_year",
  연도: "pub_year",
  대단원: "big",
  중단원: "mid",
  소단원: "small",
  문제번호: "question_no",
  문제: "question_no",
  번호: "question_no",
  문항: "question_no",
  문항번호: "question_no",
  단원명: "name",
  활동명: "activity",
  활동: "activity",
  시작페이지: "page_start",
  시작p: "page_start",
  시작: "page_start",
  끝페이지: "page_end",
  끝p: "page_end",
  종료페이지: "page_end",
  총분량: "total_pages",
  "총분량(총페이지)": "total_pages",
  총페이지: "total_pages",
  분량: "total_pages",
  // ── 0100 에서 늘어난 것 ──
  문항수: "question_count",
  문제수: "question_count",
  문항개수: "question_count",
  문제개수: "question_count",
  문항범위: "question_range",
  문제범위: "question_range",
  단어수: "word_count",
  단어개수: "word_count",
  핵심내용: "summary",
  내용: "summary",
  학습내용: "summary",
  요약: "summary",
  예상시간: "minutes",
  소요시간: "minutes",
  시간: "minutes",
};

export const UNIT_HEADERS = [
  "교재명",
  "출판년도",
  "대단원",
  "중단원",
  "소단원",
  "단원명",
  "문제번호",
  "활동명",
  "시작페이지",
  "끝페이지",
  "총분량",
  // 여기부터가 **분량과 내용** (0100). 안 채우셔도 올라간다
  "문항수",
  "문항범위",
  "단어수",
  "핵심내용",
  "예상시간",
];

export const UNIT_FIELD_LABEL = {
  textbook: "교재명",
  pub_year: "출판년도",
  big: "대단원",
  mid: "중단원",
  small: "소단원",
  name: "단원명",
  question_no: "문제번호",
  activity: "활동명",
  page_start: "시작p",
  page_end: "끝p",
  total_pages: "총분량",
  question_count: "문항수",
  question_range: "문항범위",
  word_count: "단어수",
  summary: "핵심내용",
  minutes: "예상시간",
};

const num = (v) => {
  const d = (v ?? "").toString().replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};

export function parseUnitAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) {
    return { headers: [], fields: [], rows: [] };
  }
  const headers = (aoa[0] || []).map((h) => String(h ?? "").trim());
  const fields = headers.map((h) => HEADER_MAP[h.replace(/\s/g, "")] || null);

  const rows = aoa
    .slice(1)
    .map((cells) => {
      const o = {};
      fields.forEach((f, i) => {
        if (f) o[f] = String(cells?.[i] ?? "").trim();
      });
      o.pub_year = num(o.pub_year);
      o.page_start = num(o.page_start);
      o.page_end = num(o.page_end);
      o.total_pages = num(o.total_pages);
      o.question_count = num(o.question_count);
      o.word_count = num(o.word_count);
      o.minutes = num(o.minutes);
      // 총분량이 비어 있으면 페이지 범위로 계산
      if (!o.total_pages && o.page_start && o.page_end) {
        o.total_pages = o.page_end - o.page_start + 1;
      }
      // **문항범위만 적으셨으면 개수를 센다** (「01-06」 → 6문항).
      // 나눠서 낼 때는 범위가 먼저 떠오르지 개수가 아니다
      if (!o.question_count && o.question_range) {
        const n = countRange(o.question_range);
        if (n) o.question_count = n;
      }
      return o;
    })
    // 교재명은 반드시 있어야 하고, 단원 이름이 될 값이 하나라도 있어야 한다
    .filter((o) => (o.textbook || "").trim() !== "")
    .filter((o) =>
      [o.big, o.mid, o.small, o.name, o.question_no].some((v) => (v || "").trim() !== "")
    );

  return { headers, fields, rows };
}

// 화면 표시용: 이 줄이 만들 단원의 최종 이름과 깊이
export function unitLabel(r) {
  const leaf = r.small || r.mid || r.big || "";
  const name = (r.name || "").trim();
  const q = (r.question_no || "").trim();
  // 문제번호가 있으면 그 줄이 만드는 것은 **문제**다 (한 겹 더 아래)
  let depth = r.small ? 2 : r.mid ? 1 : 0;
  if (name) depth += 1;
  if (q) depth += 1;
  return { label: q ? `${q}번` : name || leaf, depth };
}

/**
 * 「01-06」 · 「1~25」 · 「3,5,7」 → 문항 개수.
 *
 * 나눠서 낼 때는 **범위가 먼저 떠오르지 개수가 아니다.** 「16-25번 해와」
 * 라고 말하시지 「10문항 해와」 라고 하지 않는다. 그래서 범위만 적어도
 * 개수가 나오게 한다 — 개수를 또 세게 하면 안 센다.
 */
export function countRange(v) {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  let n = 0;
  for (const part of s.split(/[,·\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-~–]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b >= a) n += b - a + 1;
      continue;
    }
    if (/^\d+$/.test(part)) n += 1;
  }
  return n || null;
}

/**
 * **예상 시간을 짐작한다** — 안 적으셨을 때.
 *
 * 숙제 분량을 정하는 것은 결국 「이거 얼마나 걸려?」 다. 빈칸으로 두면
 * 매번 머릿속으로 어림하셔야 한다.
 *
 * 짐작한 값은 **짐작이라고 표시한다** — 조용히 정해두면 「30분이라더니」 가 된다.
 *
 * @returns { minutes, guessed }
 */
export function minutesOf(u = {}) {
  const set = Number(u.minutes);
  if (Number.isFinite(set) && set > 0) return { minutes: set, guessed: false };

  const q = Number(u.question_count);
  const w = Number(u.word_count);
  const p = Number(u.total_pages);

  // 문항 하나에 1분, 단어 하나에 20초, 쪽 하나에 10분.
  // 셋 다 있으면 제일 큰 것을 쓴다 — 셋을 더하면 같은 분량을 세 번 세게 된다
  const guesses = [
    Number.isFinite(q) && q > 0 ? q : 0,
    Number.isFinite(w) && w > 0 ? Math.round(w / 3) : 0,
    Number.isFinite(p) && p > 0 ? p * 10 : 0,
  ];
  const best = Math.max(...guesses);
  return best > 0 ? { minutes: best, guessed: true } : { minutes: null, guessed: false };
}

/** 화면에 한 줄로 — 「p.3 · 25문항 · 약 25분」 */
export function volumeText(u = {}) {
  const bits = [];
  if (u.page_start) bits.push(u.page_end && u.page_end !== u.page_start
    ? `p.${u.page_start}~${u.page_end}` : `p.${u.page_start}`);
  if (u.question_count) {
    bits.push(u.question_range ? `${u.question_range}번 (${u.question_count}문항)` : `${u.question_count}문항`);
  } else if (u.question_range) {
    bits.push(`${u.question_range}번`);
  }
  if (u.word_count) bits.push(`단어 ${u.word_count}`);
  const { minutes, guessed } = minutesOf(u);
  if (minutes) bits.push(`${guessed ? "약 " : ""}${minutes}분`);
  return bits.join(" · ");
}
