import { createClient } from "@/lib/supabase/server";
import PushSeenList from "./PushSeenList";

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
 *
 * 여기서는 읽어서 이름만 붙이고, 접기·선택·치우기는 PushSeenList(클라이언트)가
 * 한다 (원장님, 2026-08-15 — 「선택/삭제/확인/접기가 필요하지 않나」).
 */
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

  const rows = data.map((r) => {
    const p = who.get(r.profile_id);
    const child = nameOf.get(r.student_id);
    return {
      id: r.id,
      label: child ? `${child}${p?.role === "parent" ? " 어머니" : ""}` : p?.name || "—",
      title: r.title || "알림",
      sentAt: r.sent_at,
      openedAt: r.opened_at,
      failedAt: r.failed_at,
      failWhy: r.fail_why || "",
    };
  });
  return <PushSeenList rows={rows} />;
}
