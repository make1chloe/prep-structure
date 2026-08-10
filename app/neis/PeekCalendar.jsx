"use client";

/**
 * **나이스 원본을 달력으로** (원장님, 2026-08-09 — 「맨 위에 달력 형식을 좀
 * 추가해 주고」).
 *
 * 표는 「무엇이 있나」 를 세는 데 좋지만, **언제가 비어 있나**는 안 보인다.
 * 10월에 시험이 하나도 없는 것과 목록 아래쪽에 있는 것이 표에서는 똑같이
 * 보인다. 달력은 **빈 칸이 곧 정보**다.
 *
 * 달력 칸을 만드는 규칙은 lib/calendar 의 monthGrid 한 곳에서만 온다 —
 * 요일이 하루 밀리는 사고를 예전에 겪었다 (일요일 시작 · 월요일 시작).
 * 여러 날짜리는 expandRanges 로 날마다 펼친다 — **저장은 한 줄로, 보기는
 * 날마다.**
 */

import { useState } from "react";
import { monthGrid, expandRanges } from "@/lib/calendar";
import { WEEK_ORDER } from "@/lib/day";
import { shortName } from "@/lib/schoolName";

const DOT = {
  시험: "var(--amber)",
  전국: "var(--lav)",
  쉼: "var(--sky)",
  행사: "var(--text-faint)",
  버림: "var(--border-strong)",
};

/** 그 달에 줄이 하나라도 있는 달만 그린다 — 빈 달 열두 개는 볼 것이 없다 */
function monthsOf(items) {
  return [...new Set(items.map((it) => (it.date || "").slice(0, 7)).filter(Boolean))].sort();
}

export default function PeekCalendar({ items = [], today = "" }) {
  const [open, setOpen] = useState(null);       // 눌러서 아래에 펼쳐 볼 날

  // 여러 날짜리는 날마다 펼친다 (방학 8/1~8/16 → 열여섯 칸)
  const spread = expandRanges(items.map((r) => ({ ...r, endDate: r.endDate || null })));
  const months = monthsOf(spread);
  if (months.length === 0) return null;

  const onDay = spread.filter((it) => it.date === open);

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>달력</b>
        <span className="hint" style={{ fontSize: 11.5 }}>날짜를 누르면 그날 것이 아래에 나옵니다</span>
        <span className="spacer" />
        {Object.entries(DOT).map(([k, c]) => (
          <span key={k} className="hint" style={{ fontSize: 11.5 }}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: 99,
              background: c, marginRight: 3,
            }} />
            {k}
          </span>
        ))}
      </div>

      <div className="stack" style={{ gap: 14, marginTop: 10 }}>
        {months.map((ym) => (
          <div key={ym}>
            <b style={{ fontSize: 13 }}>{Number(ym.slice(5, 7))}월</b>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginTop: 4,
            }}>
              {WEEK_ORDER.map((d) => (
                <div key={d} className="hint" style={{ textAlign: "center", fontSize: 11 }}>{d}</div>
              ))}
              {monthGrid(ym, spread, today).map((cell, i) =>
                cell === null ? (
                  <div key={`x${i}`} />
                ) : (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setOpen(open === cell.date ? null : cell.date)}
                    title={cell.items.map((it) => `${shortName(it.school)} ${it.raw}`).join("\n")}
                    style={{
                      minHeight: 42, padding: "2px 3px", textAlign: "left", cursor: "pointer",
                      border: `1px solid ${open === cell.date ? "var(--navy)" : "var(--border)"}`,
                      borderRadius: 6, background: cell.today ? "var(--sky-soft)" : "transparent",
                      opacity: cell.past ? 0.65 : 1,
                    }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 700 }}>{cell.day}</span>
                    {/* **점만 찍는다** — 칸이 좁아 이름은 안 들어간다. 누르면 아래에 나온다 */}
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
                      {cell.items.slice(0, 6).map((it, j) => (
                        <span key={j} style={{
                          width: 6, height: 6, borderRadius: 99,
                          background: DOT[it.how] || "var(--border-strong)",
                        }} />
                      ))}
                      {cell.items.length > 6 && (
                        <span style={{ fontSize: 9 }} className="hint">+{cell.items.length - 6}</span>
                      )}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* **누르면 아래에 적힌다** — 손가락으로는 마우스를 올릴 수 없다 */}
      {open && (
        <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <b style={{ fontSize: 13 }}>{open}</b>
            <span className="tag tag-muted">{onDay.length}건</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>닫기</button>
          </div>
          {onDay.length === 0 ? (
            <p className="hint" style={{ marginTop: 6 }}>이 날은 나이스에 아무것도 없습니다.</p>
          ) : (
            <div className="stack" style={{ gap: 2, marginTop: 6 }}>
              {onDay.map((it, i) => (
                <div className="unitrow" key={i}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 99,
                    background: DOT[it.how] || "var(--border-strong)",
                  }} />
                  <b style={{ fontSize: 12.5 }}>{shortName(it.school)}</b>
                  <span style={{ fontSize: 12.5, flex: 1 }}>
                    {it.raw}
                    {/* 여러 날짜리는 어디부터 어디까지인지 같이 */}
                    {it.spanFrom && it.spanTo && (
                      <span className="hint"> ({it.spanFrom.slice(5)} ~ {it.spanTo.slice(5)})</span>
                    )}
                  </span>
                  {it.inApp === false && <span className="tag tag-amber">앱에 안 들어옴</span>}
                  {it.hasExam === false && <span className="tag tag-amber">회차 없음</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
