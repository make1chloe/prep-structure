import Link from "next/link";
import { todaySeoul, shortLabel } from "@/lib/day";

/**
 * 아직 안 만든 **내신 자료.**
 *
 * 할일 화면에 내신 자료가 안 떠서, 시험이 코앞인데 뭐가 남았는지 알려면
 * 내신 대비 화면을 따로 열어야 했다. 이제 여기 같이 뜬다.
 *
 * **여기서 체크하지 않는다.** 진짜 상태는 내신 대비 화면에 있다. 두 군데에서
 * 체크하게 만들면 어느 쪽이 맞는지 알 수 없게 된다 — 보여주고 데려다만 준다.
 */
function dday(due, today) {
  const a = new Date(`${today}T00:00:00Z`);
  const b = new Date(`${due}T00:00:00Z`);
  const n = Math.round((b - a) / 86400000);
  if (n === 0) return { text: "오늘", cls: "tag-red" };
  if (n < 0) return { text: `${-n}일 지남`, cls: "tag-red" };
  if (n <= 3) return { text: `D-${n}`, cls: "tag-red" };
  if (n <= 7) return { text: `D-${n}`, cls: "tag-amber" };
  return { text: `D-${n}`, cls: "tag-muted" };
}

export default function PrepTodo({ rows = [] }) {
  if (rows.length === 0) return null;
  const today = todaySeoul();

  // 시험 하나로 묶는다 — 「신송중 2학년 1학기 기말」 아래 자료들
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.exam === r.exam && last.due === r.due) last.items.push(r);
    else groups.push({ exam: r.exam, due: r.due, byEnglish: r.byEnglish, items: [r] });
  }

  return (
    <div className="card sect sect-warn" style={{ marginBottom: 10 }}>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <h2 className="secthead" style={{ margin: 0 }}>내신 자료 — 아직 안 만든 것</h2>
        <span className="tag tag-amber">{rows.length}개</span>
        <span className="spacer" />
        <Link className="btn btn-ghost btn-sm" href="/prep">
          내신 대비 ›
        </Link>
      </div>
      <p className="hint" style={{ margin: "6px 0 10px", lineHeight: 1.6 }}>
        체크는 <b>내신 대비 화면에서</b> 합니다. 여기서는 무엇이 언제까지 남았는지만 봅니다.
      </p>

      <div className="stack" style={{ gap: 8 }}>
        {groups.map((g) => {
          const d = dday(g.due, today);
          return (
            <div key={`${g.exam}-${g.due}`}>
              <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 3 }}>
                <span className={`tag ${d.cls}`}>{d.text}</span>
                <b style={{ fontSize: 14 }}>{g.exam}</b>
                <span className="hint">
                  {g.byEnglish ? "영어 시험" : "시험 시작"} {shortLabel(g.due)}
                </span>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                {/* 그 시험이 열린 채로 — /prep 맨 위에서 다시 찾지 않게 (2026-08-21) */}
                {g.items.map((m) => (
                  <Link className="unitrow" key={m.id} href={m.examId ? `/prep?e=${m.examId}` : "/prep"} style={{ textDecoration: "none" }}>
                    <span style={{ fontSize: 14 }}>{m.name}</span>
                    {m.scope && <span className="tag tag-muted">{m.scope}</span>}
                    <span className="spacer" />
                    {m.left.map((s) => (
                      <span className="tag tag-amber" key={s}>{s}</span>
                    ))}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
