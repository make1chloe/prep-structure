"use client";

import { useEffect } from "react";

/**
 * **내려가면 대메뉴만, 올려 오면 소메뉴까지** (원장님, 2026-08-07 —
 * 「아래로 스크롤하면 대메뉴만 나오고 많이 올라가면 소메뉴 나오고」).
 *
 * CSS 만으로는 못 한다 — **어느 쪽으로 굴리는지**를 CSS 는 모른다.
 * 그래서 여기서 재고, 표시만 붙인다. 생김새는 전부 globals.css 에 있다
 * (색과 여백을 두 군데 두면 어긋난다).
 *
 * **표시는 <html> 에 붙인다.** 처음에는 `.topbar` 에 붙였는데, 그 화면이
 * 다시 그려지면(실시간 갱신 · router.refresh) React 가 그 마디를 통째로
 * 갈아치우면서 표시가 같이 날아갔다 — 굴려도 안 접히는 일이 생겼다.
 * <html> 은 갈아치울 일이 없다.
 *
 * ── 규칙 ────────────────────────────────────────────────
 *
 *   맨 위 근처(60px 안)        늘 펴둔다
 *   내려간다                   접는다
 *   **많이** 올라온다(90px 넘게) 편다
 *
 * 「많이」 가 중요하다. 조금만 올려도 펴지면, 목록을 훑다가 손가락이
 * 살짝 튈 때마다 메뉴가 튀어나와 읽던 자리를 덮는다. 그게 더 성가시다.
 *
 * 폰에서는 손가락을 뗀 뒤에도 화면이 미끄러진다(관성). 그동안 이 함수가
 * 수십 번 불리므로 **requestAnimationFrame 으로 한 번만** 계산한다 —
 * 안 그러면 스크롤이 뻑뻑해진다.
 */
const NEAR_TOP = 60;   // 이 안에서는 늘 펴둔다
const UP_ENOUGH = 90;  // 이만큼 올라와야 「많이 올라온 것」

export default function NavScroll() {
  useEffect(() => {
    const root = document.documentElement;

    let last = window.scrollY;
    let lowest = window.scrollY;   // 내려갔던 가장 아래 지점
    let queued = false;

    const set = (v) => {
      if (root.dataset.nav !== v) root.dataset.nav = v;
    };

    const measure = () => {
      queued = false;
      const y = window.scrollY;
      if (y <= NEAR_TOP) {
        set("full");
        lowest = y;
      } else if (y > last) {
        // 내려간다 — 접고, 되짚을 기준점을 여기로 옮긴다
        set("compact");
        lowest = y;
      } else if (lowest - y > UP_ENOUGH) {
        set("full");
      }
      last = y;
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return null;
}
