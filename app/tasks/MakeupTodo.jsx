import Link from "next/link";
import { datesLabel } from "@/lib/makeupTodo";

/**
 * **결석해서 늘어난 내 수업.**
 *
 * 결석 자체는 일정이다 (그날 그런 일이 있었다). 여기 있는 것은 그래서
 * **내가 한 번 더 해야 하는 수업**이라 할 일이다.
 *
 * 여기서 체크하지 않는다. 보강을 잡는 것은 오늘 수업·달력에서 하는 일이고,
 * 잡히면 이 줄은 저절로 사라진다. 두 군데에서 체크하게 만들면 어느 쪽이
 * 맞는지 알 수 없게 된다 (내신 자료 할일과 같은 방식이다).
 */
export default function MakeupTodo({ rows = [] }) {
  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 15 }}>보강 필요 {rows.length}명</b>
        <span className="hint">결석해서 수업이 한 번 더 필요한 학생입니다</span>
      </div>
      <div className="stack" style={{ gap: 4, marginTop: 8 }}>
        {rows.map((r) => (
          <div className="unitrow" key={r.student_id}>
            <span className="tag tag-sky">보강</span>
            <span style={{ fontSize: 14.5, flex: 1 }}>
              <b>{r.name}</b>{" "}
              <span className="muted">
                {datesLabel(r.dates)} 결석
                {r.reasons.length > 0 && ` · ${[...new Set(r.reasons)].join(", ")}`}
              </span>
            </span>
            <Link className="btn btn-ghost btn-sm" href={`/today?d=${r.dates[0]}&open=${r.student_id}`}>
              잡기
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
