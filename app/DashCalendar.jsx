"use client";

import { useState } from "react";
import Link from "next/link";
import { monthGrid, DOW } from "@/lib/calendar";
import { addMonths } from "@/lib/day";

/**
 * 대시보드 달력 — 이번 달에 무엇이 언제 있나.
 *
 * 목록은 "무엇이 있나" 만 보여준다. 시험 주간에 일정이 세 개 겹치는 것,
 * 다음 주가 통째로 비는 것은 **달력으로 봐야** 보인다.
 *
 * 색은 세 가지만 쓴다. 더 늘리면 무슨 색인지 다시 확인하게 된다.
 *   학사일정(학교)  ·  우리 일정  ·  할일
 */
const TONE = {
  school: { cls: "cal-school", label: "학사일정" },
  event: { cls: "cal-event", label: "학원 일정" },
  todo: { cls: "cal-todo", label: "할일" },
};

export default function DashCalendar({ ym, items = [], today = "" }) {
  const [month, setMonth] = useState(ym);
  const cells = monthGrid(month, items, today);
  const mine = items.filter((i) => (i.date || "").startsWith(month));
  const n = (t) => mine.filter((i) => i.tone === t).length;

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
          {Number(month.slice(5, 7))}월
        </h2>
        <span className="hint" style={{ fontSize: 12 }}>
          {Object.entries(TONE)
            .filter(([k]) => n(k) > 0)
            .map(([k, v]) => `${v.label} ${n(k)}`)
            .join(" · ") || "이 달은 비어 있어요"}
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
          ◂
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(ym)}>
          이번 달
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
          ▸
        </button>
      </div>

      <div className="cal">
        {DOW.map((d) => (
          <div key={d} className={`cal-dow ${d === "일" ? "sun" : d === "토" ? "sat" : ""}`}>
            {d}
          </div>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <div key={`x${i}`} className="cal-cell cal-empty" />
          ) : (
            <div
              key={c.date}
              className={`cal-cell${c.today ? " cal-today" : ""}${c.past ? " cal-past" : ""}`}
            >
              <span className={`cal-day ${c.dow === "일" ? "sun" : c.dow === "토" ? "sat" : ""}`}>
                {c.day}
              </span>
              {/* 제목은 두 개까지만 — 더 적으면 칸이 늘어나 한 달이 안 보인다 */}
              {c.items.slice(0, 2).map((it, k) => (
                <Link
                  key={k}
                  href={it.href || "/tasks"}
                  className={`cal-item ${TONE[it.tone]?.cls || ""}`}
                  title={it.title}
                >
                  {it.title}
                </Link>
              ))}
              {c.items.length > 2 && (
                <Link href="/tasks" className="cal-more">
                  +{c.items.length - 2}
                </Link>
              )}
            </div>
          )
        )}
      </div>

      <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {Object.entries(TONE).map(([k, v]) => (
          <span key={k} className="hint" style={{ fontSize: 11.5 }}>
            <i className={`cal-dot ${v.cls}`} /> {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}
