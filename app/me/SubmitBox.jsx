"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitFile, submitChecklist, removeSubmission } from "./submitActions";

/**
 * 숙제 한 건을 낸다.
 *
 * 아이가 쓰는 화면이라 **버튼 세 개**로 끝낸다.
 *   사진     — 카메라가 바로 열린다 (capture)
 *   녹음     — 누르면 녹음, 다시 누르면 끝 · 바로 올라간다
 *   체크리스트 — 선생님이 숙제마다 미리 적어둔 항목을 하나씩 짚는다
 *
 * 낸 것은 아래에 남고, 선생님이 보기 전까지는 지울 수 있다.
 */
export default function SubmitBox({ itemId, reportItemId, asId = null, mine = [], readOnly = false, checklist = [] }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);        // null | "list"
  const [ticked, setTicked] = useState(() => new Set());
  const [rec, setRec] = useState(null);          // MediaRecorder
  const [recSec, setRecSec] = useState(0);
  const fileRef = useRef(null);
  const timerRef = useRef(null);
  const router = useRouter();

  function send(form) {
    startTransition(async () => {
      const res = await submitFile(form);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.set("file", f);
    form.set("kind", f.type.startsWith("audio") ? "audio" : "photo");
    if (itemId) form.set("itemId", itemId);
    if (reportItemId) form.set("reportItemId", reportItemId);
    if (asId) form.set("asId", asId);
    send(form);
    e.target.value = "";
  }

  async function toggleRec() {
    if (rec) {
      rec.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("마이크를 쓸 수 없어요. 브라우저에서 마이크를 허용해주세요.");
      return;
    }
    const mr = new MediaRecorder(stream);
    const chunks = [];
    let sec = 0;
    setRecSec(0);
    timerRef.current = setInterval(() => setRecSec((sec += 1)), 1000);

    mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    mr.onstop = () => {
      clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop());
      setRec(null);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      const form = new FormData();
      form.set("file", new File([blob], "rec.webm", { type: blob.type }));
      form.set("kind", "audio");
      form.set("seconds", String(sec));
      if (itemId) form.set("itemId", itemId);
      if (reportItemId) form.set("reportItemId", reportItemId);
      if (asId) form.set("asId", asId);
      send(form);
    };
    mr.start();
    setRec(mr);
  }

  return (
    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={pickFile}
        />
        <button
          className="btn btn-sm"
          disabled={pending || readOnly || !!rec}
          onClick={() => fileRef.current?.click()}
        >
          📷 사진
        </button>
        <button
          className={`btn btn-sm ${rec ? "btn-primary" : ""}`}
          disabled={pending || readOnly}
          onClick={toggleRec}
        >
          {rec ? `⏹ 녹음 끝내기 ${recSec}초` : "🎤 녹음"}
        </button>
        {checklist.length > 0 && (
          <button
            className="btn btn-sm"
            disabled={pending || readOnly || !!rec}
            onClick={() => setOpen(open === "list" ? null : "list")}
          >
            ☑ 체크리스트
          </button>
        )}
      </div>

      {open === "list" && (
        <div className="stack" style={{ gap: 6 }}>
          {checklist.map((line, i) => (
            <label key={i} className="unitrow" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ticked.has(i)}
                onChange={() => {
                  const next = new Set(ticked);
                  next.has(i) ? next.delete(i) : next.add(i);
                  setTicked(next);
                }}
              />
              <span style={{ fontSize: 15, flex: 1 }}>{line}</span>
            </label>
          ))}
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || ticked.size === 0}
            onClick={() =>
              startTransition(async () => {
                const done = checklist.map((text, i) => ({ text, done: ticked.has(i) }));
                const res = await submitChecklist(itemId, reportItemId, done, asId);
                if (res?.error) { alert(res.error); return; }
                setTicked(new Set());
                setOpen(null);
                router.refresh();
              })
            }
          >
            {ticked.size}/{checklist.length} 내기
          </button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="stack" style={{ gap: 3 }}>
          {mine.map((m) => (
            <div className="unitrow" key={m.id}>
              <span className="tag tag-mint">
                {m.kind === "audio" ? "녹음" : m.kind === "checklist" ? "체크" : "사진"}
              </span>
              <span className="hint" style={{ flex: 1, fontSize: 13 }}>
                {m.kind === "audio" && m.seconds ? `${m.seconds}초 · ` : ""}
                {new Date(m.created_at).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
                })}{" "}
                냈어요
              </span>
              {m.checked_at ? (
                <span className="tag tag-sky">선생님 확인</span>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending || readOnly}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeSubmission(m.id);
                      if (res?.error) alert(res.error);
                      router.refresh();
                    })
                  }
                >
                  지우기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
