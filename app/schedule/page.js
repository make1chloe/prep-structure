/** 📅 일정 — 목업 12(원장 달력 · 8회 채우기). 판단은 lib/schedule-plan(순수) · 손은 lib/schedule, 여기는 가져다 그린다.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 일정 판 한 벌(schedule_board, 속도-상한 일정 8 · 2단) = 4단. 정상 수업은 안 띄운다 — 당연한 것이니까 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { scheduleBoard } from "@/lib/schedule";
import { ymOf } from "@/lib/cal-plan";
import { monthLabel, monthCells, eventsOf, dayRows, sessionsOf, classText, unscheduled, nextYm, LEGEND, W } from "@/lib/schedule-plan";
import Panel from "./panel.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Schedule({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📅</span>일정은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try {
    const date = await today(sb);
    const ym = /^\d{4}-\d{2}$/.test(String(sp?.m ?? "")) ? String(sp.m) : ymOf(date);
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(String(sp?.d ?? "")) ? String(sp.d) : ym === ymOf(date) ? date : `${ym}-01`;
    d = { date, ym, sel, classId: sp?.c ? String(sp.c) : null, board: await scheduleBoard(sb, ym, date) };
  } catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>일정을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0120 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  const b = d.board, target = Number(b.rules?.["schedule.sessions_per_month"] ?? 8);
  const q = (m, day = null) => `/schedule?m=${m}${day ? `&d=${day}` : ""}${d.classId ? `&c=${d.classId}` : ""}`;
  const cells = monthCells(d.ym, b, { classId: d.classId, today: d.date, sel: d.sel });
  const rows = dayRows(d.sel, b, d.classId), unsched = unscheduled(b, d.ym);
  return frame(<>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <a className="btn sm" href={q(nextYm(d.ym, -1))} aria-label="지난 달">◂</a><b style={{ fontSize: "var(--fs-5)" }} data-g="month">{monthLabel(d.ym)}</b><a className="btn sm" href={q(nextYm(d.ym, 1))} aria-label="다음 달">▸</a>
      <div className="seg sm" data-g="classes"><a className="btn sm" aria-pressed={!d.classId} href={`/schedule?m=${d.ym}&d=${d.sel}`} style={{ border: 0, borderRadius: 0 }}>전체</a>{(b.classes ?? []).map((c) => <a key={c.id} className="btn sm" aria-pressed={d.classId === c.id} href={`/schedule?m=${d.ym}&d=${d.sel}&c=${c.id}`} style={{ border: 0, borderRadius: 0 }}>{classText(c)}</a>)}</div>
      <span className="spacer" />
      <span className={"pill" + (unsched ? " warn" : "")} data-g="unsched">보강 안 잡힘 {unsched}</span>
      <a className="btn sm" href="/schedule/import">📡 학사일정 받아오기 ↗</a>
    </div>
    <div className="cnt8" data-g="cnt8">
      {(b.classes ?? []).map((c) => { const s = sessionsOf(c, target); return <div key={c.id} className={"c8" + (s.ok === false ? " short" : "")} data-g="c8" data-class={c.id}><b>{classText(c)}</b><span className={"c8n" + (s.ok === true ? " ok" : s.ok === false ? " bad" : "")}>{s.n}회</span><small>{s.text}{c.members != null ? ` · ${c.members}명` : ""}</small>{s.ok === false && <Panel.ClassMakeup classId={c.id} ym={d.ym} short={s.short} />}</div>; })}
      {!(b.classes ?? []).length && <div className="c8"><b>반이 없습니다</b><small>반은 재원생 14 에서</small></div>}
    </div>
    <div className="calwrap" style={{ marginTop: 8 }}><div className="cal big2" data-g="cal">
      {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
      {cells.map((c) => <a key={c.date} className={"cd" + (c.out ? " out" : "") + (c.sel ? " sel" : "") + (c.isToday ? " today" : "")} href={q(d.ym, c.date)} data-date={c.date} aria-label={c.date}><span className="dn">{c.day}</span>{c.events.slice(0, 3).map((e, i) => <span key={i} className={"ce " + e.kind}>{e.text}</span>)}{c.events.length > 3 && <span className="ce">+{c.events.length - 3}</span>}</a>)}
    </div></div>
    <div className="schday" style={{ marginTop: 12 }} data-g="day">
      <Panel d={{ date: d.date, ym: d.ym, sel: d.sel, classId: d.classId, rows, classes: b.classes ?? [], schools: b.schools ?? [] }} />
    </div>
    <div className="clegend" data-g="legend">{LEGEND.map(([k, icon, name]) => <span key={k}><i className={"ce " + k} style={{ padding: "0 8px" }}>{icon}</i>{name}</span>)}</div>
  </>);
}
