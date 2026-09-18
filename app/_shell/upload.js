"use client";
/** 📤 올리기 한 벌 · 원장(자료실 보내기) · 아이 · 학부모가 같은 부품. 고르는 단추는 이름이 보이는 label.btn(브라우저 기본 「Choose Files」 칸은 숨긴다 · (어17) 원장님 9/14 「보이게」 · 고른 것은 아래 줄로). 사진은 폰에서 긴 변을 줄여 보낸다(규칙 file.photo_px) · 한 번에 N장(file.batch_max) · 파일마다 /api/files 한 번(서버가 종류·크기·자격을 본다).
 *  실패는 파일마다 그 자리에서 말한다 — 조용히 빠뜨리지 않는다(대전제-0) */
import { useEffect, useRef, useState } from "react";
import { acceptBatch, checkFile, isImage, shrinkPlan, sizeText, pickRows, withoutPick } from "@/lib/files-plan";
import { icon } from "./icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
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
export default function Upload({ rules = {}, studentId = null, kids = null, itemId = null, todoId = null, paste = false, sendRef = null, onDone = null, label = "📷 사진 · 📄 파일 보내기", hint = "원장님만 봅니다", compact = false }) {
  const [files, setFiles] = useState([]); const [urls, setUrls] = useState([]);   // ⑦ 고른 사진의 미리보기 주소(지우면 같이 지운다)
  useEffect(() => { const u = files.map((f) => (isImage(f.type) ? URL.createObjectURL(f) : null)); setUrls(u); return () => u.forEach((x) => x && URL.revokeObjectURL(x)); }, [files]); const [note, setNote] = useState(""); const [kid, setKid] = useState(kids?.[0]?.id ?? ""); const [busy, setBusy] = useState(false); const [out, setOut] = useState(null); const ref = useRef(null);
  // (어78) 원장님 2026-09-17 「클립보드에서 사진 붙여넣기 가능해야 되고」 — 붙여넣기는 **문서에 귀를 달아** 듣는다.
  //   칸 안에서만 들으면 글 칸을 누르고 있어야 붙는데, 화면을 찍어 바로 Ctrl+V 하는 손은 아무 데도 안 누르고 있다.
  //   이 부품이 떠 있는 동안만 듣는다(퀵 메모를 닫으면 귀도 뗀다) · 고른 것에 **덧붙인다**(먼저 고른 파일을 안 지운다)
  useEffect(() => {
    if (!paste) return;
    const on = (e) => { const fs = [...(e.clipboardData?.files ?? [])].filter((f) => f && f.size); if (!fs.length) return; e.preventDefault(); setOut(null); setFiles((old) => [...old, ...fs]); };
    document.addEventListener("paste", on); return () => document.removeEventListener("paste", on);
  }, [paste]);
  const maxPx = Number(rules["file.photo_px"] ?? 1600), batchMax = Number(rules["file.batch_max"] ?? 30), maxMb = Number(rules["file.max_mb"] ?? 4), audioMaxMb = Number(rules["file.audio_max_mb"] ?? 20);   // (어76) 음성은 사진보다 크다
  const target = kids ? kid : studentId;
  /* ⚠️ 이 손은 단추의 onClick 으로도 불리고(그때 첫 인자는 **클릭 사건**이다) 퀵 메모의 send 로도 불린다 —
   *  그래서 **글자일 때만** 업무 번호로 친다(사건을 업무 번호로 보내 「업무 줄이 아닙니다」가 났다 · 걷기가 잡았다) */
  const go = async (over = null) => {
    const overTodo = typeof over === "string" && over ? over : null;
    const a = acceptBatch(files.length, batchMax); if (!a.ok) { setOut({ sent: 0, fails: [a.msg] }); return; }
    if (kids && kids.length > 1 && !kid) { setOut({ sent: 0, fails: ["누구 학교 것인지 고르세요"] }); return; }
    setBusy(true); const fails = []; let sent = 0;
    for (const f of files) {
      const s = isImage(f.type) ? await shrinkImage(f, maxPx) : { blob: f, shrunk: false, mime: f.type, name: f.name };
      const why = checkFile({ name: s.name, mime: s.mime, bytes: s.blob.size }, { maxMb, audioMaxMb }); if (why) { fails.push(why); continue; }
      const fd = new FormData(); fd.append("file", s.blob, s.name); fd.append("mime", s.mime); if (target) fd.append("student", target); if (itemId) fd.append("item", itemId); if (overTodo || todoId) fd.append("todo", overTodo || todoId); if (note.trim()) fd.append("note", note.trim()); fd.append("shrunk", s.shrunk ? "1" : "0");
      try { const r = await fetch("/api/files", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) fails.push(`${s.name} · ${j.msg ?? r.status}`); else sent++; }
      catch (e) { fails.push(`${s.name} · ${String(e?.message ?? e)}`); }
    }
    setBusy(false); setOut({ sent, fails }); if (sent) { setFiles([]); setNote(""); if (ref.current) ref.current.value = ""; onDone?.({ sent, fails }); }
  };
  // (어78) 📌 퀵 메모는 **업무를 먼저 세우고** 그 줄에 붙인다(붙을 자리가 있어야 붙는다) — 저장 단추가 여기 send 를 부른다.
  //   올리는 길은 그대로 한 곳이다(원칙-1) · 파일이 바뀔 때마다 다시 매단다(안 그러면 옛 목록을 보낸다)
  useEffect(() => { if (sendRef) sendRef.current = { send: go, count: files.length }; });
  return (
    <div data-g="upload">
      {kids && kids.length > 1 && <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><label className="fl" style={{ margin: 0 }}>누구 학교 것인가요</label><select value={kid} aria-label="누구 학교 것인가요" data-g="kid-pick" onChange={(e) => setKid(e.target.value)} style={{ width: "auto" }}>{kids.map((k) => <option key={k.id} value={k.id}>{k.name}{k.schools?.name ? ` · ${k.schools.name}` : ""}</option>)}</select></div>}
      <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}>
        <label className="btn sm" data-g="pick" style={{ cursor: "pointer" }}>{label}<input ref={ref} type="file" multiple accept="image/*,audio/*,application/pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" aria-label={label} onChange={(e) => { setOut(null); setFiles([...(e.target.files ?? [])]); }} style={{ display: "none" }} /></label>
        {!compact && <input type="text" value={note} placeholder="한 마디 (예: 수행평가 안내문)" aria-label="한 마디" onChange={(e) => setNote(e.target.value)} style={{ flex: "1 1 160px" }} />}
        <button type="button" className="btn sm pri" data-act="upload" disabled={busy || !files.length} onClick={go}>{busy ? "보내는 중…" : `보내기${files.length ? ` ${files.length}장` : ""}`}</button>
      </div>
      {files.length > 0 && <div className="tags" style={{ marginTop: 8 }} data-g="picks">{pickRows(files).map((r) => <span key={r.i} className="tag" data-g="pick-row" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{r.photo && urls[r.i] ? <img src={urls[r.i]} alt={r.name} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} /> : "📄"} {r.name} <small>{r.size}</small><button type="button" className="btn sm gho" data-act="pick-remove" {...icon(`${r.name} 빼기`)} onClick={() => setFiles(withoutPick(files, r.i))} style={{ padding: "0 6px" }}>✕</button></span>)}</div>}
      <p className="note k" style={{ margin: "4px 0 0" }}>{hint}{files.length ? ` · 고른 것 ${files.length}장 ${sizeText(files.reduce((n, f) => n + f.size, 0))}` : ""}</p>
      {out && <div className={"lf " + (out.fails.length ? "warn" : "ok")} role={out.fails.length ? "alert" : undefined} data-g="upload-out" style={{ marginTop: 8 }}><span className="ln">{out.fails.length ? "!" : "✓"}</span><div><b>{out.sent ? `${out.sent}장 보냈어요` : "못 보냈어요"}</b>{out.fails.map((f, i) => <small key={i}>{f}</small>)}</div></div>}
    </div>
  );
}
