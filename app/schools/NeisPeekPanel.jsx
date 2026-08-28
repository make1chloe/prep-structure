"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * **나이스 원본은 펼칠 때 내려받는다** (성능수리 5차).
 *
 * 이 상자는 처음에 **접혀 있다**. 원장님이 학교·시험 화면에서 하는 일은
 * 거의 다 위쪽(시험 목록·휴강 알림)이고, 나이스 원본은 「뭔가 이상할 때」
 * 한 번 펼쳐보는 자리다. 그런데 접혀 있어도 NeisPeek 과 PeekCalendar 는
 * 첫 화면에서 전부 내려받고 있었다 — 화면이 늦게 「눌러도 안 먹히는」
 * 까닭의 한 몫이다.
 *
 * `<details>` 안에 넣어두는 것만으로는 안 미뤄진다. 접힘은 **보이기**만
 * 감추지 브라우저가 받는 짐은 그대로다. 그래서
 *   · 펼침 여부를 여기서 들고 (onToggle),
 *   · 펼친 뒤에야 next/dynamic 으로 조각을 받는다.
 * 한 번 펼치면 접어도 안 내린다 — 고른 학교·기간이 사라지면 안 된다.
 *
 * `ssr: false` — 처음엔 늘 접혀 있으니 서버가 그릴 일이 없다.
 *
 * 기다리는 자리 이름은 **판 이름과 다르게** 짓는다 (`.peekWait`).
 * 오늘 수업의 `.stuPanel` 사고 — 검사가 빈 자리를 판으로 착각해 눌렀다
 * (app/today/TodayBoard.jsx 주석).
 */
const NeisPeek = dynamic(() => import("@/app/neis/NeisPeek"), {
  ssr: false,
  loading: () => (
    <div className="peekWait">
      <p className="hint" style={{ margin: 0 }}>여는 중…</p>
    </div>
  ),
});

export default function NeisPeekPanel({ from, to, schools = [] }) {
  const [opened, setOpened] = useState(false);

  return (
    <details
      className="card sect sect-info"
      style={{ marginTop: 8 }}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="secthead" style={{ cursor: "pointer" }}>
        나이스 원본 <span className="tag tag-muted">학교가 올린 그대로</span>
      </summary>
      <p className="sub" style={{ marginTop: 6 }}>
        나이스에 <b>학교가 올려둔 그대로</b>를 봅니다. 다른 화면은 앱이 정리한 뒤의
        모습이라, 뭔가 없을 때 <b>학교가 안 올린 건지 앱이 못 알아본 건지</b> 알 수가
        없었습니다. 여기서는 받은 줄을 하나도 안 버리고 보여주고,
        옆에 <b>앱이 그 줄을 어떻게 봤는지</b>를 적습니다.
      </p>
      {opened ? <NeisPeek from={from} to={to} schools={schools} /> : null}
    </details>
  );
}
