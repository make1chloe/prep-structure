"use client";
/** 수강료 판(목업 13) — 학생 · 반 · 금액 · 받은 날 · 상태. 저장은 바뀐 줄만 · 합계는 화면이 센다(대전제-5) · 엑셀로 내보내기 · 결제선생 엑셀 올리기 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAct, importAct } from "./actions.js";
import { won, parseWon, totals, STATE } from "@/lib/fee-plan";
import { monthLabel, nextYm } from "@/lib/schedule-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Fee({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState({});   // student_id → { amount, paid_on }
  const rows = d.rows.map((r) => { const e = edit[r.student_id]; if (!e) return r; const amount = "amount" in e ? parseWon(e.amount) : r.amount; const paid_on = "paid_on" in e ? (e.paid_on || null) : r.paid_on; return { ...r, amount, paid_on, state: amount == null ? "none" : paid_on ? "paid" : "unpaid", dirty: true }; });
  const t = totals(rows);
  const run = (fn, okMsg) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(okMsg(r)); setEdit({}); router.refresh(); });
  const save = () => run(() => saveAct(d.ym, rows.filter((r) => r.dirty).map((r) => ({ student_id: r.student_id, amount: r.amount, paid_on: r.paid_on }))), (r) => `저장했습니다 — ${r.saved}줄${r.ruled ? ` · 단가 줄 ${r.ruled}(이 달부터)` : ""}`);
  const setA = (id, v) => setEdit({ ...edit, [id]: { ...(edit[id] ?? {}), amount: v } }), setP = (id, v) => setEdit({ ...edit, [id]: { ...(edit[id] ?? {}), paid_on: v } });
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <a className="btn sm" href={`/ops?m=${nextYm(d.ym, -1)}`} aria-label="지난 달">◂</a><b style={{ fontSize: "var(--fs-5)" }} data-g="month">{monthLabel(d.ym)}</b><a className="btn sm" href={`/ops?m=${nextYm(d.ym, 1)}`} aria-label="다음 달">▸</a>
      <span className={"pill" + (t.unpaidCount ? " warn" : "")} data-g="unpaid-count">안 받음 {t.unpaidCount}</span>
      {t.noneCount > 0 && <span className="pill" data-g="none-count">금액 없음 {t.noneCount}</span>}
      <span className="spacer" />
      <form action={(fd) => run(() => importAct(d.ym, fd), (r) => `올렸습니다 — ${r.put}줄${r.skipped ? ` · 건너뜀 ${r.skipped}` : ""}${r.unmatched.length ? ` · 못 맞춘 이름: ${r.unmatched.join(", ")}` : ""}${r.dup.length ? ` · 같은 이름 둘: ${r.dup.join(", ")}` : ""}`)} className="wv" style={{ gap: 4 }} data-g="import">
        <input type="file" name="file" accept=".xlsx,.xls,.csv" aria-label="결제선생 엑셀" style={{ width: "auto" }} /><button className="btn sm" type="submit" disabled={pending} data-act="import">📄 결제선생 엑셀 올리기</button></form>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="tblwrap"><table data-g="fee-table"><thead><tr><th>학생</th><th>반</th><th>금액</th><th>받은 날</th><th></th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.student_id} data-g="fee-row" data-student={r.student_id} data-state={r.state}>
        <td className="sch">{r.name}</td>
        <td>{r.classText}{r.special.map((n, i) => <span key={i} className="tag" style={{ marginLeft: 4 }}>{n}회</span>)}{r.source && r.amount === r.suggested && <div className="meta">{r.source}</div>}</td>
        <td><input type="text" inputMode="numeric" className="fee" value={edit[r.student_id] && "amount" in edit[r.student_id] ? edit[r.student_id].amount : (r.amount == null ? "" : Number(r.amount).toLocaleString("ko-KR"))} placeholder="아직 안 적음" aria-label={`${r.name} 금액`} onChange={(e) => setA(r.student_id, e.target.value)} /></td>
        <td><input type="date" className="dt" value={r.paid_on ?? ""} aria-label={`${r.name} 받은 날`} onChange={(e) => setP(r.student_id, e.target.value)} /></td>
        <td><span className={"v " + (r.state === "paid" ? "y" : r.state === "unpaid" ? "m" : "n")} data-g="state">{STATE[r.state]}</span></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={5} className="note">이 달 재원생이 없습니다</td></tr>}
    </tbody></table></div>
    <div className="savebar" style={{ marginTop: 8 }} data-g="fee-bar">
      <button className="btn pri" type="button" disabled={pending || !rows.some((r) => r.dirty)} data-act="save" onClick={save}>저장</button>
      <span className="pill" data-g="sum">{Number(d.ym.slice(5, 7))}월 합계 <b>{won(t.sum)}</b></span>
      <span className="pill" style={MISS} data-g="unpaid-sum">안 받음 {won(t.unpaid)}</span>
      <span className="spacer" />
      <a className="btn" href={`/api/ops/fee?m=${d.ym}`} data-act="export">엑셀로</a>
    </div>
  </>;
}
