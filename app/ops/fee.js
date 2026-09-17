"use client";
/** 수강료 판(목업 13) · 학생 · 반 · 금액 · 받은 날 · 상태. 저장은 바뀐 줄만 · 합계는 화면이 센다(대전제-5) · 엑셀로 내보내기 · 결제선생에서 올리기 · ✔ 안 받음 줄 다 받음(도장 · 받은 날 = 오늘 · payAllEdits 한 곳 · 저장 손 그대로) */
import FilePick from "../_shell/filepick.js";
import Link from "next/link";
import { usePick, PickAll, PickBox, PickBar } from "../_shell/pick.js";   /* 고르기 한 벌((어28) · 대전제-20) · 고른 줄에 ✔ 받음 · 안내 · 예약 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAct, importAct, remindAct, byGradeAct, scheduleFeesAct } from "./actions.js";
import When, { customOf } from "../send/when.js";   // ⏰ 예약 때 고르기 — 발송 10 과 같은 부품((어))
import { whenLabel } from "@/lib/send-plan";
import { won, parseWon, totals, STATE, GRADE_KEYS, METHODS, prevUnpaidText, payAllEdits } from "@/lib/fee-plan";
import { monthLabel, nextYm } from "@/lib/schedule-plan";
import { md } from "@/lib/dash-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Fee({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState({});   // student_id → { amount, paid_on, method }
  const [when, setWhen] = useState("evening"); const [cDate, setCDate] = useState(d.date); const [cTime, setCTime] = useState("18:00");   // ⏰ 예약 때((어))
  const [gradeOpen, setGradeOpen] = useState(false); const [grade, setGrade] = useState(null);   // 학년별 기준(4단계-4)
  const rows = d.rows.map((r) => { const e = edit[r.student_id]; if (!e) return r; const amount = "amount" in e ? parseWon(e.amount) : r.amount; const paid_on = "paid_on" in e ? (e.paid_on || null) : r.paid_on; const method = "method" in e ? (e.method || null) : (r.method ?? null); return { ...r, amount, paid_on, method, state: amount == null ? "none" : paid_on ? "paid" : "unpaid", dirty: true }; });
  const t = totals(rows);
  const ids = useMemo(() => d.rows.map((r) => r.student_id), [d.rows]); const pk = usePick(ids); const picked = rows.filter((r) => pk.has(r.student_id) && r.state === "unpaid");   /* 고른 줄 중 안 받은 것 · 한 번에 할 대상 */
  const run = (fn, okMsg, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(okMsg(r)); setEdit({}); if (after) after(); router.refresh(); });
  const save = () => run(() => saveAct(d.ym, rows.filter((r) => r.dirty).map((r) => ({ student_id: r.student_id, amount: r.amount, paid_on: r.paid_on, method: r.method }))), (r) => `저장했습니다. ${r.saved}줄${r.ruled ? ` · 단가 줄 ${r.ruled}(이 달부터)` : ""}`);
  const setA = (id, v) => setEdit({ ...edit, [id]: { ...(edit[id] ?? {}), amount: v } }), setP = (id, v) => setEdit({ ...edit, [id]: { ...(edit[id] ?? {}), paid_on: v } }), setM = (id, v) => setEdit({ ...edit, [id]: { ...(edit[id] ?? {}), method: v } });
  const gradeForm = grade ?? Object.fromEntries(GRADE_KEYS.map((k) => [k, d.by_grade?.[k] != null ? String(d.by_grade[k]) : ""]));
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <Link prefetch={false} className="btn sm" href={`/ops/students?v=fee&m=${nextYm(d.ym, -1)}`} aria-label="지난 달">◂</Link><b style={{ fontSize: "var(--fs-5)" }} data-g="month">{monthLabel(d.ym)}</b><Link prefetch={false} className="btn sm" href={`/ops/students?v=fee&m=${nextYm(d.ym, 1)}`} aria-label="다음 달">▸</Link>
      <span className={"pill" + (t.unpaidCount ? " warn" : "")} data-g="unpaid-count">안 받음 {t.unpaidCount}</span>
      {t.noneCount > 0 && <span className="pill" data-g="none-count">금액 없음 {t.noneCount}</span>}
      {prevUnpaidText(d.prev_unpaid) && <Link prefetch={false} className="pill warn" data-g="prev-unpaid" href={`/ops/students?v=fee&m=${nextYm(d.ym, -1)}`} title={(d.prev_unpaid?.names ?? []).join(", ")}>{prevUnpaidText(d.prev_unpaid)} 👉</Link>}
      <button type="button" className="btn sm" data-act="grade-open" aria-pressed={gradeOpen} onClick={() => setGradeOpen(!gradeOpen)}>학년별 기준</button>
      <span className="spacer" />
      <form action={(fd) => run(() => importAct(d.ym, fd), (r) => `올렸습니다. ${r.put}줄${r.skipped ? ` · 건너뜀 ${r.skipped}` : ""}${r.unmatched.length ? ` · 못 맞춘 이름: ${r.unmatched.join(", ")}` : ""}${r.dup.length ? ` · 같은 이름 둘: ${r.dup.join(", ")}` : ""}`)} className="wv" style={{ gap: 4 }} data-g="import">
        <FilePick name="file" accept=".xlsx,.xls,.csv" ariaLabel="결제선생 엑셀" label="📄 엑셀 고르기" /><button className="btn sm" type="submit" disabled={pending} data-act="import">📄 결제선생에서 올리기</button></form>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {gradeOpen && <div className="card" style={{ margin: "0 0 8px" }} data-g="grade-form"><div className="ctitle"><span className="cemo">🎓</span>학년별 기준</div>
      <div className="wv">{GRADE_KEYS.map((k) => <label key={k} className="wv" style={{ gap: 4, marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>{k}</span><input type="text" inputMode="numeric" className="fee" value={gradeForm[k]} aria-label={`${k} 기준`} placeholder="원" style={{ width: 96 }} onChange={(e) => setGrade({ ...gradeForm, [k]: e.target.value.replace(/[^\d]/g, "") })} /></label>)}</div>
      <div className="wv" style={{ marginTop: 6, marginBottom: 0 }}><button type="button" className="btn sm pri" disabled={pending || !grade} data-act="grade-save" onClick={() => run(() => byGradeAct(d.ym, gradeForm), (r) => `학년별 기준을 적었습니다. ${r.n}학년`)}>저장</button><span className="note" style={{ margin: 0 }}>옛 앱 설정과 같은 자리라 두 곳이 아닙니다</span></div></div>}
    <div className="tblwrap"><table data-g="fee-table"><thead><tr><th><PickAll pick={pk} /></th><th>학생</th><th>반</th><th>금액</th><th>받은 날</th><th></th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.student_id} data-g="fee-row" data-student={r.student_id} data-state={r.state}>
        <td><PickBox pick={pk} id={r.student_id} label={`${r.name} 고르기`} /></td><td className="sch">{r.name}</td>
        <td>{r.classText}{r.special.map((n, i) => <span key={i} className="tag" style={{ marginLeft: 4 }}>{n}회</span>)}{r.source && r.amount === r.suggested && <div className="meta">{r.source}</div>}</td>
        <td><input type="text" inputMode="numeric" className="fee" value={edit[r.student_id] && "amount" in edit[r.student_id] ? edit[r.student_id].amount : (r.amount == null ? "" : Number(r.amount).toLocaleString("ko-KR"))} placeholder="아직 안 적음" aria-label={`${r.name} 금액`} onChange={(e) => setA(r.student_id, e.target.value)} /></td>
        <td><span className="wv" style={{ gap: 4, marginBottom: 0, flexWrap: "nowrap" }}><input type="date" className="dt" value={r.paid_on ?? ""} aria-label={`${r.name} 받은 날`} onChange={(e) => setP(r.student_id, e.target.value)} /><select value={r.method ?? ""} aria-label={`${r.name} 수납 방법`} data-g="method" style={{ width: "auto", flex: "0 0 auto" }} onChange={(e) => setM(r.student_id, e.target.value)}><option value="">방법</option>{METHODS.map((mth) => <option key={mth} value={mth}>{mth}</option>)}</select></span></td>
        <td><span className={"v " + (r.state === "paid" ? "y" : r.state === "unpaid" ? "m" : "n")} data-g="state">{STATE[r.state]}</span></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={6} className="note">이 달 재원생이 없습니다</td></tr>}
    </tbody></table></div>
    <PickBar pick={pk} unit="줄">{/* 고른 줄에 한 번에((어28) · 대전제-20) · ✔ 받음(오늘 · 안 받은 줄만) · 📨 안내 · ⏰ 예약(때 고르기는 발송 10 과 같은 부품) */}
      <button className="btn sm pri" type="button" disabled={pending || !picked.length} data-act="pay-picked" onClick={() => run(() => saveAct(d.ym, payAllEdits(picked, d.date)), (r) => `${r.saved}줄 받음(${md(d.date)}) · 저장했습니다${r.ruled ? ` · 단가 줄 ${r.ruled}(이 달부터)` : ""}`, pk.clear)}>✔ 받음 {picked.length}</button>
      <button type="button" className="btn sm" disabled={pending || !picked.length} data-act="remind-picked" onClick={() => run(() => remindAct(d.ym, pk.ids), (r) => `${r.n}집에 수강료 안내 · ${r.sink === "off" ? "🧪 리허설(off): 발송 이력만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`}`, pk.clear)}>💰 안 받은 집에 안내 {picked.length}</button>
      <button type="button" className="btn sm" disabled={pending || !picked.length} data-act="schedule-picked" onClick={() => run(() => scheduleFeesAct(d.ym, when, customOf(when, cDate, cTime), pk.ids), (r) => `예약했습니다. ${r.n}집 · ${whenLabel(r.at, d.date)}`, pk.clear)}>⏰ 안 받은 집 예약 {picked.length}</button>
      <When rules={d.sendRules} date={d.date} when={when} setWhen={setWhen} cDate={cDate} setCDate={setCDate} cTime={cTime} setCTime={setCTime} />
    </PickBar>
    <div className="savebar" style={{ marginTop: 8 }} data-g="fee-bar">
      <button className="btn pri" type="button" disabled={pending || !rows.some((r) => r.dirty)} data-act="save" onClick={save}>저장</button>
      <span className="pill" data-g="sum">{Number(d.ym.slice(5, 7))}월 합계 <b>{won(t.sum)}</b></span>
      <span className="pill" style={MISS} data-g="unpaid-sum">안 받음 {won(t.unpaid)}</span>
      <span className="spacer" />
      <a className="btn" href={`/api/ops/fee?m=${d.ym}`} data-act="export">⬇ 내려받기</a>
    </div>
  </>;
}
