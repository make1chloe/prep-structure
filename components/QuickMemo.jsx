"use client";

import { useRef, useState, useTransition } from "react";
import { addQuickMemo } from "@/app/tasks/actions";
import { uploadTaskFile, dropTaskFile } from "@/app/tasks/photoActions";
import { MAX_UPLOAD } from "@/lib/noticeFile";

/**
 * **아무 화면에서나 한 줄 메모** (원장님, 2026-08-21 — 「수업 하다가 갑자기
 * 생각난 것에 대해 일단 메모할 수 있는 방법이 필요. 아무 페이지에나 다 있는
 * 간단한 거면 좋겠음」).
 *
 * 위 메뉴의 ✏️ 하나 — 누르면 작은 판, 적고 Enter 면 **오늘 할일**로
 * 들어간다 (새 저장소를 만들지 않는다 — 메모는 나중에 처리할 일이고,
 * 할일 인박스가 이미 그 자리다. 원칙 1). 화면 이동 없음, 저장 후 그대로
 * 이어서 일한다.
 *
 * **사진·파일도 붙는다** (원장님, 2026-08-22 — 「어제 만든 퀵메모에
 * 클립보드에 저장된 사진 올리기, 파일, 사진 추가 가능하게 해주라」).
 * 붙여넣기(캡처) · 📷 사진 · 📎 파일 — 판에 목록으로 보이다가, 저장할 때
 * 한꺼번에 올라간다 (0147). 글 없이 첨부만으로도 저장된다.
 */
export default function QuickMemo() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  // 붙인 파일들 — 저장 전엔 손 안에만 있다. { key, file, url(그림 미리보기), path(올라간 뒤) }
  const [files, setFiles] = useState([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const photoRef = useRef(null);
  const fileRef = useRef(null);

  function addFiles(list) {
    const ok = [];
    for (const f of list) {
      if (!f || f.size === 0) continue;
      // 크기 상한은 서버·버킷과 같은 한 벌 (lib/noticeFile)
      if (f.size > MAX_UPLOAD) { alert(`${f.name || "파일"} — 너무 커요 (25MB까지).`); continue; }
      ok.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        url: String(f.type || "").startsWith("image/") ? URL.createObjectURL(f) : null,
        path: null,
      });
    }
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  }

  function removeFile(entry) {
    if (entry.url) URL.revokeObjectURL(entry.url);
    // 지난 실패 때 이미 올라간 것이면 보관함에서도 치운다 (주인 없는 파일 방지)
    if (entry.path) dropTaskFile(entry.path);
    setFiles((prev) => prev.filter((f) => f.key !== entry.key));
  }

  function save() {
    const t = text.trim();
    if (!t && files.length === 0) return;
    startTransition(async () => {
      // 첨부부터 올린다 — 하나라도 실패하면 목록 그대로 두고 알린다.
      // 이미 올라간 것(path)은 다시 안 올린다 — 다시 누르면 이어서 간다.
      const list = [...files];
      for (let i = 0; i < list.length; i++) {
        if (list[i].path) continue;
        const form = new FormData();
        form.set("file", list[i].file);
        const r = await uploadTaskFile(form);
        if (r?.error) { setFiles(list); alert(r.error); return; }
        list[i] = { ...list[i], path: r.path };
      }
      // 전용 저장 — 아무 화면도 안 갈아엎는다 (약속: 이동 없음 · 새로고침 없음)
      const res = await addQuickMemo(t, list.map((f) => f.path));
      if (res?.error) { setFiles(list); alert(res.error); return; }
      if (res?.warn) alert(res.warn);   // 0147 전 DB — 메모만 들어갔다
      list.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      setFiles([]);
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-ghost"
        title="빠른 메모 — 오늘 할일로 들어갑니다"
        onClick={() => { setOpen(!open); setSaved(false); }}
      >
        ✏️
      </button>
      {open && (
        <div
          className="card card-tight"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            width: "min(320px, 86vw)", zIndex: 60,
            boxShadow: "0 8px 30px rgba(0,0,0,.25)",
          }}
        >
          <textarea
            className="input input-sm"
            rows={3}
            autoFocus
            placeholder="생각난 것 한 줄 — Enter 로 저장 (오늘 할일로 들어가요). 캡처는 붙여넣기(Ctrl+V)로."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // 클립보드의 캡처·사진 — 글자 붙여넣기는 그대로 둔다
              const pasted = [...(e.clipboardData?.files || [])];
              if (pasted.length) addFiles(pasted);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ width: "100%", resize: "vertical" }}
          />

          {/* 붙인 것 — 저장 전 목록. 그림은 미리보기, 나머지는 이름표 */}
          {files.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {files.map((f) => (
                <div key={f.key} style={{ position: "relative" }}>
                  {f.url ? (
                    <img
                      src={f.url}
                      alt={f.file.name || "붙인 사진"}
                      style={{
                        width: 56, height: 56, objectFit: "cover",
                        borderRadius: 8, border: "1px solid var(--border)",
                      }}
                    />
                  ) : (
                    <span
                      className="tag tag-sky"
                      title={f.file.name}
                      style={{
                        display: "inline-block", padding: "8px 10px", maxWidth: 140,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {f.file.name || "파일"}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    title="빼기"
                    style={{ position: "absolute", top: -6, right: -6, padding: "0 6px", background: "var(--surface)" }}
                    onClick={() => removeFile(f)}
                    disabled={pending}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 고르는 창만 연다 — 실제 올리기는 저장할 때 한꺼번에 */}
          <input
            ref={photoRef} type="file" accept="image/*" multiple
            style={{ display: "none" }}
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ""; }}
          />
          <input
            ref={fileRef} type="file" multiple
            style={{ display: "none" }}
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ""; }}
          />

          <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => photoRef.current?.click()}>
              📷 사진
            </button>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => fileRef.current?.click()}>
              📎 파일
            </button>
            {saved && <span className="hint" style={{ fontSize: 12.5 }}>할일에 넣었어요 ✓</span>}
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || (!text.trim() && files.length === 0)}
              onClick={save}
            >
              {pending ? (files.length ? "올리는 중…" : "저장 중…") : "할일로"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
