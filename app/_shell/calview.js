/** 📅 달력 그리기(목업 09b) — 아이·학부모가 같은 그림. 데이터는 lib/cal.calendar(), 링크만으로 움직인다(?m 달 · ?d 날 · 형제는 ?s) — <Link> 라 통째로 다시 안 연다(날짜 42칸은 prefetch 끔: 누르는 건 하루뿐). 앞날은 다음 달까지 · 지난 것은 재원 기간만(확정-⑯) */
import Link from "next/link";
import { LEGEND } from "@/lib/cal-plan";
export default function CalView({ d, base, extra = "", backHref, backLabel, kids = [] }) {
  const link = (m, day) => `${base}?m=${m}${day ? `&d=${day}` : ""}${extra}`;
  const kidLink = (id) => `${base}?m=${d.ym}${d.date ? `&d=${d.date}` : ""}&s=${id}`;   // (서2) 형제 — 달력 안에서 바로 바꾼다. 없으면 「달력 → 학부모 → 칩 → 달력」 네 걸음이었다
  return (<>
    <div className="calhead">
      {d.canPrev ? <Link prefetch={false} className="btn sm" href={link(d.prev)} aria-label="지난 달">◂</Link> : <span className="btn sm dim" aria-disabled="true">◂</span>}
      <b data-g="month">{d.label}</b>
      {d.canNext ? <Link prefetch={false} className="btn sm" href={link(d.next)} aria-label="다음 달">▸</Link> : <span className="btn sm dim" aria-disabled="true">▸</span>}
      <span className="spacer" />
      {kids.length > 1
        ? <div className="seg sm" data-g="cal-kids">{kids.map((k) => <Link prefetch={false} key={k.id} className="btn sm" aria-pressed={k.id === d.student.id} href={kidLink(k.id)} style={{ border: 0 }}>{k.name}</Link>)}</div>
        : <span className="pill">{d.student.name}</span>}
      <Link prefetch={false} className="btn sm gho" href={backHref}>{backLabel}</Link></div>
    <div className="cal" data-g="cal">
      {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
      {d.cells.map((c) => <Link prefetch={false} key={c.date} className={"cd" + (c.out ? " out" : "") + (c.fut ? " fut" : "") + (c.today ? " today" : "") + (c.exam ? " exam" : "") + (c.sel && !c.today ? " cls" : "")} data-date={c.date} href={link(d.ym, c.date)}><span className="dn">{c.day}</span>{c.marks.map(([cls, ch], i) => <i key={i} className={"cm " + cls}>{ch}</i>)}</Link>)}
    </div>
    <div className="clegend">{LEGEND.map(([cls, ch, name]) => <span key={cls}><i className={"cm " + cls}>{ch}</i>{name}</span>)}</div>
    <div className="card" style={{ padding: 8, marginTop: 8 }} data-g="day">
      <div className="ctitle" style={{ fontSize: "var(--fs-1)" }}>{d.detail.title}</div>
      {!d.detail.rows.length && <p className="note" style={{ margin: "4px 0 0" }}>이날은 적힌 것이 없어요</p>}
      {d.detail.rows.map((r, i) => <div className="li" key={i}><span className="n">{r.n}</span><div><b>{r.b}</b>{r.small && <small>{r.small}</small>}</div></div>)}
    </div>
  </>);
}
