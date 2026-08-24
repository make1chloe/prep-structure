"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * **폰에서는 판을 화면 가득 띄운다** (원장님 2026-08-24 — 「모바일은 모달로
 * 다시 재구성하자. 세로 스크롤이 확실히 필요한 것 같아」).
 *
 * 계획을 여섯 판까지 고치며 검증한 결과, 이 훅이 하는 일은 **표시 두 개**뿐이다.
 * 나머지(모양·스크롤·높이)는 CSS 가 한다.
 *
 *   data-editing  판이 열려 있다 — 폭과 상관없이 늘. 오늘 화면의 실시간 갱신이
 *                 이걸 보고 20초에 한 번으로 늦춘다(적는 중에 끼어들지 않게).
 *   data-sheet    **폰에서 판이 전면으로 떠 있다** — 당김 새로고침·메뉴 접힘이
 *                 이걸 보고 쉰다. CSS 도 이 표시로만 시트를 켠다.
 *
 * **폭은 열 때 한 번만 본다.** 미디어쿼리로 켜면 폰을 가로로 돌리는 순간
 * 시트가 풀려 인라인으로 돌아가는데, 그때 스크롤 자리도 잃고 당김 새로고침도
 * 되살아난다. 한 번 시트로 열었으면 닫을 때까지 시트다.
 *
 * **잠금은 `overflow:hidden` 하나뿐이다.** `position:fixed` 로 몸통을 묶는
 * 흔한 수법은 쓰지 않는다 — 회전·키보드에서 화면이 얼어붙고, 스크롤 자리를
 * 되돌리는 코드가 또 하나 생긴다.
 */
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useSheet({ enabled = true, phoneUpTo = 700 } = {}) {
  // 열 때 한 번 정한다 — 회전해도 안 바뀐다
  const [phone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${phoneUpTo}px)`).matches;
  });
  const vvRef = useRef(null);

  // ① 판이 열려 있다 — 폭과 무관하게 늘 (PC 에서도 실시간 갱신을 늦춰야 한다)
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.editing = "1";
    return () => { delete root.dataset.editing; };
  }, [enabled]);

  // ② 폰 전면 시트 — 그릴 때 바로 붙인다(useLayoutEffect). 한 프레임이라도
  //    늦으면 그 사이 시작한 손가락이 당김 새로고침으로 들어간다
  useIso(() => {
    if (!enabled || !phone) return;
    const root = document.documentElement;
    root.dataset.sheet = "open";
    return () => { delete root.dataset.sheet; };
  }, [enabled, phone]);

  /**
   * ③ **키보드가 떠도 저장 줄이 보이게.**
   * iOS 는 키보드가 올라와도 화면 크기를 안 줄이고, 대신 「보이는 창」 을
   * 아래로 내려 앉힌다. 그래서 높이만 재면 저장 줄이 키보드 뒤에 남는다 —
   * 내려간 만큼(offsetTop)까지 같이 본다. 확대(핀치)했을 때 시트가 손톱만
   * 해지지 않게 하한을 둔다.
   */
  useEffect(() => {
    if (!enabled || !phone || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) { root.style.setProperty("--vvh", "100%"); return; }

    let raf = 0;
    let last = 0;
    const apply = () => {
      raf = 0;
      const h = Math.max(240, Math.round(vv.height));
      if (Math.abs(h - last) < 8) return;   // 주소창이 오르내릴 때 흔들리지 않게
      last = h;
      root.style.setProperty("--vvh", `${h}px`);
      root.style.setProperty("--vvtop", `${Math.round(vv.offsetTop)}px`);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    vvRef.current = vv;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
    };
  }, [enabled, phone]);

  return { phone };
}
