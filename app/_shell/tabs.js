"use client";
/** 상단 탭 — 지금 화면의 탭이 파랗다(목업 .tab[aria-current] — 어느 탭인가는 lib/menu currentTab 한 곳) · 누르면 서버가 답하기 전에 그 탭이 먼저 파랗게(pressed — 주소가 바뀌면 지운다 · LIMIT_MS 안에 안 바뀌어도 지운다). 표를 안 읽는다(속도-2) */
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { currentTab } from "@/lib/menu";
import { LIMIT_MS } from "./going.js";
export default function Tabs({ items }) {
  const pathname = usePathname(); const [pressed, setPressed] = useState(null);
  useEffect(() => { setPressed(null); }, [pathname]);
  useEffect(() => { if (!pressed) return; const t = setTimeout(() => setPressed(null), LIMIT_MS); return () => clearTimeout(t); }, [pressed]);
  const cur = pressed ?? currentTab(items, pathname);
  return <nav className="tabs" aria-label="메뉴">{items.map((m) => <Link prefetch={false} key={m.key} className="tab" href={m.href} aria-current={cur === m.href ? "true" : undefined} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; setPressed(m.href); }}>{m.name}</Link>)}</nav>;
}
