"use client";

import { useState } from "react";
import NoteBox from "@/app/students/NoteBox";
import { sortRows } from "@/lib/listSort";

const KIND = { consult: "상담", call: "통화", observe: "관찰" };

/**
 * 왼쪽에 학생, 오른쪽에 그 학생 상담일지.
 * 학생을 안 고르면 최근 상담이 전부 흐른다 — "요즘 누구랑 얘기했더라" 를 위해.
 */
export default function NotesBoard({ notes = [], students = [], pick = "" }) {
  const [sel, setSel] = useState(pick || "");
  const [q, setQ] = useState("");
  /**
   * **기본은 「최근 상담순」.**
   *
   * 이 화면을 여는 까닭이 대개 「요즘 누구랑 얘기했더라」 라서, 이름순으로
   * 세워두면 방금 상담한 아이를 목록에서 또 찾아야 한다.
   * 상담을 한 번도 안 한 아이는 자연히 맨 뒤로 간다 (빈 값은 뒤로).
   */
  const [sortKey, setSortKey] = useState("last");

  const nameOf = (id) => students.find((s) => s.id === id)?.name || "—";
  const kw = q.trim().toLowerCase();

  /**
   * **적힌 글은 raw 에 있을 수도 body 에 있을 수도 있다.**
   * 옮겨온 상담일지는 raw 에만 들어 있다 (정리한 글 body 는 원장님 자리라
   * 비워둔다). 화면이 body 만 보고 있어서 옮기고 나면 **200건이 전부 내용
   * 없이** 보였다. 있는 것을 안 보여주는 것은 없는 것보다 나쁘다.
   */
  const textOf = (n) => n.body || n.raw || "";

  // 학생마다 몇 건 · 마지막이 언제 (notes 는 날짜 내림차순으로 온다)
  const mineOf = (id) => notes.filter((n) => n.student_id === id);
  const lastOf = (id) => mineOf(id)[0]?.date || "";

  // **내용까지 찾는다.** 「퇴원」 「수술」 처럼 기억나는 말 한마디로 찾게 된다 —
  // 이름을 기억하면 애초에 목록에서 고르지 검색을 안 한다
  const hitsBody = (id) =>
    mineOf(id).some((n) => `${n.title || ""} ${textOf(n)}`.toLowerCase().includes(kw));

  const shown = sortRows(
    students
      .filter((s) => {
        if (!kw) return s.status === "enrolled" || notes.some((n) => n.student_id === s.id);
        return (
          [s.name, s.school, s.grade].some((v) => (v || "").toLowerCase().includes(kw)) ||
          hitsBody(s.id)
        );
      })
      // 늘어세울 값을 붙여준다 — 마지막 상담일 · 상담 건수
      .map((s) => ({ ...s, last: lastOf(s.id), cnt: mineOf(s.id).length || "" })),
    sortKey === "name" ? { key: "name", dir: "asc" } : { key: sortKey, dir: "desc" },
    "name"
  );
  const countOf = (id) => mineOf(id).length;

  // 전체 목록도 내용으로 거른다
  const flow = kw
    ? notes.filter(
        (n) =>
          `${n.title || ""} ${textOf(n)}`.toLowerCase().includes(kw) ||
          (nameOf(n.student_id) || "").toLowerCase().includes(kw)
      )
    : notes;
  const [more, setMore] = useState(40);

  return (
    <div className="grid-side" style={{ marginTop: 14 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 8px" }}>
          <input
            className="input input-sm"
            style={{ width: "100%" }}
            placeholder="이름 · 상담 내용으로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 6 }}>
            <select
              className="input input-sm"
              style={{ flex: 1 }}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              title="목록 정렬"
            >
              <option value="last">최근 상담순</option>
              <option value="cnt">상담 많은 순</option>
              <option value="name">이름순</option>
            </select>
            <span className="hint">{shown.length}명</span>
          </div>
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
                    {s.status !== "enrolled" && (
                      <span className="tag tag-muted" style={{ marginLeft: 4, fontSize: 12 }}>
                        {s.status === "withdrawn" ? "퇴원" : s.status === "paused" ? "휴원" : "예비"}
                      </span>
                    )}
                    <span className="hint" style={{ marginLeft: 6, fontSize: 12.5 }}>
                      {[s.school, s.grade].filter(Boolean).join(" ")}
                      {/* **마지막이 언제였나** — 「누구를 오래 안 봤지」 가 이 화면을
                          여는 이유 중 하나다. 건수만으로는 그걸 알 수 없다 */}
                      {countOf(s.id) > 0 ? ` · ${countOf(s.id)}건 · ${lastOf(s.id).slice(2)}` : ""}
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
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>
                {kw ? `「${q.trim()}」 이 들어간 상담 ${flow.length}건` : `최근 상담 ${flow.length}건`}
              </b>
              <span className="spacer" />
              <span className="hint" style={{ fontSize: 12.5 }}>
                왼쪽에서 학생을 고르면 그 학생 것만 죽 보입니다
              </span>
            </div>
            {flow.slice(0, more).map((n) => (
              <div className="card card-tight" key={n.id}>
                <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="tag tag-sky">{KIND[n.kind] || n.kind}</span>
                  <b style={{ fontSize: 14.5 }}>{nameOf(n.student_id)}</b>
                  {n.title && <span className="hint" style={{ fontSize: 12.5 }}>{n.title}</span>}
                  <span className="hint" style={{ fontSize: 13 }}>
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
                {textOf(n) && (
                  <p style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>
                    {textOf(n).length > 260 ? `${textOf(n).slice(0, 260)}…` : textOf(n)}
                  </p>
                )}
              </div>
            ))}
            {flow.length > more && (
              <button className="btn btn-ghost btn-sm" onClick={() => setMore(more + 60)}>
                더 보기 ({flow.length - more}건 남음)
              </button>
            )}
            {flow.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                {kw ? "그 말이 들어간 상담이 없어요." : "아직 상담일지가 없습니다."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
