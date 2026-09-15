/** 항목 나무 한 벌((어42) · 원장님 9/15 「숙제검사하는 사람이 영역을 봐야 책을 보고 책을 봐야 단원을 보고 단원을 펼쳐봐야 항목검사를 할 거 아냐 … 줄마다 다 똑같은데 구별이 되냐고」).
 *  영역 색띠(data-area · 목업 CSS .tr) › 📕 교재(tree-book) › ▸ 단원(details tree-unit · 접힌다 · 대단원 › 소단원 · 쪽 · 문항 · summary tree-head) › 활동 줄(들여쓰기 .trr · 줄 자체는 부르는 쪽이 그린다 row(it, i, unit, chapter)).
 *  01 검사·학습·숙제 · 07 · 09 가 같은 부품 · 나무 만들기는 lib/day-plan.js itemForest(순수) · 훅이 없어 서버·클라이언트 어디서나 · 단원 머리에 얹는 손(unitHead)은 summary 안이라 preventDefault 로 접힘을 막는다 */
import { itemForest } from "@/lib/day-plan";
import { unitBits } from "@/lib/item-plan";
import { areaEmo } from "@/lib/routine-plan";
export function ItemTree({ rows = [], all = rows, row, unitHead = null, book = true, open = true, bySort = false }) {   // (어35) bySort · 오늘 학습·숙제는 sort 가 곧 차례
  const forest = itemForest(rows, all, { bySort }); if (!forest.length) return null;
  return forest.map((b) => (
    <div key={b.key} className={"tr" + (book ? "" : " nob")} data-g="tree" data-area={book ? b.area ?? "" : ""}>
      {book && <div className="trb" data-g="tree-book">{b.book ? <><b>📕 {b.book}</b>{b.area && <span className="tra">{areaEmo(b.area)} {b.area}</span>}</> : <b>그 밖에</b>}</div>}
      {b.chapters.map((ch) => ch.units.map((g, gi) => { const bits = g.unit ? unitBits([g.unit], { book: false }) : null;
        if (!g.unit && !unitHead) return <div key={`_${ch.key}_${gi}`} className="trr" data-g="tree-free">{g.rows.map((it, i) => row(it, i, g, ch))}</div>;   // 단원 없는 줄(손으로 더한 것)은 머리 없이 줄만 · 「단원 없음」 글은 노이즈(대전제-21) · 01 학습·숙제 안(unitHead)에서는 손이 있어 머리를 둔다
        return (
        <details key={g.id ?? `_${ch.key}_${gi}`} className="tru" data-g="tree-unit" data-unit={g.id ?? ""} open={open}>
          <summary className="truh" data-g="tree-head"><span className="ar">▸</span>{ch.chapter && <span className="trc">{ch.chapter} ›</span>}<b>{bits ? bits.subs : "단원 없음"}</b>{bits && (bits.pages || bits.q) && <small>{[bits.pages, bits.q].filter(Boolean).join(" · ")}</small>}{unitHead?.(g, ch)}</summary>
          <div className="trr">{g.rows.map((it, i) => row(it, i, g, ch))}</div>
        </details>); }))}
    </div>));
}
