"use client";

import { useState } from "react";
import Link from "next/link";
import { todaySeoul, DOW } from "@/lib/day";
import { dedupeSameDay } from "@/lib/calendar";
import { cleanNote, cleanTitle } from "@/lib/note";

/**
 * 한 달 달력.
 *
 * 목록만 있으면 「이번 주에 뭐가 몰려 있나」 가 안 보인다. 시험 기간과 특강이
 * 같은 주에 겹치는 것을 알아채는 데는 달력이 낫다.
 *
 * **여기서 고치지 않는다.** 누르면 그 화면으로 간다 — 좁은 칸에서 고치게 만들면
 * 잘못 누르기 쉽고, 고치는 곳이 두 군데가 된다.
 */

const CAT_CLS = {
  학사일정: "cal-sky",
  수업: "cal-lav",
  행정: "cal-muted",
  상담: "cal-amber",
  교재: "cal-mint",
  기타: "cal-muted",
};

/**
 * 다른 화면에서 온 것들 — 각자 다른 표에 있지만 원장님 하루에는 같이 있다.
 * 글자만으로는 한 칸 안에서 구별이 안 되므로 **그림 하나씩** 붙인다.
 */
const SOURCE = {
  시험: { icon: "📕", cls: "cal-amber" },
  휴강: { icon: "🚫", cls: "cal-muted" },
  상담: { icon: "🤝", cls: "cal-mint" },
  레테: { icon: "📝", cls: "cal-mint" },
  보강: { icon: "🔁", cls: "cal-sky" },
  결석: { icon: "🏠", cls: "cal-red" },
  기타: { icon: "•", cls: "cal-muted" },
};

function daysOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();                       // 1일 앞의 빈 칸
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= last; d += 1) {
    cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarBoard({
  ym,
  tasks = [],
  todos = [],
  linked = [],
  classes = [],
  students = [],
  prev,
  next,
  thisMonth,
}) {
  const today = todaySeoul();
  const cells = daysOf(ym);
  // 무엇을 볼까 — 일정만/할일만, 어느 반, 어느 학생
  const [only, setOnly] = useState("all");        // all | schedule | todo
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [pick, setPick] = useState(null);         // 눌러서 펼친 날
  /**
   * **글자를 잘라 두지 않는다** (원장님, 2026-08-13 — 「내용이 너무 길면,
   * 토글 이용해서 다 볼 수 있게 해줘 잘리지않게」).
   *
   * 칸이 좁아서 한 줄로 자르면 「해송고 올포2 - 1, 2, 3, 17, 18 닥…」 처럼
   * **정작 중요한 뒷말이 사라진다.** 그렇다고 늘 펴 두면 한 주가 화면
   * 하나를 다 먹는다. 그래서 칸마다 펴고 접는다.
   */
  const [openCells, setOpenCells] = useState(() => new Set());
  const toggleCell = (d) =>
    setOpenCells((prev) => {
      const n = new Set(prev);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });

  // 날짜별로 모은다. 시험·휴강처럼 기간이 있는 것은 **걸치는 날마다** 넣는다.
  const byDay = new Map();
  /**
   * **걸러서 담는다.**
   *
   * 한 달 치를 다 그려놓으면 칸마다 대여섯 줄이 되어 무엇이 무엇인지 알 수가
   * 없다. 원장님이 실제로 물으시는 것은 「이 반은 이번 달에 무슨 일이 있나」,
   * 「이 아이는 언제 빠지나」 다. 그래서 반·학생·종류로 거른다.
   *
   * 반·학생이 안 적힌 것(학사일정처럼 모두에게 걸리는 것)은 **걸러도 남긴다** —
   * 「이 반」 을 골랐다고 학교 시험이 사라지면 안 된다.
   */
  const put = (d, item) => {
    if (!d || d.slice(0, 7) !== ym) return;
    if (only !== "all" && item.band !== only) return;
    if (classId && item.classId && item.classId !== classId) return;
    if (studentId && item.studentIds && !item.studentIds.includes(studentId)) return;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(item);
  };

  tasks.forEach((t) => {
    const from = t.due_on;
    const to = t.end_on && t.end_on > from ? t.end_on : from;
    let d = from;
    while (d <= to) {
      put(d, {
        key: `t-${t.id}-${d}`,
        label: `${t.start_time ? `${t.start_time.slice(0, 5)} ` : ""}${cleanTitle(t.title)}`,
        cls: CAT_CLS[t.category || "기타"] || "cal-muted",
        href: "/tasks?view=schedule",
        done: t.status === "done",
        band: "schedule",
        source: t.category || "일정",
        where: "여기(일정)에서 적은 것",
        why: cleanNote(t.note),
        classId: t.class_id || null,
        studentIds: t.deliver_student_ids || null,
      });
      const n = new Date(`${d}T00:00:00Z`);
      n.setUTCDate(n.getUTCDate() + 1);
      d = n.toISOString().slice(0, 10);
    }
  });

  todos
    .filter((t) => t.due_on && !t.no_due && t.status !== "done")
    .forEach((t) =>
      put(t.due_on, {
        key: `d-${t.id}`,
        label: `☑ ${cleanTitle(t.title)}`,
        cls: "cal-muted",
        href: "/tasks?view=todo",
        band: "todo",
        source: "할일",
        where: t.auto_key
          ? (t.auto_key.startsWith("routine:") ? "되풀이 할일 규칙이 만든 것" : "다른 화면이 만든 것")
          : "여기(할일)에서 적은 것",
        why: cleanNote(t.note),
      })
    );

  linked.forEach((l) => {
    const mark = SOURCE[l.source] || SOURCE.기타;
    let d = l.from;
    while (d <= l.to) {
      put(d, {
        key: `${l.key}-${d}`,
        label: `${mark.icon} ${cleanTitle(l.title)}`,
        cls: mark.cls,
        href: l.href,
        // **어디서 왔고 왜 있는지.** 「다른 화면에서 온 일정이 뭔지 왜 있는지
        // 모르겠어」 — 칸에는 글자가 안 들어가니, 눌렀을 때 아래에 적는다
        band: l.source === "보강" ? "todo" : "schedule",
        source: l.source,
        where: l.from_where || "다른 화면",
        why: l.why || l.extra || "",
        classId: l.classId || null,
        studentIds: l.studentId ? [l.studentId] : null,
      });
      const n = new Date(`${d}T00:00:00Z`);
      n.setUTCDate(n.getUTCDate() + 1);
      d = n.toISOString().slice(0, 10);
    }
  });

  const [y, m] = ym.split("-");

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Link className="btn btn-ghost btn-sm" href={`/tasks?view=calendar&m=${prev}`}>‹ 지난달</Link>
        <b style={{ fontSize: 15 }}>{y}년 {Number(m)}월</b>
        <Link className="btn btn-ghost btn-sm" href={`/tasks?view=calendar&m=${next}`}>다음달 ›</Link>
        {ym !== thisMonth && (
          <Link className="btn btn-ghost btn-sm" href="/tasks?view=calendar">이번달</Link>
        )}
        <span className="spacer" />
        <span className="hint">눌러서 고치는 것은 목록에서 합니다</span>
      </div>

      {/* **걸러 보기.** 달력 하나를 바탕에 놓고 여기서 좁힌다.
          화면을 나누는 대신 이렇게 한다 — 나누면 같은 날을 두 군데서 봐야 한다. */}
      <div className="stack" style={{ gap: 6, margin: "0 0 10px" }}>
        <div className="row" style={{ gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {[
            ["all", "전체"],
            ["schedule", "일정"],
            ["todo", "할일"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={`btn btn-sm ${only === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setOnly(k)}
            >
              {label}
            </button>
          ))}
          <span className="hint" style={{ fontSize: 12.5 }}>
            일정 = 그날 그런 일이 있다 · 할일 = 내가 처리할 것
          </span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="input input-sm"
            style={{ width: 150 }}
            value={classId}
            onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}
          >
            <option value="">반 전체</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="input input-sm"
            style={{ width: 150 }}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">학생 전체</option>
            {students.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          {(classId || studentId || only !== "all") && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setOnly("all"); setClassId(""); setStudentId(""); }}
            >
              거르기 지우기
            </button>
          )}
          <span className="spacer" />
          <span className="hint" style={{ fontSize: 12.5 }}>
            📕시험 🚫휴강 🤝상담 📝레테 🔁보강 🏠결석 ☑할일
          </span>
        </div>
      </div>

      <div className="cal">
        {DOW.map((d, i) => (
          <div className={`cal-dow ${i === 0 ? "cal-sun" : i === 6 ? "cal-sat" : ""}`} key={d}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div className="cal-cell cal-blank" key={`b${i}`} />;
          /**
           * **같은 날 같은 것을 하나로** (원장님, 2026-08-07 — 「중복이 있어」).
           *
           * 8월 17일에 셋이 있었다 — 「광복절 대체공휴일 — 정상 수업」(원장님이
           * 정하신 것) · 「[전국] 대체공휴일」(나이스) · 「🚫 대체공휴일」(휴강 표).
           * 각자 다른 표에서 왔으니 코드가 보기에는 다른 줄이지만, 달력을 보는
           * 사람에게는 **한 가지 일**이다. 세 줄이 차지하면 그날 정말 봐야 할
           * 보강·상담이 「+2」 뒤로 밀린다.
           *
           * 더 많이 말해주는 것을 남긴다 — 휴강(그날 수업이 없다는 뜻까지) >
           * 원장님이 정하신 일정 > 학교가 준 학사일정.
           */
          const items = dedupeSameDay(
            (byDay.get(d) || []).map((x) => ({ ...x, date: d, title: x.label })),
            (x) => (x.source === "휴강" ? 3 : x.where?.includes("여기") ? 2 : 1)
          );
          const dow = i % 7;
          /**
           * 접혀 있을 때는 **넉 줄까지**. 다섯 줄이 넘어가면 그 주가 통째로
           * 길어져서 다른 주가 화면 밖으로 밀린다.
           * `long` — 줄은 몇 개 안 되는데 **글자가 긴** 경우. 이때도 펼 수
           * 있어야 한다 (개수는 안 넘치지만 뒷말이 잘려 있다).
           */
          const open = openCells.has(d);
          const MAX = 4;
          const shownItems = open ? items : items.slice(0, MAX);
          const hidden = open ? 0 : Math.max(0, items.length - MAX);
          const long = !open && items.some((x) => (x.label || "").length > 14);
          return (
            <div
              className={`cal-cell cal-tap ${d === today ? "cal-today" : ""} ${open ? "cal-open" : ""}`}
              key={d}
              /* 폰에서는 줄이 점이라 못 누른다 — 칸을 누르면 그날 목록 (11-13) */
              onClick={() => items.length > 0 && setPick(pick === d ? null : d)}
            >
              <div className={`cal-num ${dow === 0 ? "cal-sun" : dow === 6 ? "cal-sat" : ""}`}>
                {Number(d.slice(8))}
              </div>
              {shownItems.map((it) => (
                <button
                  type="button"
                  className={`cal-item ${it.cls} ${it.done ? "cal-done" : ""}`}
                  key={it.key}
                  onClick={(e) => { e.stopPropagation(); setPick(pick === d ? null : d); }}
                  title={it.label}
                >
                  {it.label}
                </button>
              ))}
              {/* 접혀 있고 더 있으면 몇 개가 숨었는지 **세어서** 말한다 —
                  「…」 만 있으면 몇 개가 가려졌는지 알 수가 없다 */}
              {(hidden > 0 || long) && (
                <button
                  type="button"
                  className="cal-more"
                  onClick={() => toggleCell(d)}
                  title={open ? "접기" : "이 날 내용을 다 보기"}
                >
                  {open ? "접기" : hidden > 0 ? `＋${hidden}개 더 보기` : "다 보기"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* **누르면 그날이 펼쳐진다.**
          「다른 화면에서 온 일정이 뭔지 왜 있는지 모르겠어」 — 칸은 좁아서
          제목 한 줄이 겨우 들어간다. 어디서 왔고 왜 있는지는 여기 적는다. */}
      {pick && (
        <div className="card card-tight" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <b style={{ fontSize: 15 }}>
              {Number(pick.slice(5, 7))}월 {Number(pick.slice(8, 10))}일
            </b>
            <span className="hint">{(byDay.get(pick) || []).length}건</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setPick(null)}>닫기</button>
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            {(byDay.get(pick) || []).map((it) => (
              <div className="unitrow" key={it.key} style={{ alignItems: "flex-start" }}>
                <span className={`tag ${it.band === "todo" ? "tag-amber" : "tag-sky"}`}>
                  {it.band === "todo" ? "할일" : "일정"}
                </span>
                <span style={{ fontSize: 14, flex: 1 }}>
                  <b>{it.label}</b>
                  <br />
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {it.where}
                    {it.why ? ` — ${it.why}` : ""}
                  </span>
                </span>
                <Link className="btn btn-ghost btn-sm" href={it.href}>
                  가기
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
