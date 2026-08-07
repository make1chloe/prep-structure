import { createClient } from "@/lib/supabase/server";
import { todaySeoul, dayLabel } from "@/lib/day";

/**
 * **잡아둔 보강에 답이 왔나** (0107).
 *
 * 원장님 (2026-08-07) — 어머니가 「확정」 이나 「일정 변경 요청」 을 누르시게
 * 했다. 그러면 그 답이 **여기 모여야** 뜻이 있다.
 *
 *   변경 요청   지금 손봐야 하는 일이다 — 맨 위, 빨갛게
 *   아직 답 없음 그날 안 오실 수 있다 — 미리 아는 것이 전부다
 *   확정        보여드릴 것이 없다. 안 그린다
 *
 * 확정된 것까지 늘어놓으면 이 칸이 길어지고, 길어지면 안 보시게 된다.
 */
export default async function MakeupAnswers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, date, makeup_time, makeup_confirmed_at, makeup_change_req, makeup_req_at")
    .eq("status", "makeup")
    .gte("date", todaySeoul())
    .order("date", { ascending: true })
    .limit(60);

  // 0107 전이면 칸이 없다 — 조용히 넘어간다
  if (error || !data?.length) return null;

  const wait = data.filter((r) => !r.makeup_confirmed_at && !r.makeup_change_req);
  const changed = data.filter((r) => r.makeup_change_req);
  if (wait.length === 0 && changed.length === 0) return null;

  const ids = [...new Set([...wait, ...changed].map((r) => r.student_id))];
  const { data: st } = await supabase.from("students").select("id, name").in("id", ids);
  const nameOf = new Map((st || []).map((s) => [s.id, s.name]));

  return (
    <div className={`card sect ${changed.length ? "sect-bad" : "sect-warn"}`}>
      <h2 className="secthead">
        보강 확인{" "}
        {changed.length > 0 && <span className="tag tag-red">변경 요청 {changed.length}</span>}{" "}
        {wait.length > 0 && <span className="tag tag-muted">답 없음 {wait.length}</span>}
      </h2>

      <div className="stack" style={{ gap: 3 }}>
        {changed.map((r) => (
          <div className="unitrow" key={`c-${r.student_id}-${r.date}`}>
            <b style={{ fontSize: 12.5, minWidth: 72 }}>{nameOf.get(r.student_id) || "학생"}</b>
            <span className="hint">{dayLabel(r.date)}</span>
            {r.makeup_time && <span className="hint">{r.makeup_time.slice(0, 5)}</span>}
            <span className="tag tag-red">변경 요청</span>
            <span className="hint" style={{ flex: 1 }}>{r.makeup_change_req}</span>
          </div>
        ))}
        {wait.map((r) => (
          <div className="unitrow" key={`w-${r.student_id}-${r.date}`}>
            <b style={{ fontSize: 12.5, minWidth: 72 }}>{nameOf.get(r.student_id) || "학생"}</b>
            <span className="hint">{dayLabel(r.date)}</span>
            {r.makeup_time && <span className="hint">{r.makeup_time.slice(0, 5)}</span>}
            <span className="tag tag-muted">아직 답 없음</span>
          </div>
        ))}
      </div>
    </div>
  );
}
