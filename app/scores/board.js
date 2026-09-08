"use client";
/** 성적 판(목업 16) — 회차 고르기 · 등급컷 · 문항표 · 표(학생 · 원점수 · 등급(세어 나옴) · 틀린 문항 · 낸 때 · 공개 · 확인/대신 넣기) · 틀린 문항 판(눌러도 되고 적어도 된다 — 같은 값) · 영역 셈 · 저장줄. 세는 것은 화면이 센다(원칙-5) — lib/score-plan 한 벌 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGo } from "../_shell/going.js";   /* 누른 즉시 표시(다) — 이동은 go() · 띠가 켜진다 */
import { cutsAct, questionsAct, questionsSheetAct, saveAct, confirmAct, confirmAllAct, showAct, importAct, remindAct, unconfirmAct } from "./actions.js";
import { counts, cutsText, questionsText, questionsFor, questionsFrom, parseWrong, wrongSummary, summaryText, gradeByCuts, gradeText, cutsFor, SHOW, showText, examShort } from "@/lib/score-plan";
import { mdDot } from "@/lib/exam-plan";
import { md, seoulDate } from "@/lib/dash-plan";
import { seoulTime } from "@/lib/day-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, e = b.exam, rows = d.rows, c = counts(rows);
  const [cuts, setCutsT] = useState(""); const [qtext, setQ] = useState(""); const [edit, setEdit] = useState({}); const [open, setOpen] = useState(null);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const { go } = useGo(); const pick = (id) => { go(`/scores?e=${id}`); };
  const val = (r, k, fallback) => (edit[r.student_id] && k in edit[r.student_id] ? edit[r.student_id][k] : fallback);
  const setV = (r, k, v) => setEdit({ ...edit, [r.student_id]: { ...(edit[r.student_id] ?? {}), [k]: v } });
  const nQ = Math.max(e?.questions?.length ?? 0, 20, ...rows.flatMap((r) => r.wrongs));
  const save = (r) => run(() => saveAct(e.id, r.student_id, { raw: val(r, "raw", r.raw ?? ""), full: val(r, "full", r.full ?? 100), wrongs: val(r, "wrongs", r.wrongs.join(",")), ...(e.scope === "national" ? { percentile: val(r, "percentile", r.score?.percentile ?? "") } : {}) }), (x) => `${r.name} — 넣었습니다(틀린 문항 ${x.wrongs})`, () => setEdit((s) => { const n = { ...s }; delete n[r.student_id]; return n; }));
  const openRow = rows.find((r) => r.student_id === open) ?? null;
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <select value={e?.id ?? ""} onChange={(x) => x.target.value && pick(x.target.value)} aria-label="회차" data-g="exam-pick" style={{ width: "auto", maxWidth: 360 }}>
        {!e && <option value="">회차 고르기</option>}
        {(b.exams ?? []).map((x) => <option key={x.id} value={x.id}>{x.school ?? "전국"}{x.grade ? ` ${x.grade}학년` : ""} · {x.name} · {md(x.on)}{x.hidden ? " · 숨김" : ""} — 낸 {x.scores}/{x.takers}{x.unconfirmed ? ` · 확인 안 함 ${x.unconfirmed}` : ""}</option>)}
      </select>
      {e && <span className="pill" data-g="on">{e.english_on ? `영어 ${mdDot(e.english_on)}` : `기간 ${mdDot(e.term_from)}~${mdDot(e.term_to)}`}</span>}
      <span className={"pill" + (c.unconfirmed ? " warn" : "")} data-g="unconfirmed">확인 안 한 것 {c.unconfirmed}</span>
      <span className={"pill" + (c.missing ? " warn" : "")} data-g="missing">안 낸 아이 {c.missing}</span>
      <span className="spacer" />
      {e && <form action={(fd) => run(() => importAct(e.id, fd), (r) => `올렸습니다 — ${r.put}줄(바로 확인됨)${r.unmatched.length ? ` · 못 맞춘 이름: ${r.unmatched.join(", ")}` : ""}${r.dup.length ? ` · 같은 이름 둘: ${r.dup.join(", ")}` : ""}`)} className="wv" style={{ gap: 4 }} data-g="import">
        <input type="file" name="file" accept=".xlsx,.xls,.csv" aria-label="성적 엑셀" style={{ width: "auto" }} /><button className="btn sm" type="submit" disabled={pending} data-act="import">⬆ 엑셀로 한꺼번에</button></form>}
      {e && <a className="btn sm" href={`/api/scores/xlsx?e=${e.id}`} data-act="scores-export" title="올리기와 같은 열 · 보는 아이 이름이 채워져 나옵니다">⬇ 성적 양식</a>}
      <Link prefetch={false} className="btn sm" href="/schedule/exams">🏫 시험 회차 ↗</Link>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {!e && <p className="note" data-g="empty">본 회차가 없습니다 — 🏫 시험 회차에서 회차와 영어 시험일을 넣으면 여기 섭니다.</p>}
    {e && <>
      <div className="lf ok" style={{ margin: "0 0 8px" }} data-g="cuts"><span className="ln">컷</span>
        <div><b>이 회차 등급컷 — 한 번 적으면 등급은 세어 나옵니다</b><small data-g="cuts-text">{cutsText(e) || "아직 없음"}{!e.cuts?.length && e.level === "middle" ? " — 중학교 절대평가(90·80·70·60)로 셉니다" : ""}{e.scope === "national" ? " · 모의고사는 전국 등급이 옵니다(컷 없음)" : ""}</small></div>
        <input value={cuts} onChange={(x) => setCutsT(x.target.value)} placeholder={e.cuts?.length ? e.cuts.join(", ") : "90, 84, 77"} aria-label="등급컷" style={{ width: 160 }} />
        <button className="btn sm pri" type="button" disabled={pending || !cuts.trim()} data-act="cuts-save" onClick={() => run(() => cutsAct(e.id, cuts), (r) => `등급컷 ${r.cuts.join(" · ")} — 등급을 다시 셉니다`, () => setCutsT(""))}>저장</button></div>
      <div className="lf" style={{ margin: "0 0 8px" }} data-g="questions" data-from={questionsFrom(e)}><span className="ln">표</span>
        <div><b>시험지 문항표 — 번호마다 영역</b><small data-g="questions-text">{questionsFrom(e) === "exam" ? questionsText(e.questions) : questionsFrom(e) === "standard" ? `표준 문항표로 셉니다 — ${questionsText(questionsFor(e))}(옛 앱 그대로 · 이번 회차가 다르면 엑셀로 올리세요)` : "아직 없음 — 틀린 번호의 영역을 못 셉니다(엑셀로 올리거나 글로 적으세요)"}</small></div>
        <input value={qtext} onChange={(x) => setQ(x.target.value)} placeholder="1-5 듣기, 6-20 독해, 21-25 어법, 26-28 서술형" aria-label="문항표" style={{ flex: "1 1 260px" }} />
        <button className="btn sm pri" type="button" disabled={pending || !qtext.trim()} data-act="questions-save" onClick={() => run(() => questionsAct(e.id, qtext), (r) => `문항표 ${r.saved}문항`, () => setQ(""))}>저장</button>
        <form action={(fd) => run(() => questionsSheetAct(e.id, fd), (r) => `문항표 ${r.saved}문항(엑셀)${r.bad?.length ? ` · 고칠 줄 ${r.bad.length}: ${r.bad.slice(0, 3).map((x) => `${x.line}행 ${x.why}`).join(" / ")}` : ""}`)} className="wv" style={{ gap: 4 }} data-g="questions-import">
          <input type="file" name="file" accept=".xlsx,.xls,.csv" aria-label="문항표 엑셀" style={{ width: "auto" }} /><button className="btn sm" type="submit" disabled={pending} data-act="questions-import">⬆ 엑셀</button></form>
        <a className="btn sm" href={`/api/scores/xlsx?e=${e.id}&q=1`} data-act="questions-export" title="번호 · 영역 두 열 — 고쳐서 다시 올리면 됩니다">⬇ 문항표</a></div>
      <div className="tblwrap"><table data-g="score-table"><thead><tr><th>학생</th><th>원점수</th><th>등급(세어 나옴)</th><th>틀린 문항</th><th>낸 때</th><th>공개</th><th></th></tr></thead><tbody>
        {rows.map((r) => { const raw = val(r, "raw", r.raw ?? ""), g = gradeByCuts(raw, cutsFor(e)), dirty = Boolean(edit[r.student_id]); return <tr key={r.student_id} className={r.state === "pending" ? "hi" : ""} data-g="score-row" data-student={r.student_id} data-state={r.state}>
          <td className="sch">{r.name}</td>
          <td><input type="text" inputMode="numeric" className={"scr" + (raw !== "" && Number(raw) < 60 ? " warnin" : "")} value={raw} placeholder="—" aria-label={`${r.name} 원점수`} onChange={(x) => setV(r, "raw", x.target.value)} disabled={r.state === "confirmed"} /></td>
          <td data-g="grade">{r.score?.grade != null ? `${gradeText(e.level, r.score.grade)} (학교)` : gradeText(e.level, g) || "—"}{e.scope === "national" && <span className="wv" style={{ gap: 4, marginTop: 4, marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>백분위</span><input type="text" inputMode="numeric" className="scr" value={val(r, "percentile", r.score?.percentile ?? "")} aria-label={`${r.name} 백분위`} placeholder="—" style={{ width: 52 }} disabled={r.state === "confirmed"} onChange={(x) => setV(r, "percentile", x.target.value.replace(/\D/g, ""))} /></span>}</td>
          <td>{r.state === "none" && !dirty ? <span className="note" style={{ margin: 0 }}>—</span> : <button className="lnk" type="button" data-act="wrong-open" aria-pressed={open === r.student_id} onClick={() => setOpen(open === r.student_id ? null : r.student_id)}>{parseWrong(val(r, "wrongs", r.wrongs.join(","))).join(",") || "번호 안 넣음"}</button>}</td>
          <td data-g="at">{r.at ? `${md(seoulDate(r.at))} ${seoulTime(r.at)}${r.byWho === "student" ? " · 아이가 넣음" : ""}` : <span className="note" style={{ margin: 0 }}>아직 안 냄</span>}</td>
          <td data-g="show">{r.state === "confirmed" ? <select value={r.score.show_to} aria-label={`${r.name} 공개`} onChange={(x) => run(() => showAct(r.score.id, x.target.value), `${r.name} — ${showText(x.target.value)}`)} style={{ width: "auto" }}>{SHOW.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select> : "—"}</td>
          <td>{r.state === "confirmed" ? <span className="wv" style={{ gap: 4, marginBottom: 0 }}><span className="v y" data-g="state">확인됨</span><button className="btn sm gho" type="button" disabled={pending} data-act="unconfirm" title="확인을 풀고 고친다 — 공개는 원장만으로 돌아갑니다" onClick={() => run(() => unconfirmAct(r.score.id), `${r.name} — 확인을 풀었습니다 · 고친 뒤 다시 확인하세요`)}>풀기</button></span>
              : dirty ? <button className="btn pri sm" type="button" disabled={pending} data-act="save" onClick={() => save(r)}>{r.state === "none" ? "대신 넣기" : "고쳐 저장"}</button>
              : r.state === "pending" ? <button className="btn pri sm" type="button" disabled={pending} data-act="confirm" onClick={() => run(() => confirmAct(r.score.id), (x) => `${r.name} — 확인했습니다 · 공개 ${showText(x.show)}`)}>확인</button>
              : <button className="btn sm" type="button" disabled={pending} data-act="save" onClick={() => save(r)}>대신 넣기</button>}</td>
        </tr>; })}
        {!rows.length && <tr><td colSpan={7} className="note">이 회차를 보는 아이가 없습니다</td></tr>}
      </tbody></table></div>
      {openRow && (() => { const cur = parseWrong(val(openRow, "wrongs", openRow.wrongs.join(","))), sum = wrongSummary(cur, e.questions ?? []); const toggle = (q) => setV(openRow, "wrongs", (cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]).sort((a, b) => a - b).join(","));
        return <div className="qw" data-g="wrong-panel"><div className="ctitle"><span className="cemo">❌</span>{openRow.name}{openRow.byWho === "student" ? "가 표시한" : "의"} 틀린 문항 <span className={"tag" + (openRow.byWho === "student" ? " act" : "")}>{openRow.byWho === "student" ? "아이가 넣은 것" : "원장님이 넣은 것"}</span></div>
          <div className="qgrid">{Array.from({ length: nQ }, (_, i) => i + 1).map((q) => <button key={q} type="button" className={"q" + (cur.includes(q) ? " x" : "")} data-q={q} disabled={openRow.state === "confirmed"} onClick={() => toggle(q)} style={{ cursor: "pointer" }}>{q}</button>)}</div>
          <div className="wv" style={{ marginTop: 8 }}><span className="fl" style={{ margin: 0 }}>번호로</span><input type="text" value={val(openRow, "wrongs", openRow.wrongs.join(","))} onChange={(x) => setV(openRow, "wrongs", x.target.value)} aria-label="틀린 번호" disabled={openRow.state === "confirmed"} style={{ flex: "1 1 200px" }} /><span className="note k" style={{ margin: 0 }}>눌러도 되고 적어도 됩니다 — 같은 값입니다</span></div>
          <div className="qsum" data-g="qsum">{sum.map((s) => <span key={s.kind} className="qs"><i className={"qd" + (s.n >= 2 ? " miss" : "")} />{s.kind} <b>{s.n}</b></span>)}{!sum.length && <span className="note" style={{ margin: 0 }}>틀린 번호가 없습니다</span>}</div>
          {openRow.state !== "confirmed" && <div className="wv" style={{ marginTop: 8 }}><button className="btn pri sm" type="button" disabled={pending} data-act="wrong-save" onClick={() => save(openRow)}>저장</button><button className="btn sm" type="button" onClick={() => setOpen(null)}>닫기</button></div>}
        </div>; })()}
      <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
        <button className="btn pri" type="button" disabled={pending || !c.unconfirmed} data-act="confirm-all" onClick={() => run(() => confirmAllAct(e.id), (r) => `${r.n}명 확인했습니다 — 성적이 굳고 공개 기본값이 붙었습니다`)}>모두 확인</button>
        <span className="pill">확인해야 성적이 굳고 공개를 켤 수 있습니다</span>
        <span className="spacer" />
        <span className="pill" style={c.missing ? MISS : undefined} data-g="missing-sum">안 낸 아이 {c.missing}명</span>
        {c.missing > 0 && <button type="button" className="btn sm" disabled={pending} data-act="remind-scores" onClick={() => run(() => remindAct(e.id), (r) => `${r.n}명에게 재촉 — ${r.sink === "off" ? "🧪 리허설(off): 자취만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`}`)}>📨 안 낸 아이 재촉</button>}
      </div>
    </>}
  </>;
}
