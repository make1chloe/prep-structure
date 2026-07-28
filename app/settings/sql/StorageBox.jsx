"use client";

import { useState, useTransition } from "react";
import { checkStorage } from "./storageCheck";

/**
 * 숙제 파일(사진·녹음)이 진짜로 올라가는지 확인한다.
 *
 * 학생이 "안 올라가요" 라고 할 때, 어디서 막혔는지 원장님이 직접 볼 수 있어야 한다.
 */
export default function StorageBox() {
  const [res, setRes] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>숙제 파일 점검</h2>
        <span className="spacer" />
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => startTransition(async () => setRes(await checkStorage()))}
        >
          {pending ? "해보는 중…" : "실제로 올려보기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        작은 파일을 하나 올렸다가 지웁니다. 학생이 사진·녹음을 못 올릴 때 여기서
        <b> 어디서 막혔는지</b> 볼 수 있습니다.
      </p>

      {res && (
        <div className="stack" style={{ gap: 3, marginTop: 10 }}>
          {res.steps.map((s, i) => (
            <div className="unitrow" key={i}>
              <span className={`tag ${s.ok ? "tag-mint" : "tag-amber"}`}>{s.ok ? "OK" : "막힘"}</span>
              <b style={{ fontSize: 13 }}>{s.name}</b>
              {s.why && (
                <span className="hint" style={{ flex: 1, fontSize: 12 }}>{s.why}</span>
              )}
            </div>
          ))}
          {res.steps.every((s) => s.ok) && (
            <p className="hint" style={{ margin: "4px 0 0" }}>
              전부 통과했습니다. 학생 화면에서 사진·녹음이 올라갑니다 👏
            </p>
          )}
        </div>
      )}
    </div>
  );
}
