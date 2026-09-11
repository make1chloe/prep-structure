/** 아이 달력 09b — 지난 수업·숙제·시험을 날짜로. 그림은 app/_shell/calview(학부모와 같은 것) · 데이터는 lib/cal · 판단은 lib/cal-plan */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { ROLES } from "@/lib/roles";
import { decide, ME } from "@/lib/perm";
import { today } from "@/lib/day";
import { myStudent } from "@/lib/arrival";
import { calendar } from "@/lib/cal";
import { ymOf } from "@/lib/cal-plan";
import CalView from "../../_shell/calview.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}>{children}</main>;
export default async function Cal({ searchParams }) {
  const { sb, me, user } = await guard();
  if (me?.role !== ROLES.STUDENT) redirect("/");
  const q = await searchParams;
  let d;
  try {
    const [tday, st] = await Promise.all([today(sb), myStudent(sb, user.id)]);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q?.d ?? "")) ? String(q.d) : tday;
    const ym = /^\d{4}-\d{2}$/.test(String(q?.m ?? "")) ? String(q.m) : ymOf(date);
    d = await calendar(sb, st, ym, date, tday, ROLES.STUDENT);
  } catch (e) { { console.error("[화면] 달력 못 엶:", e); return frame(<Oops what="달력" e={e} kind="task" />); } }
  if (decide(ROLES.STUDENT, d.access, ME.today) !== true) return frame(<div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div></div>);
  return frame(<CalView d={d} base="/me/cal" backHref="/me" backLabel="나 ↗" />);
}
