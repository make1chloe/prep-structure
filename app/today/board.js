"use client";
/** 01 판 — **한 번에 한 아이**((어12) · 원장님 2026-09-13 「쓸데없는 설명을 빼고 직관적으로 기능을 파악하고 생각의 흐름에 따라 페이지를 따라가게」).
 *  열린 아이 하나를 여기서 들고 줄(row.js)이 읽는다. PC(≥1100px · 목업 .split)에서는 이름이 왼쪽 열, 판이 오른쪽 열 — 둘이 열리면 판이 겹치므로 하나만 연다. 폰도 같은 규칙(한 아이씩).
 *  저장하지 않는다 — 브라우저 저장은 배색뿐(폰-7) · PC 는 왼쪽 이름 줄이 늘 보여 「어디 있었나」가 한 번 누르면 돌아온다 */
import { createContext, useContext, useState } from "react";
const Ctx = createContext({ openId: null, setOpenId: () => {} });
export default function Board({ initial = null, children }) {
  const [openId, setOpenId] = useState(initial);
  return <Ctx.Provider value={{ openId, setOpenId }}><div className="split">{children}</div></Ctx.Provider>;
}
/** 줄 하나의 열림 — [열렸나, 열기/닫기] */
/** 줄 하나의 열림 — [열렸나, 열기/닫기, 다음 아이(go 면 연다 · 마감 안 한 다음 줄 · 없으면 null)]((어24) 「저장하고 마감 → 다음 아이」) */
export function useOpen(id) { const { openId, setOpenId } = useContext(Ctx);
  const nextOf = (go = false) => { if (typeof document === "undefined") return null; const ids = [...document.querySelectorAll(".row[data-student]")].filter((el) => !el.classList.contains("closed")).map((el) => el.dataset.student); const i = ids.indexOf(id); const n = ids.find((_, k) => k > i) ?? null; if (go && n) setOpenId(n); return n; };
  return [openId === id, (v) => setOpenId(v ? id : null), nextOf]; }
