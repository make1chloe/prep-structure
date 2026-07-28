"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitFile, submitText, removeSubmission } from "./submitActions";

/**
 * 숙제 한 건을 낸다.
 *
 * 아이가 쓰는 화면이라 **버튼 세 개**로 끝낸다.
 *   사진 — 카메라가 바로 열린다 (capture)
 *   녹음 — 누르면 녹음, 다시 누르면 끝 · 바로 올라간다
 *   글   — 짧은 답
 *
 * 낸 것은 아래에 남고, 선생님이 보기 전까지는 지울 수 있다.
 */
export default function SubmitBox({ itemId, reportItemId, asId = null, mine = [], readOnly = false }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);        // null | "text"
  const [text, setText] = useState("");
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
        <button
          className="btn btn-sm"
          disabled={pending || readOnly || !!rec}
          onClick={() => setOpen(open === "text" ? null : "text")}
        >
          ✎ 글
        </button>
      </div>

      {open === "text" && (
        <div className="stack" style={{ gap: 6 }}>
          <textarea
            className="input"
            rows={3}
            value={text}
            placeholder="여기에 적어서 내면 돼요"
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !text.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await submitText(itemId, reportItemId, text, asId);
                if (res?.error) { alert(res.error); return; }
                setText("");
                setOpen(null);
                router.refresh();
              })
            }
          >
            내기
          </button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="stack" style={{ gap: 3 }}>
          {mine.map((m) => (
            <div className="unitrow" key={m.id}>
              <span className="tag tag-mint">
                {m.kind === "audio" ? "녹음" : m.kind === "text" ? "글" : "사진"}
              </span>
              <span className="hint" style={{ flex: 1, fontSize: 12 }}>
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
