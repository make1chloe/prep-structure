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
