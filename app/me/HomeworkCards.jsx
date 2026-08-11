"use client";

import { useState } from "react";
import { cleanNote } from "@/lib/note";
import { toolBadge } from "@/app/homework/categories";

const MARK = {
  done: { label: "완료", cls: "tag-mint" },
  weak: { label: "미흡", cls: "tag-amber" },
  missing: { label: "미제출", cls: "tag-red" },
};

// 숙제를 누르면 학습 방법이 펼쳐진다
export default function HomeworkCards({ items = [] }) {
  const [openId, setOpenId] = useState(null);

  if (items.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>지금 나온 숙제가 없어요.</p>;
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((h) => {
        const open = openId === h.key;
        return (
          <div key={h.key} className="hwcard">
            <button className="hwcard-head" onClick={() => setOpenId(open ? null : h.key)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14.5 }}>{h.name}</b>
                {/* **무엇을 펴야 하는지** (원장님, 2026-08-11 — 「툴이 교재인지
                    클래스카드인지, 노트인지 표시해줘. 아이에게」). 매번
                    물어보던 것이라 이름 바로 옆에 붙인다 */}
                {h.tool && (
                  <span className="tag tag-sky" style={{ marginLeft: 5, fontSize: 10.5 }}>
                    {toolBadge(h.tool)}
                  </span>
                )}
                {/* **나중에 더하거나 고치신 것** (0087).
                    아까 적어 간 것과 다를 수 있으니 눈에 띄어야 한다 */}
                {h.changedAt && (
                  <span className="tag tag-amber" style={{ marginLeft: 5, fontSize: 10.5 }}>바뀜</span>
                )}
                {h.units.length > 0 && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {h.units.join(" · ")}
                  </div>
                )}
                {cleanNote(h.note) && (
                  <div className="hint" style={{ marginTop: 2 }}>{cleanNote(h.note)}</div>
                )}
              </div>
              {h.status && MARK[h.status] && (
                <span className={`tag ${MARK[h.status].cls}`}>{MARK[h.status].label}</span>
              )}
              {h.method && (
                <span className="hint" style={{ whiteSpace: "nowrap" }}>
                  {open ? "▾ 접기" : "▸ 하는 법"}
                </span>
              )}
            </button>

            {open && (
              <div className="hwcard-body">
                {h.method ? (
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.7 }}>
                    {h.method}
                  </div>
                ) : (
                  <span className="hint">
                    아직 방법 설명이 없어요. 선생님께 여쭤보세요.
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
