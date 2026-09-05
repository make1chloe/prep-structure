"use client";
/** 배색 고르기 — 목업 .skins 그대로. 열쇠는 chloe-skin 하나(layout 의 되살리기 스크립트와 같은 이름). 저장은 이 폰에만 — 사람마다 취향이라 서버에 안 둔다 */
import { useEffect, useState } from "react";
const SKINS = [["", "#1A5FD0", "기본"], ["ink", "#131B2C", "딥네이비"], ["warm", "#221C15", "따뜻하게"], ["paper", "#F1EDE4", "종이"], ["bright", "#FFFFFF", "밝게"]];
export default function Skins() {
  const [skin, setSkin] = useState("");
  useEffect(() => { try { setSkin(localStorage.getItem("chloe-skin") ?? ""); } catch {} }, []);
  const pick = (s) => { setSkin(s); try { if (s) { document.documentElement.dataset.skin = s; localStorage.setItem("chloe-skin", s); } else { delete document.documentElement.dataset.skin; localStorage.removeItem("chloe-skin"); } } catch {} };
  return (
    <div className="skins" aria-label="배색">
      <span className="fl">배색</span>
      {SKINS.map(([s, c, name]) => <button key={s} type="button" className="skinb" data-skin={s} aria-pressed={skin === s} onClick={() => pick(s)}><i className="sw" style={{ background: c }} />{name}</button>)}
    </div>
  );
}
