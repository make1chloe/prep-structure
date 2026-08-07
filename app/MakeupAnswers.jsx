import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import MakeupRows from "./MakeupRows";

/**
 * **잡아둔 보강** — 답이 왔나, 그리고 무를 수 있게 (0107).
 *
 * 원장님 (2026-08-07)
 *   어머니가 「확정」 · 「일정 변경 요청」 을 누르시게 했다 → 그 답이 여기 모인다
 *   「보강일정 잡았다가 취소하려면 어떻게 해야해?」 → **길이 없었다.**
 *
 * 잡는 길만 있고 무르는 길이 없었다. 잘못 잡으면 그 줄이 그대로 남아서,
 * 그날 「오늘 수업」 에 오지도 않을 아이가 뜬다.
 *
 * 그래서 **앞으로의 보강을 전부** 보여준다. 답이 급한 순서로 —
 *   변경 요청    지금 손봐야 하는 일이다
 *   답 없음      그날 안 오실 수 있다
 *   확정         한 줄로 작게. 취소는 여기서도 된다
 */
/**
 * @param only  "changed" 면 **어머니가 무언가를 요구하신 것만.**
 *
 * 대시보드는 「답할 것」 만 모으는 자리다 (원장님, 2026-08-07 —
 * 「대시보드는 미확인 요청이 모두 보여야돼, 일종의 알림센터 기능」).
 * 앞으로의 보강을 전부 늘어놓으면 답할 것 한 줄이 확정된 열 줄에 묻힌다.
 * 전부 보는 자리는 출결 화면이다.
 */
export default async function MakeupAnswers({ only = null }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, date, makeup_time, reason, makeup_of, makeup_confirmed_at, makeup_change_req")
    .eq("status", "makeup")
    .gte("date", todaySeoul())
    .order("date", { ascending: true })
    .limit(60);

  if (error) {
    // 0107 전이면 확정 칸이 없다 — 그래도 **취소는 되어야 한다**
    const { data: bare } = await supabase
      .from("attendance")
      .select("student_id, date, makeup_time, reason, makeup_of")
      .eq("status", "makeup")
      .gte("date", todaySeoul())
      .order("date", { ascending: true })
      .limit(60);
    return render(supabase, bare || [], false, only);
  }
  return render(supabase, data || [], true, only);
}

async function render(supabase, all, hasAnswer, only) {
  const rows = only === "changed" ? all.filter((r) => r.makeup_change_req) : all;
  if (rows.length === 0) return null;

  const ids = [...new Set(rows.map((r) => r.student_id))];
  const { data: st } = await supabase.from("students").select("id, name").in("id", ids);
  const nameOf = Object.fromEntries((st || []).map((s) => [s.id, s.name]));

  return <MakeupRows rows={rows} nameOf={nameOf} hasAnswer={hasAnswer} onlyChanged={only === "changed"} />;
}
