"use client";

import { useState, useTransition } from "react";
import { addQuickMemo } from "@/app/tasks/actions";

/**
 * **아무 화면에서나 한 줄 메모** (원장님, 2026-08-21 — 「수업 하다가 갑자기
 * 생각난 것에 대해 일단 메모할 수 있는 방법이 필요. 아무 페이지에나 다 있는
 * 간단한 거면 좋겠음」).
 *
 * 위 메뉴의 ✏️ 하나 — 누르면 작은 판, 적고 Enter 면 **오늘 할일**로
 * 들어간다 (새 저장소를 만들지 않는다 — 메모는 나중에 처리할 일이고,
 * 할일 인박스가 이미 그 자리다. 원칙 1). 화면 이동 없음, 저장 후 그대로
 * 이어서 일한다.
 */
export default function QuickMemo() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const t = text.trim();
    if (!t) return;
    startTransition(async () => {
      // 전용 저장 — 아무 화면도 안 갈아엎는다 (약속: 이동 없음 · 새로고침 없음)
      const res = await addQuickMemo(t);
      if (res?.error) { alert(res.error); return; }
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
            placeholder="생각난 것 한 줄 — Enter 로 저장 (오늘 할일로 들어가요)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
              if (e.key === "Escape") setOpen(false);
            }}
            style={{ width: "100%", resize: "vertical" }}
          />
          <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
            {saved && <span className="hint" style={{ fontSize: 12.5 }}>할일에 넣었어요 ✓</span>}
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
            <button className="btn btn-primary btn-sm" disabled={pending || !text.trim()} onClick={save}>
              {pending ? "저장 중…" : "할일로"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
