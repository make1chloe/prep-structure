"use client";
/** 🎙 음성으로 내기 한 벌 — 아이가 숙제를 말로 낸다(원장님 2026-09-17 「숙제 음성녹음으로 제출도 가능하게 해줘」).
 *  폰이 녹음하고(MediaRecorder) 다 하면 /api/files 로 보낸다 — **올리는 길은 Upload 와 같은 한 곳**이다(원칙-1).
 *  못 쓰는 기기(허락 안 함 · 옛 브라우저)는 그 자리에서 까닭을 말한다(대전제-0) — 조용히 사라지지 않는다.
 *  길이·크기 문턱은 v2.rule(file.audio_max_sec · file.audio_max_mb)에서 온다 — 여기 숫자를 박지 않는다 */
import { useEffect, useRef, useState } from "react";
import { sizeText } from "@/lib/files-plan";
import { icon } from "./icon.js";
import { ACT } from "@/lib/emoji";   // (어76) 단추 그림은 기능 표에서(대전제-25)
const TRY = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const pickType = () => { if (typeof MediaRecorder === "undefined") return null; for (const m of TRY) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* 옛 브라우저 */ } } return ""; };
const bare = (m) => String(m || "audio/webm").split(";")[0];
const ext = (m) => ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" })[bare(m)] ?? "webm";
export const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
export default function Rec({ studentId = null, itemId = null, rules = {}, onDone = null, label = null }) {
  const maxSec = Number(rules["file.audio_max_sec"] ?? 600), maxMb = Number(rules["file.audio_max_mb"] ?? 20);
  const [on, setOn] = useState(false), [sec, setSec] = useState(0), [blob, setBlob] = useState(null), [url, setUrl] = useState("");
  const [why, setWhy] = useState(""), [busy, setBusy] = useState(false);
  const mr = useRef(null), parts = useRef([]), tick = useRef(null), urlRef = useRef("");
  useEffect(() => () => { clearInterval(tick.current); try { mr.current?.stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* 이미 꺼짐 */ } if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const put = (b, type) => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); const u = b ? URL.createObjectURL(b) : ""; urlRef.current = u; setBlob(b); setUrl(u); void type; };
  const stop = () => { try { mr.current?.stop(); } catch { /* 이미 멈춤 */ } };
  const go = async () => {
    setWhy(""); put(null);
    const type = pickType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) { setWhy("이 기기에서는 녹음이 안 돼요. 사진으로 내도 돼요"); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setWhy(String(e?.name) === "NotAllowedError" ? "마이크 허락이 필요해요" : `마이크를 못 켰어요 · ${String(e?.message ?? e)}`); return; }
    let rec; try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); }
    catch (e) { stream.getTracks().forEach((t) => t.stop()); setWhy(`녹음을 못 켰어요 · ${String(e?.message ?? e)}`); return; }
    parts.current = []; mr.current = rec;
    rec.ondataavailable = (e) => { if (e.data?.size) parts.current.push(e.data); };
    rec.onstop = () => { clearInterval(tick.current); stream.getTracks().forEach((t) => t.stop()); setOn(false);
      const m = bare(rec.mimeType || type); put(new Blob(parts.current, { type: m }), m); };
    rec.start(); setOn(true); setSec(0);
    tick.current = setInterval(() => setSec((s) => { const n = s + 1; if (n >= maxSec) stop(); return n; }), 1000);
  };
  const send = async () => {
    if (!blob) return;
    if (blob.size > maxMb * 1048576) { setWhy(`${maxMb}MB 를 넘어요 · ${sizeText(blob.size)} · 짧게 다시 녹음해 줘요`); return; }
    setBusy(true); setWhy("");
    const fd = new FormData();
    fd.append("file", blob, `음성 ${clock(sec)}.${ext(blob.type)}`); fd.append("mime", bare(blob.type));
    if (studentId) fd.append("student", studentId); if (itemId) fd.append("item", itemId);
    try {
      const r = await fetch("/api/files", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setWhy(j.msg ?? `보내지 못했어요 · ${r.status}`); setBusy(false); return; }
      put(null); setSec(0); setBusy(false); onDone?.({ sent: 1 });
    } catch (e) { setWhy(String(e?.message ?? e)); setBusy(false); }
  };
  return (
    <div data-g="rec" className="wv" style={{ marginTop: 8, marginBottom: 0 }}>
      {!on && !blob && <button type="button" className="btn sm" data-act="rec-start" onClick={go}>{label ?? `${ACT.rec} 음성으로 내기`}</button>}
      {on && <><button type="button" className="btn sm pri" data-act="rec-stop" onClick={stop}>{ACT.end} 그만</button><span className="tag" data-g="rec-time" style={{ color: "var(--miss)" }}>{clock(sec)}</span><small className="k">{clock(maxSec)}까지</small></>}
      {blob && !on && <>
        <audio data-g="rec-play" src={url} controls preload="metadata" style={{ height: 32, maxWidth: 220 }} />
        <span className="tag" data-g="rec-size">{clock(sec)} · {sizeText(blob.size)}</span>
        <button type="button" className="btn sm pri" data-act="rec-send" disabled={busy} onClick={send}>{busy ? "보내는 중…" : "보내기"}</button>
        <button type="button" className="btn sm gho" data-act="rec-again" disabled={busy} {...icon("다시 녹음")} onClick={() => { put(null); setSec(0); }}>✕</button>
      </>}
      {why && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }} data-g="rec-why">{why}</p>}
    </div>
  );
}
