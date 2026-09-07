"use client";
/** 📷 사진 미리보기 한 벌(3단계-9b ① — 원장님 답 ㉙) — 작은 미리보기를 누르면 그 자리에서 크게(라이트박스). 그림은 /api/files/id 한 길(읽어도 되나는 v2.file 규칙). pdf·문서는 부르지 않는다(열기 단추) */
import { useEffect, useState } from "react";
export default function Photo({ id, name = "사진", size = 72 }) {
  const [open, setOpen] = useState(false); const [bad, setBad] = useState(false);
  useEffect(() => { if (!open) return; const k = (e) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  if (bad) return null;
  return (<>
    <button type="button" data-g="thumb" data-file={id} aria-label={`${name} 크게 보기`} onClick={() => setOpen(true)} style={{ width: size, height: size, padding: 0, border: "1px solid var(--hair)", borderRadius: 8, background: "var(--sunk)", overflow: "hidden", cursor: "zoom-in", flex: "0 0 auto" }}>
      <img src={`/api/files/${id}`} alt={name} loading="lazy" onError={() => setBad(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </button>
    {open && <div className="mdlov" data-g="lightbox" role="dialog" aria-label={name} onClick={() => setOpen(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <img src={`/api/files/${id}`} alt={name} style={{ maxWidth: "96vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 8, background: "var(--surface)" }} onClick={(e) => e.stopPropagation()} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 12, display: "flex", justifyContent: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
        <a className="btn sm" href={`/api/files/${id}?dl=1`} data-act="lightbox-save">💾 저장</a><button type="button" className="btn sm pri" data-act="lightbox-close" onClick={() => setOpen(false)}>닫기</button></div>
    </div>}
  </>);
}
