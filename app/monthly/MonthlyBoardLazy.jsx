"use client";

import dynamic from "next/dynamic";

/**
 * **월간리포트 판은 그 탭을 열 때 내려받는다** (성능수리 5차).
 *
 * 4차에서 리포트 화면의 탭 판 여섯을 SendPanel 로 갈랐는데, 월간리포트만
 * 남았다 — MonthlyScreen 은 **서버 판**이라 클라 껍데기 안에 못 들어간다.
 * 그래서 한 칸 안쪽에서 가른다: 서버 판은 그대로 두고, 그 안의 클라 판
 * (MonthlyBoard 357줄)만 미룬다. 이러면 `?t=monthly` 아닌 탭들 —
 * 매일 여는 「보낼 것」 — 이 이 판을 안 받는다. 탭 구성(원장님 확정,
 * 2026-08-28)은 한 글자도 안 건드린다.
 *
 * **`ssr: false` 는 안 붙인다** (/report 의 SendPanel 과 같은 판단) —
 * 서버가 그린 판이 첫 HTML 에 그대로 들어 있어 깜빡임이 없다.
 *
 * 기다리는 자리 이름은 판 이름과 **다르게** (`.monthlyWait`) —
 * app/today/TodayBoard.jsx 의 `.stuPanel` 전례.
 */
const MonthlyBoard = dynamic(() => import("./MonthlyBoard"), {
  loading: () => (
    <div className="monthlyWait card" style={{ marginTop: 12 }}>
      <p className="hint" style={{ margin: 0 }}>월간리포트 여는 중…</p>
    </div>
  ),
});

export default MonthlyBoard;
