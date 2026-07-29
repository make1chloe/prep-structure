"use client";

import { useState } from "react";
import NoteBox from "@/app/students/NoteBox";

const KIND = { consult: "상담", call: "통화", observe: "관찰" };

/**
 * 왼쪽에 학생, 오른쪽에 그 학생 상담일지.
 * 학생을 안 고르면 최근 상담이 전부 흐른다 — "요즘 누구랑 얘기했더라" 를 위해.
 */
export default function NotesBoard({ notes = [], students = [], pick = "" }) {
  const [sel, setSel] = useState(pick || "");
  const [q, setQ] = useState("");

  const nameOf = (id) => students.find((s) => s.id === id)?.name || "—";
  const kw = q.trim().toLowerCase();
  const shown = students.filter((s) => {
    if (!kw) return s.status === "enrolled" || notes.some((n) => n.student_id === s.id);
    return [s.name, s.school, s.grade].some((v) => (v || "").toLowerCase().includes(kw));
  });
  const countOf = (id) => notes.filter((n) => n.student_id === id).length;

  return (
    <div className="grid-side" style={{ marginTop: 14 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 8px" }}>
          <input
            className="input input-sm"
            style={{ width: "100%" }}
            placeholder="이름으로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <table className="tbl">
          <tbody>
            <tr style={!sel ? { background: "var(--surface-2)" } : undefined}>
              <td>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setSel("")}
                >
                  최근 상담 전체
                </button>
              </td>
            </tr>
            {shown.map((s) => (
              <tr key={s.id} style={sel === s.id ? { background: "var(--surface-2)" } : undefined}>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => setSel(s.id)}
                  >
                    {s.name}
                    <span className="hint" style={{ marginLeft: 6, fontSize: 11.5 }}>
                      {[s.school, s.grade].filter(Boolean).join(" ")}
                      {countOf(s.id) > 0 ? ` · ${countOf(s.id)}건` : ""}
                    </span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        {sel ? (
          <NoteBox studentId={sel} name={nameOf(sel)} />
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <b style={{ fontSize: 14 }}>최근 상담 {notes.length}건</b>
            <p className="hint" style={{ margin: "0 0 6px" }}>
              왼쪽에서 학생을 고르면 새로 쓰거나 고칠 수 있습니다.
            </p>
            {notes.slice(0, 40).map((n) => (
              <div className="card card-tight" key={n.id}>
                <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="tag tag-sky">{KIND[n.kind] || n.kind}</span>
                  <b style={{ fontSize: 13 }}>{nameOf(n.student_id)}</b>
                  <span className="hint" style={{ fontSize: 12 }}>
                    {[n.date, n.with_whom, n.minutes ? `${n.minutes}분` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="spacer" />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSel(n.student_id)}
                  >
                    열기
                  </button>
                </div>
                {n.body && (
                  <p style={{ margin: "6px 0 0", fontSize: 12.5, whiteSpace: "pre-wrap" }}>
                    {n.body.length > 220 ? `${n.body.slice(0, 220)}…` : n.body}
                  </p>
                )}
              </div>
            ))}
            {notes.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>아직 상담일지가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
