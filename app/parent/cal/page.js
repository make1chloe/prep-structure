/** 학부모 달력 09b — 아이 달력과 같은 그림(app/_shell/calview) · 같은 데이터(lib/cal.calendar) · 학부모 자격 RLS(마감한 판만). 형제는 ?s */
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { decide, PARENT } from "@/lib/perm";
import { today } from "@/lib/day";
import { myChildren } from "@/lib/parent";
import { calendar } from "@/lib/cal";
import { ymOf } from "@/lib/cal-plan";
import CalView from "../../_shell/calview.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}>{children}</main>;
export default async function ParentCal({ searchParams }) {
  const { sb, me } = await guard();
  if (me?.role !== ROLES.PARENT) redirect("/");
  const q = await searchParams;
  let d, kid;
  try {
    const [tday, kids] = await Promise.all([today(sb), myChildren(sb)]);
    kid = kids.find((k) => k.id === String(q?.s ?? "")) ?? kids[0];
    if (!kid) return frame(<div className="task"><div className="h"><b>👨‍👩‍👧 아이가 아직 이어지지 않았어요</b></div></div>);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q?.d ?? "")) ? String(q.d) : tday;
    const ym = /^\d{4}-\d{2}$/.test(String(q?.m ?? "")) ? String(q.m) : ymOf(date);
    d = await calendar(sb, kid, ym, date, tday, ROLES.PARENT);
  } catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 달력을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  if (decide(ROLES.PARENT, d.access, PARENT.recent) !== true) return frame(<div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div></div>);
  return frame(<CalView d={d} base="/parent/cal" extra={`&s=${kid.id}`} backHref={`/parent?s=${kid.id}`} backLabel="학부모 ↗" />);
}
