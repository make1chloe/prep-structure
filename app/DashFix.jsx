"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * **대시보드 칩을 그 자리에서 해결한다** (원장님 2026-08-28 —
 * 「클릭이 안 되어서 어떻게 해야 할지 모르거나, 클릭을 해서 해결할 페이지를
 *  들어갔는데 뭘 해결해야 하는지 알 수가 없는 게 문제임」 ·
 * 「박윤찬 그래머인사이드가 진도 시작 안 했으면, 박윤찬 그래머인사이드
 *  진도가 새로 떠야지」 · 「나머지도 똑같애. 바로 그 자리에서 해결하게」).
 *
 * 여태 칩은 전부 `<Link>` 였다 — 누르면 화면만 바뀌고, 간 화면에서는 방금
 * 무엇을 보고 왔는지가 사라져 다시 찾아야 했다. 여기서는 **누른 그것**이
 * 그대로 팝오버로 열린다.
 *
 * ── 이 조각이 하는 일은 둘뿐이다 ─────────────────────
 *   ① 칩을 가로로 늘어놓는다 (버튼이다 — 화면 이동이 아니다)
 *   ② 누른 칩 하나를 판(DashFixBody)에 넘긴다
 *
 * **판은 누를 때 받는다** (원칙 6 — 속도). 진도 단원 고르기·루틴 고르기·
 * 교재 고르기가 전부 들어 있는 뭉치라, 그냥 import 하면 대시보드 첫 로드에
 * 통째로 실린다. 대시보드는 하루에 제일 많이 열리는 화면이고, 이 판들은
 * **대개 안 열린다.** 그래서 next/dynamic 이다.
 *
 * 판단(무엇을 저장하나)은 여기 없다 — 전부 기존 서버 액션이 한다.
 */
const DashFixBody = dynamic(() => import("./DashFixBody"), {
  ssr: false,
  // ⚠️ 기다리는 자리의 이름은 **판 이름(.sheetpop)과 달라야 한다** —
  //    빈 자리를 판으로 착각하는 검사가 있다 (.stuPanel 사고 전례)
  loading: () => (
    <div className="dashfix-wait card" role="status">
      <span className="hint">여는 중…</span>
    </div>
  ),
});

export default function DashFix({ kind, items = [], tone = "tag-amber", tail = null }) {
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`tag ${it.tone || tone} dashfix-chip`}
            title={it.title || undefined}
            onClick={() => setOpen(it)}
          >
            <b>{it.name}</b>
            {it.sub ? ` ${it.sub}` : ""}
          </button>
        ))}
        {/* 「외 n건」 같은 꼬리 — 줄이 끊기면 안 되므로 같은 줄 안에 둔다 */}
        {tail}
      </div>
      {open && (
        <DashFixBody
          key={open.key}
          kind={kind}
          item={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
