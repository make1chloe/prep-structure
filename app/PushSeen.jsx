import { createClient } from "@/lib/supabase/server";

/**
 * **보낸 알림이 어디까지 갔나** (0105).
 *
 * 원장님 (2026-08-07) — 「어플 알림이 간 경우는 이게 확인이 됐는지 안 됐는지
 * 몇 시에 확인했는지까지 기록해 주고」
 *
 * 보내고 나면 끝이라 **「안 봤다」 와 「안 갔다」 를 구별할 수가 없었다.**
 * 그 둘은 다음에 할 일이 완전히 다르다 —
 *   안 봤다 → 전화를 드린다
 *   안 갔다 → 그 댁 알림 설정을 봐드린다
 *
 * **이 칸은 선생님 화면에만 있다.** 학생·학부모 화면 어디에도 이 표를 읽는
 * 곳이 없고, 읽기 규칙으로도 막혀 있다 (0105).
 */
const fmt = (t) => {
  if (!t) return null;
  const d = new Date(t);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default async function PushSeen() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("push_receipts")
    .select("id, profile_id, student_id, title, kind, sent_at, delivered_at, opened_at")
    .order("sent_at", { ascending: false })
    .limit(40);

  // 0105 전이면 표가 없다 — 아무것도 안 그린다
  if (error || !data?.length) return null;

  const sids = [...new Set(data.map((r) => r.student_id).filter(Boolean))];
  const pids = [...new Set(data.map((r) => r.profile_id).filter(Boolean))];
  const [{ data: st }, { data: pf }] = await Promise.all([
    sids.length
      ? supabase.from("students").select("id, name").in("id", sids)
      : Promise.resolve({ data: [] }),
    pids.length
      ? supabase.from("profiles").select("id, name, role").in("id", pids)
      : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((st || []).map((s) => [s.id, s.name]));
  const who = new Map((pf || []).map((p) => [p.id, p]));

  const unseen = data.filter((r) => !r.opened_at).length;

  return (
    <div className="card sect sect-calm">
      <h2 className="secthead">
        보낸 알림{" "}
        {unseen > 0 && <span className="tag tag-muted">안 본 것 {unseen}</span>}
      </h2>
      <div className="stack" style={{ gap: 3 }}>
        {data.slice(0, 20).map((r) => {
          const p = who.get(r.profile_id);
          const child = nameOf.get(r.student_id);
          const label = child
            ? `${child}${p?.role === "parent" ? " 어머니" : ""}`
            : p?.name || "—";
          return (
            <div className="unitrow" key={r.id}>
              <b style={{ fontSize: 12.5, minWidth: 92 }}>{label}</b>
              <span className="hint" style={{ flex: 1, minWidth: 100 }}>
                {r.title || "알림"}
              </span>
              <span className="hint">{fmt(r.sent_at)}</span>
              {r.opened_at ? (
                <span className="tag tag-mint">{fmt(r.opened_at)} 확인</span>
              ) : r.delivered_at ? (
                // 폰까지는 갔는데 안 누르신 것 — 설정 문제가 아니라 못 보신 것이다
                <span className="tag tag-amber">폰에 도착 · 아직 안 봄</span>
              ) : (
                // 폰에 닿았다는 소식조차 없다 — 알림이 꺼져 있을 수 있다
                <span className="tag tag-muted">도착 확인 안 됨</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
