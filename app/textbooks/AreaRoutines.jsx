"use client";

import { useState } from "react";
import RoutineEditor from "./RoutineEditor";
import { AREA_ORDER } from "@/lib/bookSort";

/**
 * 영역 루틴 편집 (원장님, 2026-08-21 — 「루틴을 엑셀로 넣기만 하지 말고
 * 수정·삭제 가능하게 해줘」).
 *
 * 교재만의 루틴이 없는 교재는 영역(문법·영작…) 공통 루틴을 따르는데(0137),
 * 그 영역 루틴을 고칠 자리가 여태 없었다 — 교재 쪽 편집기에서는 「따르는 중」
 * 으로 읽기 전용으로만 보였다. 편집기는 RoutineEditor 를 그대로 쓴다
 * (원칙 1 — 같은 판을 두 벌로 그리지 않는다). 판단은 전부 routineActions 에.
 */
export default function AreaRoutines({ items = [] }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState(null);

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        영역 루틴
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>영역 루틴</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "8px 0 10px", lineHeight: 1.7 }}>
        교재만의 루틴이 없는 교재는 여기 있는 <b>영역 공통 루틴</b>을 따릅니다.
        교재별 루틴이 한 줄이라도 있으면 그게 우선이에요.
      </p>
      <div className="chips" style={{ marginBottom: 10 }}>
        {AREA_ORDER.map((a) => (
          <button
            key={a}
            className={`chip ${area === a ? "on" : ""}`}
            onClick={() => setArea(a)}
          >
            {a}
          </button>
        ))}
      </div>
      {/* key 로 영역이 바뀔 때 편집기를 새로 — 이전 영역의 단계가 잠깐 비치면 안 된다 */}
      {area ? (
        <RoutineEditor key={`area:${area}`} area={area} items={items} />
      ) : (
        <p className="hint">영역을 골라주세요.</p>
      )}
    </div>
  );
}
