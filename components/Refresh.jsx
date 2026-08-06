"use client";

import { useEffect, useRef, useState } from "react";

/**
 * **새로고침** — 홈 화면에 담은 앱에는 이 단추가 없으면 방법이 없다.
 *
 * 원장님 (2026-08-06) — 「홈화면 저장하고 나서 새로고침 방법이 없어」
 *
 * 홈 화면 앱은 주소창이 없다. 주소창이 없으니 새로고침도 없다. 그래서 새로
 * 배포해도 폰은 어제 것을 붙들고, 「고쳤습니다」 라고 말씀드려도 화면은 그대로다.
 * 실제로 그것 때문에 SQL 0089 가 목록에 안 떠서 「넣을 게 없다」 가 됐다.
 *
 * 두 가지를 한다.
 *   1. **단추** — 언제든 눌러 다시 받는다. 늘 보인다
 *   2. **스스로 알아채기** — 앱이 앞으로 나올 때마다 지금 배포가 몇 번째인지
 *      물어보고, 처음 받은 것과 다르면 위에 띠를 띄운다
 *
 * 2번이 중요하다. 새로고침 단추가 있어도 **눌러야 할 때를 모르면** 안 누른다.
 */
export default function Refresh({ label = "새로고침" }) {
  const mine = useRef(null);          // 이 화면을 받을 때의 배포 번호
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    async function look() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (!alive || !version) return;
        if (mine.current === null) {
          mine.current = version;      // 처음 본 것이 기준이 된다
          return;
        }
        if (version !== mine.current) setStale(true);
      } catch {
        // 못 물어봐도 그만이다 — 단추는 그대로 있다.
        // 여기서 실패했다고 화면에 무슨 말을 띄우면, 지하철에서 잠깐 끊긴 것을
        // 두고 「앱이 고장났나」 하시게 된다
      }
    }

    look();
    const again = () => {
      if (document.visibilityState === "visible") look();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, []);

  function reload() {
    setBusy(true);
    // 캐시를 건너뛰고 서버에서 다시 받는다
    window.location.reload();
  }

  return (
    <>
      {stale && (
        <button className="newver" onClick={reload} disabled={busy}>
          <b>새 버전이 나왔어요.</b> 눌러서 받아주세요
        </button>
      )}
      {/* **눈에 띄어야 한다.** 처음에는 btn-ghost(투명·흐린 글씨)로 뒀는데
          「버튼 안 생겼어 아무데도」 라는 말을 들었다. 있어도 안 보이면 없는
          것이다 — 테두리를 주고 ↻ 를 붙여 단추처럼 보이게 한다. */}
      <button
        className="btn btn-refresh"
        onClick={reload}
        disabled={busy}
        title="홈 화면 앱에는 주소창이 없어서 여기서 새로고침합니다"
      >
        {busy ? "받는 중…" : `↻ ${label}`}
      </button>
    </>
  );
}
