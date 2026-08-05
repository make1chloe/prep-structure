"use client";

import { useEffect, useState } from "react";

/**
 * 화면 테마 — 시스템에 맞추기 / 라이트 / 다크.
 *
 * **계정이 아니라 브라우저에 저장한다.** 학원 컴퓨터는 밝게, 집에서 보는 폰은
 * 어둡게 — 같은 계정이어도 다른 게 자연스럽다.
 *
 * 「시스템에 맞추기」가 기본이다. 폰이 밤에 저절로 어두워지면 앱도 따라간다.
 */
const OPTIONS = [
  ["system", "시스템에 맞추기", "기기 설정을 따라갑니다"],
  ["light", "밝게", "언제나 밝은 화면"],
  ["dark", "어둡게", "언제나 어두운 화면"],
];

const KEY = "chloe.theme";

export default function ThemePicker() {
  // 서버에서 그릴 때는 브라우저 저장소를 못 읽는다. 먼저 시스템으로 그려두고
  // 화면에 붙은 다음에 실제 값으로 맞춘다 (그때는 이미 색은 제대로다 —
  // 색은 layout 의 짧은 글이 먼저 붙여놨다).
  const [pick, setPick] = useState("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      setPick(t === "dark" || t === "light" ? t : "system");
    } catch { /* 사파리 비공개 */ }
    setReady(true);
  }, []);

  function choose(v) {
    setPick(v);
    try {
      if (v === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, v);
    } catch { /* 사파리 비공개 — 이번 화면에서만 바뀐다 */ }
    const root = document.documentElement;
    if (v === "system") delete root.dataset.theme;
    else root.dataset.theme = v;
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>화면 테마</h2>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
        <b>이 브라우저에만</b> 저장됩니다. 학원 컴퓨터는 밝게, 폰은 어둡게 두셔도 돼요.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {OPTIONS.map(([v, label, desc]) => (
          <button
            key={v}
            type="button"
            className={`btn btn-sm ${ready && pick === v ? "btn-primary" : "btn-ghost"}`}
            title={desc}
            onClick={() => choose(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {pick === "system"
          ? "기기가 밤에 저절로 어두워지면 앱도 따라갑니다."
          : pick === "dark"
          ? "기기 설정과 상관없이 어둡게 둡니다."
          : "기기 설정과 상관없이 밝게 둡니다."}
      </p>
    </div>
  );
}
