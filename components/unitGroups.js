/**
 * 진도 판의 단원 묶기 — 소단원을 대·중단원 머리로 묶고, 대단원 막대
 * 자리를 표시한다. 원래 BookProgress 안에 있던 것을 그대로 꺼냈다
 * (2026-08-27 — 단원 골라 찍기 팝오버(ProgressPickModal)도 같은 위계로
 * 그려야 해서. 묶는 판단이 두 벌이 되면 판과 팝오버의 층이 어긋난다).
 */

/**
 * 묶음마다 대단원 이름을 붙이고, 한 대단원이 **여러 묶음으로 쪼개졌을 때**
 * 첫 묶음에 bigStart 표시 + 그 대단원 소단원 전체 id 를 실어준다.
 * (한 묶음뿐이면 묶음 머리 단추가 이미 대단원 전체라 통째 단추가 필요 없다)
 */
export function annotateBigs(groups) {
  const rows = groups.map(([head, list]) => ({
    head,
    list,
    // 묶음 머리가 「대단원 › 중단원」 이면 쪼개고, 「대단원」 뿐이면 통째로 대단원
    big: head ? head.split(" › ")[0] : "",
    mid: head && head.includes(" › ") ? head.split(" › ").slice(1).join(" › ") : "",
  }));
  let prev = null;
  rows.forEach((g) => {
    // 새 대단원이 시작되는 묶음 — 여기에 대단원 막대를 세운다
    g.bigStart = !!g.big && g.big !== prev;
    g.bigIds = g.bigStart
      ? rows.filter((x) => x.big === g.big).flatMap((x) => x.list.map((u) => u.id))
      : [];
    prev = g.big || null;
  });
  return rows;
}

// 소단원을 그 위 단원(대/중) 이름으로 묶는다. kw 가 있으면 걸러서 묶는다
export function groupByParent(units = [], kw = "") {
  const m = new Map();
  const q = (kw || "").trim().toLowerCase();
  units
    .filter((u) => u.leaf)
    .filter((u) =>
      !q ||
      [u.name, u.activity, u.big, u.mid, u.small].some((v) =>
        (v || "").toString().toLowerCase().includes(q)
      )
    )
    .forEach((u) => {
      /**
       * 셋째 층까지 머리에 넣는다 (원장님, 2026-08-19 — 「진도에서 단원과
       * 교재단원이 달라」). 층이 셋인 교재(기초편 › 개념 정리 › 1 영어의
       * 8품사 › 진도설명)에서 둘째 층까지만 붙이니, 8품사·문장의 성분…
       * 마다 하나씩인 「진도설명」 들이 구분 없이 한 묶음에 쏟아져
       * 전부 중복처럼 보였다. small 이 제 이름(둘째 층짜리 교재)이면 뺀다.
       */
      const head = [u.big, u.mid, u.small && u.small !== u.name ? u.small : null]
        .filter(Boolean)
        .slice(0, 3)
        .join(" › ");
      const key = head === u.name ? "" : head;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(u);
    });
  return [...m.entries()];
}
