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
    .select("id, profile_id, student_id, title, kind, sent_at, delivered_at, opened_at, failed_at, fail_why")
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

  const bad = data.filter((r) => r.failed_at).length;
  const unseen = data.filter((r) => !r.opened_at && !r.failed_at).length;

  return (
    <div className="card sect sect-calm">
      <h2 className="secthead">
        보낸 알림{" "}
        {/* **못 간 것이 먼저다.** 안 본 것은 기다리면 되지만, 못 간 것은
            그 댁 설정을 봐드려야 한다 (원장님, 2026-08-07) */}
        {bad > 0 && <span className="tag tag-red">안 보내짐 {bad}</span>}{" "}
        {unseen > 0 && <span className="tag tag-muted">미확인 {unseen}</span>}
      </h2>
      {bad > 0 && (
        <div className="notice" style={{ marginBottom: 8, fontSize: 14 }}>
          <b>{bad}건이 폰까지 못 갔습니다.</b> 그 집은 알림이 꺼져 있거나 앱을 지운 상태예요.
        </div>
      )}
      <div className="stack" style={{ gap: 3 }}>
        {data.slice(0, 20).map((r) => {
          const p = who.get(r.profile_id);
          const child = nameOf.get(r.student_id);
          const label = child
            ? `${child}${p?.role === "parent" ? " 어머니" : ""}`
            : p?.name || "—";
          return (
            <div className="unitrow" key={r.id}>
              <b style={{ fontSize: 14, minWidth: 92 }}>{label}</b>
              <span className="hint" style={{ flex: 1, minWidth: 100 }}>
                {r.title || "알림"}
              </span>
              <span className="hint">{fmt(r.sent_at)}</span>
              {/**
                * 원장님 (2026-08-07) — 「확인한 경우 시간만, 확인 하지 않은
                * 경우 미확인, 전송이 아예 안 된 경우 오류 표시」
                *
                * 「폰에 도착 · 아직 안 봄」 처럼 길게 적으면 스무 줄이
                * 늘어섰을 때 눈이 못 따라간다. 세 가지로만.
                */}
              {r.failed_at ? (
                <span className="tag tag-red" title={r.fail_why || ""}>오류</span>
              ) : r.opened_at ? (
                <span className="tag tag-mint">{fmt(r.opened_at)}</span>
              ) : (
                <span className="tag tag-muted">미확인</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
