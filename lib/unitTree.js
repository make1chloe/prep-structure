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
      activity: unit.label || "",
      pages: pageLabel(unit),
      amount: amountLabel(unit),
    };
  });
}

// 셀렉트 한 줄에 보여줄 텍스트
export function unitOptionText(o) {
  const path = [o.big, o.mid, o.small].filter(Boolean).join(" › ");
  const tail = [o.activity, o.pages, o.amount && `분량 ${o.amount}`]
    .filter(Boolean)
    .join(" · ");
  return tail ? `${path} — ${tail}` : path;
}
