"use client";
/** 내신 자료 판(목업 04) — 회차 고르기 · 자료 나무(출처 › 갈래 › 항목) · 학생별 표(학교 진도 · 오늘 낼 것 · 남은 것) · ♻️ 같은 범위로 지난번에 만든 것 · 여기서 생긴 할 일 · 저장줄. 세는 것(자료 N · 갈래 N · 항목 N · D-N)은 화면이 센다(대전제-5) — lib/todo-plan 한 벌 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMaterialAct, reuseAct, schoolProgAct, handAct, dropMaterialAct, todoDoneAct, schoolBookAct, itemUnitAct } from "./actions.js";
import { treeOf, materialTags, studentRows, reuseRows, todoLine, ddayText, schoolBooksOf } from "@/lib/todo-plan";
import { examHead, examOn, groupScopes, mdDot } from "@/lib/exam-plan";
import { md } from "@/lib/dash-plan";
const WEAK = { background: "var(--weak-fill)", color: "var(--on-weak)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, e = b.exam, today = d.date;
  const unitOpts = (() => { const seen = new Set(); return (e?.scopes ?? []).filter((s) => s.unit_id && !s.removed_on && !seen.has(s.unit_id) && seen.add(s.unit_id)); })();   // 항목을 이을 범위의 단원(4단계-5)
  const sbk = schoolBooksOf(b.school_books, e, today);   // 처음-8 학교 교과서(학교 × 학년 × 연도)
  const [add, setAdd] = useState(false); const [f, setF] = useState({ typeId: "", title: "", items: "", studentIds: null }); const [prog, setProg] = useState({}); const [revised, setRevised] = useState({});
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const pick = (id) => { window.location.href = `/schedule/exams/prep?e=${id}`; };
  const tree = treeOf(b.materials ?? []), rows = studentRows(b.takers ?? [], b.materials ?? []), reuse = reuseRows(b.reuse ?? []);
  const scopes = e ? groupScopes(e.scopes ?? [], today).filter((g) => g.state !== "del") : [];
  const scopeText = scopes.length ? scopes.map((g) => g.title).join(" · ") : "범위 없음";
  const on = e ? examOn(e) : null;
  const studentIds = f.studentIds ?? (b.takers ?? []).map((t) => t.id);
  const toggleStudent = (id) => setF({ ...f, studentIds: studentIds.includes(id) ? studentIds.filter((x) => x !== id) : [...studentIds, id] });
  const todos = (b.todos ?? []).filter((t) => t.state !== "dropped");
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <select value={e?.id ?? ""} onChange={(x) => x.target.value && pick(x.target.value)} aria-label="회차" data-g="exam-pick" style={{ width: "auto", maxWidth: 360 }}>
        {!e && <option value="">회차 고르기</option>}
        {(b.exams ?? []).map((x) => <option key={x.id} value={x.id}>{x.school ?? "전국"}{x.grade ? ` ${x.grade}학년` : ""} · {x.name} · {md(examOn(x))}{x.hidden ? " · 숨김" : ""} — 대상 {x.takers}명 · 자료 {x.materials}</option>)}
      </select>
      {e && <span className="pill" data-g="exam-on">{e.english_on ? `영어 ${mdDot(e.english_on)}` : e.term_from ? `기간 ${mdDot(e.term_from)}~${mdDot(e.term_to)}` : "날짜 없음"}</span>}
      {e && on && <span className="tag act" data-g="dday">{ddayText(today, on)}</span>}
      {e && <span className="pill" data-g="takers">대상 {(b.takers ?? []).length}명</span>}
      <span className="spacer" />
      {e && <a className="btn sm" href={`/api/prep/xlsx?e=${e.id}`} data-act="export">⬇ 엑셀</a>}
      {e && <button className="btn pri sm" type="button" data-act="add-open" onClick={() => setAdd(true)}>+ 자료</button>}
      <a className="btn sm" href="/schedule/exams">🏫 시험 회차 ↗</a><a className="btn sm" href="/schedule/todo">🗂️ 할 일 ↗</a>
    </div>
    {e && sbk.applicable && <div className="wv" style={{ marginBottom: 8 }} data-g="school-book"><span className="pill" data-g="school-book-text">📚 {sbk.text}</span>
      <select value="" aria-label="학교 교과서 더하기" data-g="school-book-pick" disabled={pending} onChange={(x) => x.target.value && run(() => schoolBookAct({ schoolId: e.school_id, grade: e.grade, year: sbk.year, bookId: x.target.value }), "학교 교과서를 적었습니다 — 학교의 속성이라 그 학교 아이 모두에게")} style={{ width: "auto" }}><option value="">+ 교과서 더하기</option>{(b.books ?? []).filter((bk) => !sbk.rows.some((r) => r.bookId === bk.id)).map((bk) => <option key={bk.id} value={bk.id}>{bk.name}</option>)}</select>
      <span className="note k" style={{ margin: 0 }}>교과서는 학교의 속성(처음-8) — 아이마다 안 적습니다</span></div>}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {!e && <p className="note" data-g="empty">회차를 고르면 그 회차의 자료가 섭니다 — 회차와 범위는 🏫 시험 회차에서.</p>}
    {e && <>
      <div className="mtree" data-g="tree">
        {!tree.groups.length && <p className="note" data-g="no-material">아직 자료가 없습니다 — 「+ 자료」로 갈래(분석지·워크북 …)와 항목을 넣으면 만들기·인쇄·배부 할 일이 저절로 섭니다(영어일에서 거꾸로 {b.rules?.["todo.make_days"] ?? 14}·{b.rules?.["todo.print_days"] ?? 7}·{b.rules?.["todo.hand_days"] ?? 5}일).</p>}
        {tree.groups.map((g) => <div className="mt1" key={g.source} data-g="mt1" data-source={g.source}>
          <div className="mth"><span className="mi">{g.emo}</span><b>{g.source}</b><span className="tag">{scopeText}</span><span className="spacer" /><span className="tag on" data-g="assigned">배정 {g.students}명</span><a className="btn sm" href={`/schedule/todo?m=${g.materials.map((m) => m.id).join(",")}`} data-act="steps-all">단계 ↗</a></div>
          {g.materials.map((m) => { const left = (m.gives ?? []).filter((x) => !x.handed_at).length; return <div className="mt2" key={m.id} data-g="mt2" data-material={m.id} data-state={m.state}>
            <div className="mth2"><b>{m.type}{m.title && m.title !== m.type ? ` · ${m.title}` : ""}</b><span className="spacer" />
              <a className="btn sm" href={`/schedule/todo?m=${m.id}`} data-act="steps">단계 ↗</a>
              {materialTags(m).map((t) => <span key={t} className={"tag" + (t === "아직 안 만듦" ? " act" : t.startsWith("♻️") ? " on" : "")} data-g="mtag">{t}</span>)}
              {["made", "printed"].includes(m.state) && left > 0 && <button className="btn sm pri" type="button" disabled={pending} data-act="hand" onClick={() => run(() => handAct(m.id), (r) => `나눠 줬습니다 — ${r.handed}명${r.left ? ` · 아직 ${r.left}명` : " · 배부 끝"}`)}>📤 배부 {left}명</button>}
              <button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={() => run(() => dropMaterialAct(m.id, "04 에서 뺌"), "뺐습니다(지우지 않았습니다)")}>빼기</button></div>
            <div className="mt3">{(m.items ?? []).map((it) => <span key={it.id} className={"ms" + (m.state === "todo" && !m.reuse_of ? " dim" : "")} data-g="ms" data-unit={it.unit_id ?? ""}>{it.name}{unitOpts.length > 0 && <select value={it.unit_id ?? ""} aria-label={`${it.name} 단원`} data-g="ms-unit" disabled={pending} style={{ width: "auto", marginLeft: 4 }} onChange={(x) => run(() => itemUnitAct(it.id, x.target.value), x.target.value ? "항목을 단원에 이었습니다" : "단원을 뗐습니다")}><option value="">단원 —</option>{unitOpts.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.book} › {u.short}</option>)}</select>}</span>)}{!(m.items ?? []).length && <span className="ms dim">항목 없음</span>}</div>
          </div>; })}
        </div>)}
      </div>
      <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">🧑</span>학생별 — 학교 진도에 맞춰 그때그때</div>
      <div className="tblwrap"><table data-g="students"><thead><tr><th>학생</th><th>학교</th><th>학교 진도 — 어디까지 나갔나</th><th>오늘 낼 것</th><th>남은 것</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id} className={r.known ? "" : "hi"} data-g="student-row" data-student={r.id} data-known={r.known ? "1" : "0"}>
          <td className="sch">{r.name}</td><td>{r.school}</td>
          <td><input type="text" className="sprog" value={prog[r.id] ?? r.prog} placeholder="아직" aria-label={`${r.name} 학교 진도`} onChange={(x) => setProg({ ...prog, [r.id]: x.target.value })} onBlur={(x) => { if (x.target.value !== r.prog) run(() => schoolProgAct(e.id, r.id, x.target.value), `${r.name} — 학교 진도를 적었습니다`, () => setProg((s) => { const n = { ...s }; delete n[r.id]; return n; })); }} /></td>
          <td data-g="today-give">{r.today.length ? r.today.map((t) => <span key={t} className="tag on">{t}</span>) : <span className="mute">—</span>}</td>
          <td data-g="left">{r.known ? <span className="tag">{r.left}</span> : <span className="tag" style={WEAK}>진도를 알아야 냅니다</span>}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan={5} className="note">이 회차를 보는 아이가 없습니다</td></tr>}
      </tbody></table></div>
      <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">♻️</span>같은 범위로 지난번에 만든 것 — <b>있다는 표시만</b></div>
      <div className="reuse" data-g="reuse">
        {!reuse.length && <p className="note" data-g="no-reuse" style={{ margin: 0 }}>{scopes.length ? "같은 범위(교재 단원)로 만든 지난 자료가 없습니다" : "범위가 없어 못 찾습니다 — 🏫 시험 회차에서 범위를 교재 단원으로 고르면 여기 섭니다"}</p>}
        {reuse.map((r) => <div className={"ru1" + (r.already || revised[r.id] ? "" : " hit")} key={r.id} data-g="reuse-row" data-already={r.already ? "1" : "0"}><span className="ri">{r.emo}</span>
          <div><b>{r.title}</b><small>{r.small}</small>
            <div className="tags"><span className={"tag" + (r.already ? "" : revised[r.id] ? " act" : " on")}>{r.already ? r.tag : revised[r.id] ? "개정판 — 체크 안 합니다(확정-㊵)" : r.tag}</span><label className="ckl"><input type="checkbox" className="ck" checked={Boolean(revised[r.id])} onChange={(x) => setRevised({ ...revised, [r.id]: x.target.checked })} disabled={r.already} /> 개정판</label></div></div>
          <div className="rbtn">{!r.already && <button className="btn sm pri" type="button" disabled={pending} data-act="reuse" onClick={() => run(() => reuseAct(e.id, r.id, [], Boolean(revised[r.id])), (x) => x.revised ? `가져왔습니다 — 항목 ${x.items} · 개정판이라 만들기는 체크 안 했습니다` : `가져왔습니다 — 항목 ${x.items} · 만들기는 체크된 채로`)}>가져오기</button>}</div></div>)}
      </div>
      <div className="ctitle" style={{ marginTop: 8 }}><span className="cemo">📋</span>여기서 생긴 할 일 <span className="tag" data-g="todo-count">{todos.filter((t) => t.state !== "done").length}</span></div>
      <div className="left" data-g="todos">
        {!todos.length && <p className="note" style={{ margin: 0 }}>자료를 넣으면 만들기·인쇄·배부가 여기 섭니다</p>}
        {todos.map((t) => { const l = todoLine(t, today); return <div className="lf" key={t.id} data-g="todo-row" data-state={t.state}><span className="ln">{l.done ? "✓" : "·"}</span><div><b>{l.text}</b><small>{l.small}{l.why ? ` · ${l.why}` : ""}</small></div>{!l.done && <button className="btn sm" type="button" disabled={pending} data-act="todo-done" onClick={() => run(() => todoDoneAct(t.id), "끝냈습니다")}>✓ 끝냄</button>}</div>; })}
      </div>
      <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
        <span className="pill" data-g="tree-count">자료 {tree.counts.sources} · 갈래 {tree.counts.materials} · 항목 {tree.counts.items}</span>
        <span className="spacer" />
        <span className="pill">이 표가 그대로 <b>아이 화면의 「받을 학습지」</b>가 됩니다</span>
      </div>
      {add && <div className="mdlov" data-g="add" onClick={(x) => { if (x.target === x.currentTarget) setAdd(false); }}><div className="mdl" style={{ maxWidth: 520 }}>
        <div className="mdlh"><b>+ 자료 — 갈래 하나와 항목</b><span className="spacer" /><button className="btn sm" type="button" onClick={() => setAdd(false)}>닫기</button></div>
        <div className="mdlb">
          <div className="wv"><label className="fl" style={{ margin: 0 }}>자료 종류</label><select value={f.typeId} aria-label="자료 종류" onChange={(x) => setF({ ...f, typeId: x.target.value })} style={{ width: "auto" }}><option value="">고르기</option>{(b.types ?? []).map((t) => <option key={t.id} value={t.id}>{t.source} · {t.name}{t.steps?.includes("print") ? "" : " (인쇄 없음)"}</option>)}</select></div>
          <div className="wv"><label className="fl" style={{ margin: 0 }}>갈래 이름</label><input type="text" value={f.title} placeholder="비면 종류 이름 그대로" aria-label="갈래 이름" onChange={(x) => setF({ ...f, title: x.target.value })} style={{ flex: "1 1 200px" }} /></div>
          <div className="wv"><label className="fl" style={{ margin: 0 }}>항목(쉼표로)</label><textarea value={f.items} placeholder="동사 형 변형, 어순, 접속사, 지시어" aria-label="항목" onChange={(x) => setF({ ...f, items: x.target.value })} style={{ flex: "1 1 260px", minHeight: 60 }} /></div>
          <div className="fl">배정 — 보는 아이</div>
          <div className="tags" data-g="add-students">{(b.takers ?? []).map((t) => <label key={t.id} className="ckl"><input type="checkbox" className="ck" checked={studentIds.includes(t.id)} onChange={() => toggleStudent(t.id)} /> {t.name}</label>)}{!(b.takers ?? []).length && <span className="note" style={{ margin: 0 }}>보는 아이가 없습니다</span>}</div>
          <p className="note k" style={{ margin: "8px 0 0" }}>저장하면 만들기 · 인쇄 · 배부 할 일이 영어 시험일에서 거꾸로 섭니다(종류에 인쇄가 없으면 둘). 이 표가 아이 화면의 「받을 학습지」가 됩니다.</p>
        </div>
        <div className="mdlf"><span className="spacer" /><button className="btn pri" type="button" disabled={pending || !f.typeId} data-act="add-save" onClick={() => run(() => addMaterialAct(e.id, { ...f, studentIds }), (r) => `자료를 세웠습니다 — 항목 ${r.items} · 배정 ${r.students}명 · 할 일 ${r.todos}`, () => { setAdd(false); setF({ typeId: "", title: "", items: "", studentIds: null }); })}>저장</button></div>
      </div></div>}
    </>}
  </>;
}
