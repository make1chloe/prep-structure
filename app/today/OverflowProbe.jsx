"use client";

import { useEffect, useState } from "react";

/**
 * **임시 진단 v2 (2026-08-27)** — 수업 탭 가로 스크롤의 범인 찾기.
 *
 * v1 의 두 가지 실패에서 배웠다:
 *   1. **2초 간격 전체 훑기가 화면을 느리게 했다** — 이제 시간표가 아니라
 *      **사건**(옆으로 밀림·크기 변화·탭 전환)에만 깨어난다.
 *   2. **문서 폭만 보면 아이폰의 밀림을 놓친다** — 문서는 정상 폭인데
 *      화면이 옆으로 밀리는 경우(입력칸 자동 확대, 실제 스크롤)를 v1 이
 *      못 잡아 「빨간 줄 없이 가로 스크롤」 이 났다. 이제 네 가지를 본다:
 *      실제 밀림(scrollX) · 문서 넘침 · 확대 배율 · 확대 상태의 가로 이동.
 *
 * 범인을 잡아 수리하면 이 파일과 마운트 한 줄은 걷어낸다.
 */
export default function OverflowProbe() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let t = null;

    const worst = () => {
      // 넘쳤을 때만 부르는 무거운 훑기 — 화면 밖 제일 안쪽 요소
      const W = document.documentElement.clientWidth;
      let best = null;
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right <= W + 1 || r.width === 0) return;
        for (const c of el.children) {
          if (c.getBoundingClientRect().right > W + 1) return;
        }
        if (!best || r.right > best.right) {
          const cls =
            typeof el.className === "string" ? el.className.trim() : "";
          best = {
            right: r.right,
            label: `<${el.tagName.toLowerCase()} ${cls}> 「${(el.textContent || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 30)}」`,
          };
        }
      });
      return best ? best.label : "요소 미상";
    };

    const scan = () => {
      t = null;
      const W = document.documentElement.clientWidth;
      const doc = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      );
      const x = Math.max(
        window.scrollX || 0,
        document.documentElement.scrollLeft || 0,
        document.body.scrollLeft || 0
      );
      const vv = window.visualViewport;

      if (x > 2) setMsg(`v2 밀림 ${Math.round(x)}px — ${worst()}`);
      else if (doc > W + 1)
        setMsg(`v2 문서넘침 ${Math.round(doc - W)}px — ${worst()}`);
      else if (vv && vv.scale > 1.01)
        setMsg(
          `v2 화면확대 ${vv.scale.toFixed(2)}배 (입력칸 확대 의심) — 가로이동 ${Math.round(vv.offsetLeft)}px`
        );
      else if (vv && vv.offsetLeft > 2)
        setMsg(`v2 확대이동 ${Math.round(vv.offsetLeft)}px`);
      else setMsg("");
    };

    // 사건이 있을 때만, 몰아서 한 번 — 시간표(interval) 없음
    const poke = () => {
      if (t) return;
      t = setTimeout(scan, 400);
    };

    scan();
    window.addEventListener("scroll", poke, { passive: true });
    window.addEventListener("resize", poke);
    window.addEventListener("click", poke, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", poke);
      vv.addEventListener("scroll", poke);
    }
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("scroll", poke);
      window.removeEventListener("resize", poke);
      window.removeEventListener("click", poke);
      if (vv) {
        vv.removeEventListener("resize", poke);
        vv.removeEventListener("scroll", poke);
      }
    };
  }, []);

  if (!msg) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99,
        background: "#b91c1c",
        color: "#fff",
        fontSize: 12,
        padding: "4px 8px",
        wordBreak: "break-all",
      }}
    >
      {msg}
    </div>
  );
}
