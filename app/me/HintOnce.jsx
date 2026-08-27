"use client";

import { useEffect, useState } from "react";

/**
 * **처음 한 번만 보여주는 설명** (탭 개편 C1, 2026-08-27).
 *
 * 학생 화면의 설명 문구는 처음 한 번은 가치가 있지만, 매일 여는 화면에서
 * 매일 읽히면 정작 「지금 할 것」 이 아래로 밀린다. InstallHint 의
 * 「닫으면 다시 안 뜬다」 전례를 일반화했다.
 *
 * 키는 **학생별**이다 — `chloe.hint.<이름>.<학생id>` 를 부르는 쪽이 통째로
 * 넘긴다. 학원 공용 기기에서 첫 아이가 ✕ 를 누르면 다음 아이의 첫
 * 안내까지 사라지면 안 된다 (실행계획서 §2-3, 2차 #8).
 *
 * 서버 HTML 에는 실리지 않는다 (붙은 뒤에 보인다) — InstallHint 와 같다.
 */
export default function HintOnce({ k, children }) {
  const KEY = `chloe.hint.${k}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);   // 사파리 비공개 — 못 적으면 그냥 계속 보인다
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch { /* 무시 */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="row" style={{ gap: 6, alignItems: "flex-start", flexWrap: "nowrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button
        className="btn btn-ghost btn-sm"
        style={{ padding: "0 6px", flex: "none" }}
        onClick={close}
        aria-label="이 설명 그만 보기"
        title="알겠어요 — 그만 보기"
      >
        ✕
      </button>
    </div>
  );
}
