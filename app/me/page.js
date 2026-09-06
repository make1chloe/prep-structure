/** 아이 화면 07 「나」 — 하루 동선대로: 등원 → 오늘 할 것(학원·숙제) → 오늘 낼 숙제 → 시험 → 남아서 → 앞으로 → 내 교재 → 선생님 한 마디 → 집에 가요.
 *  전부 아이 자격으로 읽는다(RLS 가 제 것만 준다). 카드는 원장님이 「누가 무엇을 보나」에서 켠 것만(me.*) — 안 정한 칸은 막혀 있다. 판단은 lib/me · lib/arrival-plan, 여기는 가져다 그린다 */
import { guard } from "@/lib/session";
import { ROLES, isStaff } from "@/lib/roles";
import { decide, ME } from "@/lib/perm";
import { today } from "@/lib/day";
import { meDay } from "@/lib/me";
import { hhmm } from "@/lib/late-plan";
import { classLabel, md } from "@/lib/dash-plan";
import { KIND as QKIND, scopeText } from "@/lib/quiz-plan";
import { STOP } from "@/lib/routine-plan";
import { ArrivalCard, SaidButton, MaterialCard, ScoreCard } from "./cards.js";
import AskCard from "../_shell/askcard.js";
import BellCard from "../_shell/bell.js";
import { ask } from "./actions.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}><div className="mine">{children}</div></main>;
const Card = ({ emo, title, id, pill, children }) => <div className="task" data-card={id}><div className="h"><b><span className="cemo">{emo}</span>{title}</b><span className="spacer" />{pill != null && <span className="pill">{pill}</span>}</div>{children}</div>;
const unitText = (it) => it.units ? `${it.units.chapter} › ${it.units.short}${it.units.page_start ? ` · p.${it.units.page_start}${it.units.page_end && it.units.page_end !== it.units.page_start ? `-${it.units.page_end}` : ""}` : ""}` : "";
const Line = ({ it, right }) => <div className="li"><div><b>{it.learn_items?.name ?? it.range_note ?? "(이름 없음)"}</b><small>{[unitText(it), it.learn_items && it.range_note ? `이번에 ${it.range_note}` : null, it.memo].filter(Boolean).join(" · ")}</small></div>{right}</div>;
const qname = (k) => QKIND.find(([x]) => x === k)?.[1] ?? k;
export default async function Me() {
  const { sb, me, user } = await guard();
  if (!me) redirect("/");
  if (isStaff(me.role)) return frame(<div className="task"><div className="h"><b>🎒 아이 화면입니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>학원 사람은 오늘 수업·대시보드에서 봅니다.</p></div>);
  if (me.role !== ROLES.STUDENT) redirect("/");
  let date, d;
  try { date = await today(sb); d = await meDay(sb, user, date); }
  catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 내 화면을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  const can = (k) => decide(ROLES.STUDENT, d.access, k) === true;
  const shown = [ME.arrival, ME.today, ME.books].filter(can);
  const first = d.classes[0];
  return frame(<>
    <div className="wv" style={{ margin: "0 0 4px" }}><b style={{ fontSize: "var(--fs-6)" }}>{d.student.name}</b>{first && <span className="pill">{classLabel(first)}</span>}<span className="spacer" /><span className="pill">{md(date)}</span></div>
    {!shown.length && <div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>원장님이 「누가 무엇을 보나」에서 아이 화면 카드를 켜면 보입니다.</p></div>}
    {can(ME.arrival) && <ArrivalCard arrival={d.arrival} choice={d.choice} off={d.off} />}
    {can(ME.today) && <>
      <Card emo="📋" title="오늘 할 것" id="todo" pill={d.sheet ? `학원 ${d.classSteps.length} · 숙제 ${d.sheet.home.length}` : null}>
        {!d.sheet && <p className="note" style={{ margin: "8px 0 0" }}>선생님이 오늘 수업을 열면(또는 내가 출석을 찍으면) 여기 뜹니다.</p>}
        {d.sheet && !d.classSteps.length && !d.sheet.home.length && <p className="note" style={{ margin: "8px 0 0" }}>선생님이 숙제를 검사하면 오늘 학습·숙제가 뜹니다.</p>}
        {d.classSteps.length > 0 && <><div className="hh" style={{ marginTop: 8 }}>학원에서 · 차례대로</div>{d.classSteps.map((it) => <Line key={it.id} it={it} right={<SaidButton item={it} state={it.state} />} />)}
          {d.sheet.books.filter((b) => b.class_memo).map((b) => <p key={b.book_id} className="note" style={{ margin: "4px 0 0", color: "var(--navy)" }}>✎ 선생님 메모 — {b.class_memo}</p>)}</>}
        {d.sheet?.home.length > 0 && <><div className="hh" style={{ marginTop: 8 }}>집에서 · 다음 시간에 냅니다</div>{d.sheet.home.map((it) => <Line key={it.id} it={it} right={<SaidButton item={it} />} />)}
          {d.sheet.books.filter((b) => b.home_memo).map((b) => <p key={b.book_id} className="note" style={{ margin: "4px 0 0", color: "var(--navy)" }}>✎ 선생님 메모 — {b.home_memo}</p>)}</>}
      </Card>
      <Card emo="📘" title="오늘 낼 숙제" id="due" pill={String(d.due.length)}>
        {!d.due.length && <p className="note" style={{ margin: "8px 0 0" }}>낼 숙제가 없어요</p>}
        {d.due.map((it) => <Line key={it.id} it={it} right={it.status && it.status !== "none" ? <span className={"tag" + (it.status === "done" ? " on" : "")}>검사 {it.status === "done" ? "○" : it.status === "weak" ? "△" : "✕"}</span> : it.said_done_at ? <span className="tag on">했어요 ✓</span> : null} />)}
        {d.dueFrom && d.dueFrom !== "check" && <p className="note" style={{ margin: "4px 0 0" }}>{md(d.dueFrom)} 에 받은 숙제 — 오늘 검사받아요</p>}
      </Card>
      {(d.quizzes.today.length > 0 || d.quizzes.next.length > 0) && <Card emo="🔤" title="시험" id="quiz" pill={String(d.quizzes.today.length + d.quizzes.next.length)}>
        {d.quizzes.today.map((q) => <div className="li" key={q.id}><div><b>{qname(q.kind)} 시험 — {scopeText(q)}</b><small>{q.total ? `${q.total}개 · 통과 ${q.cut_pct ?? 90}%` : "개수 아직"}{q.passed === true ? ` · ${q.pct}% 통과` : q.passed === false ? ` · ${q.pct}% 못 넘음 → 재시험` : ""}{q.retry_of ? " · 재시험" : ""}</small></div>{q.state === "skipped" && <span className="tag">오늘 건너뜀</span>}</div>)}
        {d.quizzes.next.map((q) => <div className="li" key={q.id}><div><b>다음 시간 {qname(q.kind)} 시험 — {scopeText(q)}</b><small>{q.total ? `${q.total}개 · 통과 ${q.cut_pct ?? 90}%` : "개수 아직"}</small></div></div>)}
      </Card>}
      {d.sheet?.late?.until_at && <Card emo="🌙" title="오늘은 남아서" id="stay" pill={`${hhmm(d.sheet.late.until_at)} 예정`}>
        <p className="note" style={{ margin: "4px 0 0" }}>{d.sheet.late.reason || "남아서 하고 갑니다"}</p></Card>}
      {d.future.length > 0 && <Card emo="📅" title="앞으로" id="future" pill={String(d.future.length)}>
        {d.future.map((f, i) => <p key={i} className="note" style={{ margin: "4px 0 0", color: "var(--ink)" }}>{f.text}</p>)}</Card>}
      <a className="task" href="/me/cal" data-card="cal" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="h"><b><span className="cemo">📅</span>달력</b><span className="spacer" /><span className="pill">열기 ↗</span></div><p className="note" style={{ margin: "4px 0 0" }}>지난 수업·숙제·시험과 앞으로의 수업·결석 예정을 날짜로 봅니다 — 등원·하원 시각도 날마다</p></a>
    </>}
    <ScoreCard scores={d.scores} entry={d.entry} />
    {can(ME.books) && <MaterialCard gives={d.gives} today={date} />}
    {can(ME.books) && <Card emo="🗺" title="내 교재" id="books" pill={`${d.books.length}권`}>
      {!d.books.length && <p className="note" style={{ margin: "8px 0 0" }}>배정된 교재가 없어요</p>}
      {d.books.map((b) => <a className="li" key={b.id} href={`/me/book?b=${b.book_id}`} data-g="book-link" style={{ textDecoration: "none", color: "inherit" }}><div><b>{b.books?.name}</b><small>{b.round}회독{b.left != null ? ` · 남은 소단원 ${b.left}` : ""} · 로드맵 ↗</small></div>{b.stop_mode !== "running" && <span className="tag">{STOP.find(([k]) => k === b.stop_mode)?.[1] ?? "멈춤"}</span>}</a>)}
    </Card>}
    {can(ME.today) && d.memos.length > 0 && <Card emo="💬" title="선생님 한 마디" id="memo" pill={md(d.memos[0].sheet_date)}>
      {d.memos.map((m) => <div className="li" key={m.area}><div><b>{m.area}</b><small>{m.memo}</small></div></div>)}</Card>}
    <BellCard />
    {can(ME.today) && <AskCard asks={d.asks} send={ask} />}
  </>);
}
