"use client";

import { useState, useTransition } from "react";
import { NOTE_GROUPS } from "@/lib/screenNotes";
import { saveNote } from "../noteActions";

/**
 * 화면 안내 문구를 적는 곳 (0093).
 *
 * **한 칸씩 따로 저장한다.** 스무 칸을 한 번에 저장하게 하면, 하나 고치고
 * 저장을 안 누른 채 화면을 떠나기 쉽다. 그리고 실패했을 때 어느 칸이
 * 문제였는지도 알 수 없다.
 *
 * 안 적으면 원래 문구가 그대로 나온다 — 그것도 화면에 적어둔다. 빈 칸을
 * 보고 「비어 있으니 아무것도 안 나오나」 하고 억지로 채우시면 안 된다.
 */
function Spot({ spot, value, onSaved }) {
  const [text, setText] = useState(value || "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = (text || "") !== (value || "");

  return (
    <div className="card card-tight stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{spot.label}</b>
        <span className="hint">{spot.where}</span>
        <span className="spacer" />
        {value ? (
          <span className="tag tag-mint">적어두셨어요</span>
        ) : (
          <span className="tag tag-muted">원래 문구</span>
        )}
      </div>

      <textarea
        className="input"
        rows={2}
        value={text}
        placeholder={spot.placeholder || "여기에 적으시면 이 자리에 그대로 나옵니다"}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        style={{ fontSize: 15, lineHeight: 1.6 }}
      />

      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const res = await saveNote(spot.key, text);
              if (res?.error) { alert(res.error); return; }
              setSaved(true);
              onSaved(spot.key, text.trim());
            })
          }
        >
          {pending ? "저장 중…" : saved ? "저장됨 ✓" : "저장"}
        </button>
        {text && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("비우면 원래 문구로 돌아갑니다. 비울까요?")) return;
              startTransition(async () => {
                const res = await saveNote(spot.key, "");
                if (res?.error) { alert(res.error); return; }
                setText("");
                setSaved(true);
                onSaved(spot.key, "");
              });
            }}
          >
            비우기
          </button>
        )}
        <span className="hint" style={{ fontSize: 12.5 }}>
          비우면 원래 문구가 나옵니다
        </span>
      </div>
    </div>
  );
}

export default function NotesForm({ notes = {}, unavailable = null }) {
  const [saved, setSaved] = useState(notes);
  const [open, setOpen] = useState("me");   // 학생 화면부터 — 제일 자주 고치신다

  if (unavailable) {
    return (
      <div className="card">
        <div className="notice">{unavailable}</div>
      </div>
    );
  }

  const group = NOTE_GROUPS.find((g) => g.key === open) || NOTE_GROUPS[0];
  const filled = (g) => g.spots.filter((s) => (saved[s.key] || "").trim()).length;

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {NOTE_GROUPS.map((g) => (
          <button
            key={g.key}
            className={`btn btn-sm ${open === g.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setOpen(g.key)}
          >
            {g.label}
            {filled(g) > 0 && <span style={{ marginLeft: 6, opacity: 0.85 }}>{filled(g)}</span>}
          </button>
        ))}
      </div>

      <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.8 }}>
        {group.hint}
      </p>

      <div className="stack" style={{ gap: 8 }}>
        {group.spots.map((s) => (
          <Spot
            key={s.key}
            spot={s}
            value={saved[s.key] || ""}
            onSaved={(k, v) => setSaved({ ...saved, [k]: v })}
          />
        ))}
      </div>
    </>
  );
}
