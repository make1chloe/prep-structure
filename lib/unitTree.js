// parent_id 로 트리를 만들어 [{unit, depth}] 평면 목록으로 펼친다.
// 서버(page)와 클라이언트(UnitList) 양쪽에서 쓰므로 별도 모듈로 둔다.
export function flattenTree(units = []) {
  const byParent = new Map();
  units.forEach((u) => {
    const k = u.parent_id || "root";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(u);
  });
  byParent.forEach((list) => list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));

  const out = [];
  const seen = new Set();
  const walk = (key, depth) => {
    (byParent.get(key) || []).forEach((u) => {
      if (seen.has(u.id)) return; // 순환 방지
      seen.add(u.id);
      out.push({ unit: u, depth });
      walk(u.id, depth + 1);
    });
  };
  walk("root", 0);

  // 부모가 사라진 고아 단원도 최상위로 노출
  units.forEach((u) => {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      out.push({ unit: u, depth: 0 });
    }
  });
  return out;
}

// 분량 표기: 총 분량이 있으면 그걸, 없으면 페이지 범위로 계산
export function amountLabel(unit = {}) {
  if (unit.total_pages) return `${unit.total_pages}p`;
  if (unit.page_start && unit.page_end) {
    return `${unit.page_end - unit.page_start + 1}p`;
  }
  return "";
}
export function pageLabel(unit = {}) {
  if (!unit.page_start && !unit.page_end) return "";
  if (unit.page_start && unit.page_end) return `${unit.page_start}~${unit.page_end}p`;
  return `${unit.page_start || unit.page_end}p`;
}

// 단원 트리를 숙제 배정용 선택지로 펼친다.
// 대/중/소단원 이름을 조상 경로에서 뽑아 함께 담는다.
export function unitOptions(units = []) {
  const chainOf = new Map();
  return flattenTree(units).map(({ unit, depth }) => {
    const parent = unit.parent_id ? chainOf.get(unit.parent_id) || [] : [];
    const chain = [...parent, unit.name];
    chainOf.set(unit.id, chain);
    return {
      id: unit.id,
      depth,
      big: chain[0] || "",
      mid: chain[1] || "",
      small: chain[2] || "",
      name: unit.name,
      question: unit.question_no || "",
      activity: unit.label || "",
      pages: pageLabel(unit),
      amount: amountLabel(unit),
      // **분량과 내용** (0100) — 원장님: 「단원의 실제 내용과 분량을 오늘
      // 수업에서 확인하고 숙제를 주고 싶은 거야」
      questionCount: unit.question_count ?? null,
      questionRange: unit.question_range || "",
      wordCount: unit.word_count ?? null,
      summary: unit.summary || "",
      minutes: unit.minutes ?? null,
    };
  });
}

/**
 * **분량 한 줄** — 「p.3 · 25문항 · 약 25분」
 *
 * 교재마다 분량을 말하는 방식이 다르다. 문법 워크북은 어느 단원이든 한
 * 쪽이라 쪽수로는 아무것도 알 수 없고, 단어책은 쪽수보다 단어 개수다.
 * **있는 것을 있는 대로 붙인다** — 없는 단위를 0으로 적으면 「25문항 0단어」
 * 처럼 되어 오히려 못 읽는다.
 */
export function volumeLabel(o = {}) {
  const bits = [];
  if (o.pages) bits.push(o.pages);
  else if (o.amount) bits.push(o.amount);
  if (o.questionCount) {
    bits.push(o.questionRange ? `${o.questionRange}번 ${o.questionCount}문항` : `${o.questionCount}문항`);
  } else if (o.questionRange) bits.push(`${o.questionRange}번`);
  if (o.wordCount) bits.push(`단어 ${o.wordCount}`);

  const m = guessMinutes(o);
  if (m.minutes) bits.push(`${m.guessed ? "약 " : ""}${m.minutes}분`);
  return bits.join(" · ");
}

/**
 * 시간을 안 적으셨으면 짐작한다 — 숙제 분량은 결국 「이거 얼마나 걸려?」 다.
 *
 * 문항 하나 1분 · 단어 셋 1분 · 쪽 하나 10분. **셋을 더하지 않고 제일 큰
 * 것을 쓴다** — 같은 분량이 문항으로도 쪽으로도 적혀 있으면 두 번 세게 된다.
 * 짐작한 것은 「약」 을 붙여 짐작이라고 밝힌다.
 */
export function guessMinutes(o = {}) {
  const set = Number(o.minutes);
  if (Number.isFinite(set) && set > 0) return { minutes: set, guessed: false };
  const q = Number(o.questionCount) || 0;
  const w = Number(o.wordCount) || 0;
  const p = Number((o.amount || "").replace(/[^\d]/g, "")) || 0;
  const best = Math.max(q, w ? Math.round(w / 3) : 0, p * 10);
  return best > 0 ? { minutes: best, guessed: true } : { minutes: null, guessed: false };
}

// 셀렉트 한 줄에 보여줄 텍스트
export function unitOptionText(o) {
  const path = [o.big, o.mid, o.small].filter(Boolean).join(" › ");
  // **분량이 이름 바로 옆에 붙어야 한다.** 고르는 순간에 「이게 25문항이구나」
  // 를 알아야 숙제를 정한다 — 고르고 나서 알면 다시 고르게 된다
  const tail = [o.activity, volumeLabel(o), o.summary].filter(Boolean).join(" · ");
  return tail ? `${path} — ${tail}` : path;
}
