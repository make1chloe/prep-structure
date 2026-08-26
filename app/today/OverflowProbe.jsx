"use client";

import { useEffect, useState } from "react";

/**
 * **임시 진단 (2026-08-27)** — 수업 탭 가로 스크롤의 범인 찾기.
 *
 * 원장 실물(아이폰 14 프로)에서만 나는 가로 넘침을 검사판(390·375·360,
 * 실물 모양 씨앗)이 재현하지 못했다 — 실데이터에만 있는 무언가다.
 * 그래서 현장에서 잡는다: 문서가 화면보다 넓어지는 순간, 화면 밖으로
 * 나간 **제일 안쪽 요소**의 이름·클래스·글머리를 아래 빨간 줄로 띄운다.
 * 원장은 그 줄을 찍어 보내기만 하면 된다.
 *
 * 범인을 잡아 수리하면 이 파일과 마운트 한 줄은 걷어낸다.
 */
export default function OverflowProbe() {
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const scan = () => {
      const W = document.documentElement.clientWidth;
      const doc = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      );
      if (doc <= W + 1) {
        setMsg("");
        return;
      }
      let best = null;
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right <= W + 1 || r.width === 0) return;
        // 자식이 넘쳤으면 부모는 범인이 아니다 — 제일 안쪽만
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
      setMsg(
        `가로넘침 ${Math.round(doc - W)}px — ${best ? best.label : "요소 미상"}`
      );
    };
    scan();
    const t = setInterval(scan, 2000);
    return () => clearInterval(t);
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
