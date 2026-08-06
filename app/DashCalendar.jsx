"use client";

import { useState } from "react";
import Link from "next/link";
import { monthGrid, DOW, expandRanges } from "@/lib/calendar";
import { addMonths } from "@/lib/day";

/**
 * 대시보드 달력 — 이번 달에 무엇이 언제 있나.
 *
 * 목록은 "무엇이 있나" 만 보여준다. 시험 주간에 일정이 세 개 겹치는 것,
 * 다음 주가 통째로 비는 것은 **달력으로 봐야** 보인다.
 *
 * 색은 **한 화면에 세 가지까지만** 쓴다. 더 늘리면 무슨 색인지 다시 확인하게 된다.
 * 그래서 보는 사람에 따라 쓰는 색이 다르다.
 *   선생님 화면  학사일정 · 학원 일정 · 할일
 *   학생 화면    수업일 · 시험 · 결석 (+ 학사일정 · 학원 일정)
 * 학생 화면에 할일이 안 가고, 선생님 화면에 수업일이 안 가므로 실제로 한 번에
 * 보이는 것은 세 가지 안팎이다. 안 쓰인 색은 아래 설명에도 안 나온다.
 */
const TONE = {
  school: { cls: "cal-school", label: "학사일정" },
  event: { cls: "cal-event", label: "학원 일정" },
  todo: { cls: "cal-todo", label: "할일" },
  // 학생 달력 (0089 이후) — 「내 수업이 언제인가」 가 제일 먼저 궁금하다
  klass: { cls: "cal-mint", label: "수업" },
  exam: { cls: "cal-red", label: "시험" },
  absent: { cls: "cal-amber", label: "결석·보강" },
  // 휴강은 **제일 알려야 하는 것**이다 — 그날 헛걸음하지 않으시라고 (0096)
  off: { cls: "cal-off", label: "휴강" },
};

/**
 * @param links  일정을 눌러 할일 화면으로 갈 수 있나.
 *               학생·학부모 화면에서는 끈다 — 열 수 없는 곳으로 데려가면 안 된다.
 */
export default function DashCalendar({ ym, items = [], today = "", links = true }) {
  const [month, setMonth] = useState(ym);
  /**
   * **눌러서 그날을 펼친다** (원장님, 2026-08-06 — 「학생 학부모는 달력에
   * 뭐가 있어도 눌러서 확인이 안 돼」).
   *
   * 칸에는 두 개까지만 보인다. 세 개째부터는 「+2」 로 접히는데, 선생님은
   * 눌러서 할일 화면으로 갈 수 있지만 아이·어머니는 갈 데가 없었다.
   * 제목이 길면 잘리기까지 해서 **뭐가 있는지는 아는데 뭔지는 모르는** 상태가 됐다.
   *
   * 그래서 날짜를 누르면 그 아래에 그날 것이 통째로 펼쳐진다.
   * 갈 데가 없는 쪽(links=false)에서만 켠다 — 선생님은 원래 가던 길이 있다.
   */
  const [pick, setPick] = useState(null);
  // 방학·시험기간은 한 줄로 저장하고 달력에서만 날마다 펼친다
  const spread = expandRanges(items);
  const cells = monthGrid(month, spread, today);
  const openDay = !links;
  const dayItems = pick ? spread.filter((i) => i.date === pick) : [];
  const mine = spread.filter((i) => (i.date || "").startsWith(month));
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
              className={
                `cal-cell${c.today ? " cal-today" : ""}${c.past ? " cal-past" : ""}` +
                (openDay && c.items.length > 0 ? " cal-tap" : "") +
                (pick === c.date ? " cal-picked" : "")
              }
              role={openDay && c.items.length > 0 ? "button" : undefined}
              tabIndex={openDay && c.items.length > 0 ? 0 : undefined}
              onClick={
                openDay && c.items.length > 0
                  ? () => setPick(pick === c.date ? null : c.date)
                  : undefined
              }
            >
              <span className={`cal-day ${c.dow === "일" ? "sun" : c.dow === "토" ? "sat" : ""}`}>
                {c.day}
              </span>
              {/* 제목은 두 개까지만 — 더 적으면 칸이 늘어나 한 달이 안 보인다 */}
              {c.items.slice(0, 2).map((it, k) =>
                links ? (
                  <Link
                    key={k}
                    href={it.href || "/tasks"}
                    className={`cal-item ${TONE[it.tone]?.cls || ""}`}
                    title={it.title}
                  >
                    {it.title}
                  </Link>
                ) : (
                  <span key={k} className={`cal-item ${TONE[it.tone]?.cls || ""}`} title={it.title}>
                    {it.title}
                  </span>
                )
              )}
              {c.items.length > 2 &&
                (links ? (
                  <Link href="/tasks" className="cal-more">
                    +{c.items.length - 2}
                  </Link>
                ) : (
                  <span className="cal-more">+{c.items.length - 2}</span>
                ))}
            </div>
          )
        )}
      </div>

      {/* 누른 날 — 그날 것을 통째로. 칸에서 접힌 것도 여기서는 다 보인다 */}
      {pick && dayItems.length > 0 && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <b style={{ fontSize: 13.5 }}>
              {Number(pick.slice(5, 7))}월 {Number(pick.slice(8, 10))}일
            </b>
            <span className="hint">{dayItems.length}개</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>닫기</button>
          </div>
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {dayItems.map((it, i) => (
              <div className="unitrow" key={`${it.title}-${i}`}>
                <i className={`cal-dot ${TONE[it.tone]?.cls || ""}`} />
                <span style={{ fontSize: 13.5, flex: 1 }}>
                  {it.title}
                  {it.note && <span className="hint"> · {it.note}</span>}
                </span>
                <span className="hint" style={{ fontSize: 11.5 }}>
                  {TONE[it.tone]?.label || ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {openDay && (
          <span className="hint" style={{ fontSize: 11.5, width: "100%" }}>
            <b>날짜를 누르면</b> 그날 무엇이 있는지 다 보여요.
          </span>
        )}
        {Object.entries(TONE)
          // **안 쓰인 색은 설명하지 않는다.** 이 달에 하나도 없는 색을 아래에
          // 늘어놓으면 「내 수업은 왜 안 떴지?」 하고 찾게 된다.
          .filter(([k]) => n(k) > 0)
          .map(([k, v]) => (
            <span key={k} className="hint" style={{ fontSize: 11.5 }}>
              <i className={`cal-dot ${v.cls}`} /> {v.label}
            </span>
          ))}
      </div>
    </div>
  );
}
