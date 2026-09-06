/** 아이 달력 09b — 지난 수업·숙제·시험을 날짜로. 칸을 누르면 그날의 줄(출·수·숙·시)이 아래에. 링크만으로 움직인다(?m=달 · ?d=날) — 판단은 lib/cal · cal-plan, 여기는 가져다 그린다 */
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { decide, ME } from "@/lib/perm";
import { today } from "@/lib/day";
import { calendar } from "@/lib/cal";
import { ymOf, LEGEND } from "@/lib/cal-plan";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}>{children}</main>;
export default async function Cal({ searchParams }) {
  const { sb, me, user } = await guard();
  if (me?.role !== ROLES.STUDENT) redirect("/");
  const q = await searchParams;
  let d, tday;
  try {
    tday = await today(sb);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(q?.d ?? "")) ? String(q.d) : tday;
    const ym = /^\d{4}-\d{2}$/.test(String(q?.m ?? "")) ? String(q.m) : ymOf(date);
    d = await calendar(sb, user, ym, date, tday);
  } catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 달력을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  if (decide(ROLES.STUDENT, d.access, ME.today) !== true) return frame(<div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div></div>);
  const link = (m, day) => `/me/cal?m=${m}${day ? `&d=${day}` : ""}`;
  return frame(<>
    <div className="calhead"><a className="btn sm" href={link(d.prev)} aria-label="지난 달">◂</a><b data-g="month">{d.label}</b><a className="btn sm" href={link(d.next)} aria-label="다음 달">▸</a><span className="spacer" /><span className="pill">{d.student.name}</span><a className="btn sm gho" href="/me">나 ↗</a></div>
    <div className="cal" data-g="cal">
      {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
      {d.cells.map((c) => <a key={c.date} className={"cd" + (c.out ? " out" : "") + (c.fut ? " fut" : "") + (c.today ? " today" : "") + (c.exam ? " exam" : "") + (c.sel && !c.today ? " cls" : "")} data-date={c.date} href={link(d.ym, c.date)}><span className="dn">{c.day}</span>{c.marks.map(([cls, ch], i) => <i key={i} className={"cm " + cls}>{ch}</i>)}</a>)}
    </div>
    <div className="clegend">{LEGEND.map(([cls, ch, name]) => <span key={cls}><i className={"cm " + cls}>{ch}</i>{name}</span>)}</div>
    <div className="card" style={{ padding: 8, marginTop: 8 }} data-g="day">
      <div className="ctitle" style={{ fontSize: "var(--fs-1)" }}>{d.detail.title}</div>
      {!d.detail.rows.length && <p className="note" style={{ margin: "4px 0 0" }}>이날은 적힌 것이 없어요</p>}
      {d.detail.rows.map((r, i) => <div className="li" key={i}><span className="n">{r.n}</span><div><b>{r.b}</b>{r.small && <small>{r.small}</small>}</div></div>)}
    </div>
  </>);
}
