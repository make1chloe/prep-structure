"use client";
/** 📤 올리기 한 벌 — 원장(자료함 보내기) · 아이 · 학부모가 같은 부품. 사진은 폰에서 긴 변을 줄여 보낸다(규칙 file.photo_px) · 한 번에 N장(file.batch_max) · 파일마다 /api/files 한 번(서버가 종류·크기·자격을 본다).
 *  실패는 파일마다 그 자리에서 말한다 — 조용히 빠뜨리지 않는다(대전제-0) */
import { useRef, useState } from "react";
import { acceptBatch, checkFile, isImage, shrinkPlan, sizeText } from "@/lib/files-plan";
async function shrinkImage(file, maxPx) {
  try {
    const bmp = await createImageBitmap(file);
    const p = shrinkPlan(bmp.width, bmp.height, maxPx);
    if (!p.shrink && file.type === "image/jpeg") { bmp.close?.(); return { blob: file, shrunk: false, mime: file.type, name: file.name }; }
    const c = document.createElement("canvas"); c.width = p.w; c.height = p.h; c.getContext("2d").drawImage(bmp, 0, 0, p.w, p.h); bmp.close?.();
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) throw new Error("못 줄임");
    return { blob, shrunk: p.shrink, mime: "image/jpeg", name: file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg" };
  } catch { return { blob: file, shrunk: false, mime: file.type, name: file.name }; }   // 못 읽는 사진(HEIC 등)은 그대로 — 서버가 종류를 본다
}
export default function Upload({ rules = {}, studentId = null, kids = null, itemId = null, onDone = null, label = "📷 사진 · 📄 파일 보내기", hint = "학교에서 받은 종이를 찍어 보내면 원장님만 봅니다", compact = false }) {
  const [files, setFiles] = useState([]); const [note, setNote] = useState(""); const [kid, setKid] = useState(kids?.[0]?.id ?? ""); const [busy, setBusy] = useState(false); const [out, setOut] = useState(null); const ref = useRef(null);
  const maxPx = Number(rules["file.photo_px"] ?? 1600), batchMax = Number(rules["file.batch_max"] ?? 30), maxMb = Number(rules["file.max_mb"] ?? 4);
  const target = kids ? kid : studentId;
  const go = async () => {
    const a = acceptBatch(files.length, batchMax); if (!a.ok) { setOut({ sent: 0, fails: [a.msg] }); return; }
    if (kids && kids.length > 1 && !kid) { setOut({ sent: 0, fails: ["누구 학교 것인지 고르세요"] }); return; }
    setBusy(true); const fails = []; let sent = 0;
    for (const f of files) {
      const s = isImage(f.type) ? await shrinkImage(f, maxPx) : { blob: f, shrunk: false, mime: f.type, name: f.name };
      const why = checkFile({ name: s.name, mime: s.mime, bytes: s.blob.size }, { maxMb }); if (why) { fails.push(why); continue; }
      const fd = new FormData(); fd.append("file", s.blob, s.name); fd.append("mime", s.mime); if (target) fd.append("student", target); if (itemId) fd.append("item", itemId); if (note.trim()) fd.append("note", note.trim()); fd.append("shrunk", s.shrunk ? "1" : "0");
      try { const r = await fetch("/api/files", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) fails.push(`${s.name} — ${j.msg ?? r.status}`); else sent++; }
      catch (e) { fails.push(`${s.name} — ${String(e?.message ?? e)}`); }
    }
    setBusy(false); setOut({ sent, fails }); if (sent) { setFiles([]); setNote(""); if (ref.current) ref.current.value = ""; onDone?.({ sent, fails }); }
  };
  return (
    <div data-g="upload">
      {kids && kids.length > 1 && <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><label className="fl" style={{ margin: 0 }}>누구 학교 것인가요</label><select value={kid} aria-label="누구 학교 것인가요" data-g="kid-pick" onChange={(e) => setKid(e.target.value)} style={{ width: "auto" }}>{kids.map((k) => <option key={k.id} value={k.id}>{k.name}{k.schools?.name ? ` · ${k.schools.name}` : ""}</option>)}</select></div>}
      <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}>
        <input ref={ref} type="file" multiple accept="image/*,application/pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" aria-label={label} onChange={(e) => { setOut(null); setFiles([...(e.target.files ?? [])]); }} style={{ flex: "1 1 200px" }} />
        {!compact && <input type="text" value={note} placeholder="한 마디 (예: 수행평가 안내문이에요)" aria-label="한 마디" onChange={(e) => setNote(e.target.value)} style={{ flex: "1 1 160px" }} />}
        <button type="button" className="btn sm pri" data-act="upload" disabled={busy || !files.length} onClick={go}>{busy ? "보내는 중…" : `보내기${files.length ? ` ${files.length}장` : ""}`}</button>
      </div>
      <p className="note k" style={{ margin: "4px 0 0" }}>{hint} · 한 번에 {batchMax}장까지 · 사진은 긴 변 {maxPx}px 로 줄여 보냅니다(pdf·문서는 그대로 · {maxMb}MB 까지){files.length ? ` · 고른 것 ${files.length}장 ${sizeText(files.reduce((n, f) => n + f.size, 0))}` : ""}</p>
      {out && <div className={"lf " + (out.fails.length ? "warn" : "ok")} role={out.fails.length ? "alert" : undefined} data-g="upload-out" style={{ marginTop: 8 }}><span className="ln">{out.fails.length ? "!" : "✓"}</span><div><b>{out.sent ? `${out.sent}장 보냈어요` : "못 보냈어요"}</b>{out.fails.map((f, i) => <small key={i}>{f}</small>)}</div></div>}
    </div>
  );
}
