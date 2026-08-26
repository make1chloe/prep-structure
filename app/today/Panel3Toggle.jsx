"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPanel3 } from "./panelFlagActions";

/**
 * 새 판(3때 시트) 스위치 칩 — 원장 화면에만 그려진다 (page.jsx 가 역할을
 * 보고 넣는다). 켜도 이 브라우저만 새 판이라, 실수업은 구판 그대로다.
 */
export default function Panel3Toggle({ on = false }) {
  const [now, setNow] = useState(!!on);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function flip() {
    const next = !now;
    setNow(next);
    startTransition(async () => {
      await setPanel3(next);
      router.refresh();
    });
  }

  return (
    <button
      className={`btn btn-ghost btn-sm ${now ? "btn-on" : ""}`}
      title="새 판(3때 시트)을 이 브라우저에서만 켭니다"
      disabled={pending}
      onClick={flip}
    >
      {now ? "새 판 ●" : "새 판"}
    </button>
  );
}
