"use client";

import { useEffect, useRef, useState } from "react";

/**
 * **위에서 아래로 당겨서 새로고침** (원장님, 2026-08-06).
 *
 * 「새로고침 위에서 아래로 당겨서 할 수는 없어? 버튼 안 생겼어 아무데도」
 *
 * 단추를 화면마다 달아뒀지만 그것으로는 부족하다. 단추는 **찾아야** 하고,
 * 홈 화면 앱은 화면마다 생김새가 다르다. 당기는 것은 찾을 것이 없다 —
 * 폰을 쓰는 사람이면 이미 손이 안다.
 *
 * 아이폰 홈 화면 앱에도 원래 당겨서 새로고침이 있긴 한데, 될 때가 있고 안 될
 * 때가 있다. 될 때가 있고 안 될 때가 있는 것은 **없는 것과 같다** — 한 번
 * 안 되면 다시 안 하시게 된다. 그래서 우리가 직접 만든다.
 *
 * 어디에 두나 — 뿌리 레이아웃(app/layout)에 한 번만 둔다. 화면마다 붙이면
 * 언젠가 한 화면을 빠뜨리고, 빠뜨린 그 화면에서 「여기선 안 되네」 가 된다.
 */
const TRIGGER = 70;      // 이만큼 당기면 새로고침
const MAX = 110;         // 더 당겨도 이만큼만 따라온다

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  // 손을 떼는 순간(onEnd)에 지금 얼마나 당겼는지를 알아야 한다.
  // state 로만 두면 손 뗄 때 **처음 값(0)** 을 보게 된다 — 그러면 영영 안 걸린다
  const now = useRef(0);
  const startY = useRef(null);
  const working = useRef(false);

  useEffect(() => {
    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    /**
     * **판 안에서 시작한 손가락은 당김이 아니다** (원장님, 2026-08-19 —
     * 「진도선택후 갑자기 창이닫혀」). 진도 판·긴 표가 판 안에서만
     * 굴러가게 되자(unitscroll·tblwrap) 페이지는 늘 맨 위다 — 판 안에서
     * 아래로 쓸어내린 것을 당김으로 받아 통째로 새로고침해 버렸다.
     * 안쪽에 굴러가는 상자가 있으면 그 상자의 몫이다.
     */
    function inInnerScroll(el) {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1) {
          const ov = getComputedStyle(n).overflowY;
          if (ov === "auto" || ov === "scroll") return true;
        }
      }
      return false;
    }

    function onStart(e) {
      // 시트(전면 판)가 열려 있으면 당김을 아예 안 잡는다 (2026-08-24 검증)
      // — 뒤를 잠그면 scrollY 가 0이라 「맨 위」 로 착각해, 시트를 쓸어내리는
      //   순간 페이지가 통째로 새로고침된다 (적던 것이 날아간다)
      if (document.documentElement.dataset.sheet === "open") return;
      if (working.current || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      // **맨 위에서 시작한 것만** 당김으로 본다. 중간에서 당기는 것은
      // 그냥 화면을 넘기는 것이다 — 그것까지 새로고침으로 받으면 못 쓴다
      startY.current =
        atTop() && !(e.target instanceof Element && inInnerScroll(e.target))
          ? e.touches[0].clientY
          : null;
    }

    function onMove(e) {
      if (startY.current === null || working.current) return;
      const dy = e.touches[0].clientY - startY.current;
      // 위로 올리는 중이거나 이미 스크롤이 내려갔으면 당김이 아니다
      if (dy <= 0 || !atTop()) {
        startY.current = dy <= 0 ? startY.current : null;
        now.current = 0;
        setPull(0);
        return;
      }
      // 손가락만큼 따라오지 않게 절반만 — 당기는 느낌이 나야 얼마나 더
      // 당겨야 하는지 손이 안다
      const v = Math.min(MAX, dy * 0.5);
      now.current = v;
      setPull(v);
    }

    function onEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (now.current >= TRIGGER) {
        working.current = true;
        setBusy(true);
        setPull(TRIGGER);
        window.location.reload();
        return;
      }
      now.current = 0;
      setPull(0);
    }

    // passive — 화면 넘기는 것을 막지 않는다. 우리는 **재보기만** 한다.
    //   막아버리면 당길 때마다 화면이 뻣뻣해지고, 그게 더 나쁘다.
    const opt = { passive: true };
    window.addEventListener("touchstart", onStart, opt);
    window.addEventListener("touchmove", onMove, opt);
    window.addEventListener("touchend", onEnd, opt);
    window.addEventListener("touchcancel", onEnd, opt);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (pull <= 0 && !busy) return null;

  const ready = pull >= TRIGGER;
  return (
    <div className="ptr" style={{ transform: `translateY(${Math.max(8, pull - 6)}px)` }}>
      <span className={`ptr-in${ready || busy ? " ptr-on" : ""}`}>
        {busy ? "새로 받는 중…" : ready ? "놓으면 새로고침" : "당겨서 새로고침"}
      </span>
    </div>
  );
}
