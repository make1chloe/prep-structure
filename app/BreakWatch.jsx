import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { notable, breakLine, minutesOf } from "@/lib/breaks";

/**
 * **오늘 쉬는 시간이 눈에 띄는 아이** (0106).
 *
 * 원장님 (2026-08-07) — 「특이사항 있을때만 선생님 대시보드에 알림
 * (반복적으로 5분이상이거나, 1회 10분이상일때)」
 *
 * **다 보여드리지 않는다.** 열 명이 하루 두 번씩 쉬면 스무 줄이 되고,
 * 그러면 이 칸을 안 보시게 된다. 규칙에 걸리는 아이만 올린다.
 *
 * **아직 안 돌아온 아이는 따로** 맨 위에 둔다 — 그건 지금 일이다.
 */
export default async function BreakWatch() {
  const supabase = await createClient();
  const today = todaySeoul();

  const { data, error } = await supabase
    .from("study_breaks")
    .select("id, student_id, started_at, ended_at, minutes")
    .eq("date", today);
  if (error || !data?.length) return null;   // 0106 전이면 조용히

  const byStudent = new Map();
  data.forEach((r) => {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
    byStudent.get(r.student_id).push(r);
  });

  const ids = [...byStudent.keys()];
  const { data: st } = await supabase.from("students").select("id, name").in("id", ids);
  const nameOf = new Map((st || []).map((s) => [s.id, s.name]));

  const now = Date.now();
  const out = [];
  const away = [];
  byStudent.forEach((rows, sid) => {
    const open = rows.find((r) => !r.ended_at);
    if (open) away.push({ sid, mins: minutesOf(open, now) });
    const hit = notable(rows, now);
    if (hit) out.push({ sid, ...hit, line: breakLine(rows, now) });
  });

  if (out.length === 0 && away.length === 0) return null;
  out.sort((a, b) => b.longest - a.longest);
  away.sort((a, b) => b.mins - a.mins);

  return (
    <div className="card sect sect-warn">
      <h2 className="secthead">
        쉬는 시간{" "}
        {out.length > 0 && <span className="tag tag-amber">{out.length}명</span>}
      </h2>

      {/* 지금 나가 있는 아이 — 이건 「기록」 이 아니라 지금 일이다 */}
      {away.length > 0 && (
        <div className="row" style={{ gap: 4, marginBottom: out.length ? 8 : 0, flexWrap: "wrap" }}>
          {away.map((a) => (
            <span
              key={a.sid}
              className={`tag ${a.mins >= 10 ? "tag-red" : "tag-mint"}`}
            >
              {nameOf.get(a.sid) || "학생"} · {a.mins}분째 나가 있음
            </span>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 3 }}>
        {out.map((r) => (
          <div className="unitrow" key={r.sid}>
            <b style={{ fontSize: 14, minWidth: 72 }}>{nameOf.get(r.sid) || "학생"}</b>
            <span className="tag tag-amber">{r.why}</span>
            <span className="hint">{r.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
