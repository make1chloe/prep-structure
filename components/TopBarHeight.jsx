"use client";

import { useEffect } from "react";

/**
 * 위 메뉴의 **높이 두 가지**를 CSS 에 알려준다.
 *
 *   --topbar-full  펴졌을 때의 높이 → 문서 맨 위에 잡아둘 빈자리(body 패딩)
 *   --topbar-h     접혔을 때의 높이 → 옆판이 붙을 자리(.split-panel top)
 *
 * ── 왜 재야 하나 ────────────────────────────────────────
 *
 * 원장님 (2026-08-07) — 「재원생에서 학생 이름이 밑에 있을 때 맨 위
 * 페이지까지 올리지 않으면 재원생 이름이 잘려」
 *
 * 오른쪽 판이 `position: sticky` 로 붙는데, 위 메뉴도 붙어 있고 z-index 가
 * 더 높다. 그래서 판이 화면 맨 위에 닿는 순간 **메뉴 뒤로 들어가서** 이름
 * 줄이 잘렸다.
 *
 * 높이를 숫자로 박아둘 수가 없다 — 메뉴 줄 수는 역할(원장·강사)과 화면
 * 너비에 따라 달라진다. 그래서 재보고 알려준다. 창 크기가 바뀌면 다시 잰다.
 *
 * **펴진 높이는 펴져 있을 때만 잰다.** 접힌 상태에서 재서 넣으면, 맨 위로
 * 올라왔을 때 빈자리가 모자라 메뉴가 글을 덮는다.
 */
export default function TopBarHeight() {
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const root = document.documentElement;

    /**
     * 접혔을 때와 펴졌을 때가 서로 다른 값이라, **그때그때 그 값을** 넣는다.
     * 접히면 머리말 높이 자체가 달라지므로 ResizeObserver 가 알아서 부른다.
     */
    const apply = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h <= 0) return;
      if (root.dataset.nav === "compact") root.style.setProperty("--topbar-h", `${h}px`);
      else root.style.setProperty("--topbar-full", `${h}px`);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);
  return null;
}
