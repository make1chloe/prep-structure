"use client";

import { useEffect } from "react";

/**
 * 위 메뉴의 **실제 높이**를 CSS 에 알려준다 (`--topbar-h`).
 *
 * 원장님 (2026-08-07) — 「재원생에서 학생이름이 밑에 있을때 맨위 페이지까지
 * 올리지 않으면 재원생 이름이 잘려」
 *
 * 오른쪽 판은 `position: sticky; top: 12px` 로 붙어 있었다. 그런데 위 메뉴도
 * 같이 붙어 있고(z-index 가 더 높다), 메뉴가 **두 줄**이라 120px 넘게 차지한다.
 * 그래서 판이 화면 맨 위에 붙는 순간 **메뉴 뒤로 들어가서** 이름 줄이 잘렸다.
 *
 * 높이를 숫자로 박아둘 수가 없다 — 메뉴 줄 수는 역할(원장·강사)과 화면 너비에
 * 따라 달라진다. 그래서 **재보고 알려준다.** 창 크기가 바뀌면 다시 잰다.
 */
export default function TopBarHeight() {
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const apply = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      // 좁은 화면에서는 메뉴가 안 붙어 있다 (position: static) — 0 으로 둔다
      const stuck = getComputedStyle(bar).position === "sticky";
      document.documentElement.style.setProperty("--topbar-h", `${stuck ? h : 0}px`);
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
