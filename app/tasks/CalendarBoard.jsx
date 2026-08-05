import Link from "next/link";
import { todaySeoul } from "@/lib/day";

/**
 * 한 달 달력.
 *
 * 목록만 있으면 「이번 주에 뭐가 몰려 있나」 가 안 보인다. 시험 기간과 특강이
 * 같은 주에 겹치는 것을 알아채는 데는 달력이 낫다.
 *
 * **여기서 고치지 않는다.** 누르면 그 화면으로 간다 — 좁은 칸에서 고치게 만들면
 * 잘못 누르기 쉽고, 고치는 곳이 두 군데가 된다.
 */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

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
  prev,
  next,
  thisMonth,
}) {
  const today = todaySeoul();
  const cells = daysOf(ym);

  // 날짜별로 모은다. 시험·휴강처럼 기간이 있는 것은 **걸치는 날마다** 넣는다.
  const byDay = new Map();
  const put = (d, item) => {
    if (!d || d.slice(0, 7) !== ym) return;
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
        label: `${t.start_time ? `${t.start_time.slice(0, 5)} ` : ""}${t.title}`,
        cls: CAT_CLS[t.category || "기타"] || "cal-muted",
        href: "/tasks?view=schedule",
        done: t.status === "done",
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
        label: `☑ ${t.title}`,
        cls: "cal-muted",
        href: "/tasks?view=todo",
      })
    );

  linked.forEach((l) => {
    const mark = SOURCE[l.source] || SOURCE.기타;
    let d = l.from;
    while (d <= l.to) {
      put(d, {
        key: `${l.key}-${d}`,
        label: `${mark.icon} ${l.title}`,
        cls: mark.cls,
        href: l.href,
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
        <b style={{ fontSize: 14 }}>{y}년 {Number(m)}월</b>
        <Link className="btn btn-ghost btn-sm" href={`/tasks?view=calendar&m=${next}`}>다음달 ›</Link>
        {ym !== thisMonth && (
          <Link className="btn btn-ghost btn-sm" href="/tasks?view=calendar">이번달</Link>
        )}
        <span className="spacer" />
        <span className="hint">눌러서 고치는 것은 목록에서 합니다</span>
      </div>

      {/* 그림이 무슨 뜻인지 — 한 칸이 좁아 글자로는 다 못 적는다.
          **일정과 할 일을 갈라 놓는다.** (원장님, 2026-08-05)
            일정 = 그날 그런 일이 있다는 사실 (학교 일정 · 학생 결석 · 시험)
            할일 = 내가 처리해야 하는 것 (보강처럼 내 수업이 늘어나는 것)
          섞어두면 「오늘 뭘 해야 하나」 를 볼 때마다 눈으로 걸러내야 한다. */}
      <div className="stack" style={{ gap: 3, margin: "0 0 8px" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="tag tag-sky" style={{ fontSize: 10.5 }}>일정</span>
          {[["📕", "시험"], ["🚫", "휴강"], ["🤝", "방문상담"], ["📝", "레벨테스트"], ["🏠", "학생 결석"]]
            .map(([i, l]) => (
              <span className="hint" key={l} style={{ fontSize: 11.5 }}>{i} {l}</span>
            ))}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="tag tag-amber" style={{ fontSize: 10.5 }}>할일</span>
          {[["🔁", "보강 (내 수업이 늘어난 것)"], ["☑", "할일"]].map(([i, l]) => (
            <span className="hint" key={l} style={{ fontSize: 11.5 }}>{i} {l}</span>
          ))}
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
          const items = byDay.get(d) || [];
          const dow = i % 7;
          return (
            <div className={`cal-cell ${d === today ? "cal-today" : ""}`} key={d}>
              <div className={`cal-num ${dow === 0 ? "cal-sun" : dow === 6 ? "cal-sat" : ""}`}>
                {Number(d.slice(8))}
              </div>
              {items.map((it) => (
                <Link
                  className={`cal-item ${it.cls} ${it.done ? "cal-done" : ""}`}
                  key={it.key}
                  href={it.href}
                  title={it.label}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
