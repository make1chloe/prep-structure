"use client";
/** 루틴 판(목업 11) · 학원 기본 루틴(영역 일곱) · 아이마다 고른 것 · 교재는 연결만. 판단은 lib/routine-plan(순수) · 여기는 그린다. 드문 손이라 낙관 갱신 없이 서버 답 뒤에 새로 읽는다 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useGo } from "../../_shell/going.js";   /* 누른 즉시 표시(다) — 이동은 go() · 띠가 켜진다 */
import Sure, { useSure } from "../../_shell/sure.js";   /* 한 번 더 묻기는 화면 안(대전제-10) */
import { usePick, PickAll, PickBox, PickBar } from "../../_shell/pick.js";   /* 고르기 한 벌((어28)-④ · 대전제-20) */
import { addItemAct, editItemAct, retireItemAct, setLineAct, setLineManyAct, moveLineAct, customizeAct, resetAct, reviveAct, setBookAct, nextRoundAct, assignBookAct, bookCustomizeAct, bookResetAct, bookReviveAct, endBookAct } from "./actions.js";
import { AREAS, PLACE, alive, areaStats, studentAreaView, bookView, projectEnd } from "@/lib/routine-plan";
import { icon } from "../../_shell/icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
const Seg = ({ value, onPick, disabled, g }) => <div className="seg sm hs" data-g={g}>{PLACE.map(([k, name]) => <button key={k} type="button" aria-pressed={value === k} disabled={disabled} onClick={() => onPick(k)}>{name}</button>)}</div>;
function ItemForm({ init = {}, onSave, onClose, onRetire = null, pending, areaPick = null }) {
  const [f, setF] = useState({ area: init.area ?? "문법", name: init.name ?? "", method: init.method ?? "", checks: (init.checks ?? []).join(", "), place: init.place ?? "both", required: Boolean(init.required) });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const sure = useSure();
  return (
    <div className="card" style={{ marginTop: 8 }} data-g="item-form">
      <div className="wv">
        {areaPick && <select value={f.area} onChange={up("area")} aria-label="영역" style={{ width: "auto" }}>{AREAS.map(([a, e]) => <option key={a} value={a}>{e} {a}</option>)}</select>}
        <input value={f.name} onChange={up("name")} placeholder="항목 이름 (예: 문답노트)" aria-label="항목 이름" name="name" style={{ flex: "1 1 160px" }} />
        <input value={f.method} onChange={up("method")} placeholder="하는 법 (예: 주요개념 요약하여 문제 만들기)" aria-label="하는 법" name="method" style={{ flex: "2 1 220px" }} />
        <input value={f.checks} onChange={up("checks")} placeholder="체크리스트 · 쉼표로 (예: 입해석, 낭독, 녹음)" aria-label="체크리스트" name="checks" style={{ flex: "1 1 200px" }} />
        {areaPick && <><Seg value={f.place} onPick={(k) => setF({ ...f, place: k })} g="form-place" /><label className="ckl"><input type="checkbox" className="ck" checked={f.required} onChange={up("required")} />필수</label></>}
        <button className="btn pri sm" type="button" disabled={pending} data-act="item-save" onClick={() => onSave(f)}>{init.id ? "저장" : "더하기"}</button>
        <button className="btn sm gho" type="button" onClick={onClose}>닫기</button>
        {init.id && onRetire && <button className="btn sm gho" type="button" disabled={pending} data-act="item-retire" onClick={() => sure.ask("retire")}>항목 삭제</button>}
      </div>
      <Sure on={sure.is("retire")} text={`「${f.name}」 항목을 내립니다. 이 항목을 쓰는 줄이 모든 영역·아이에서 사라집니다(지우지 않습니다 · + 항목에 같은 이름을 넣으면 복구됩니다). 내릴까요?`} yes="삭제" pending={pending} onYes={() => { sure.off(); onRetire(); }} onNo={sure.off} />
    </div>);
}
export default function Board({ d }) {
  const router = useRouter(); const { go } = useGo(); const sure = useSure();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(null);   // 영역 이름 — + 항목 폼이 열린 영역
  const [editing, setEditing] = useState(null); // 항목 id — ✎ 폼
  const [bookPick, setBookPick] = useState(""); const [assignDate, setAssignDate] = useState(d.date);   // 연결 시작일(비면 오늘 · 4단계-5)
  const b = d.board, sid = b.student, student = (b.students ?? []).find((s) => s.id === sid) ?? null;
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); setAdding(null); setEditing(null); if (after) after(r); router.refresh(); });
  const linesOf = (area) => (b.area_lines ?? []).filter((l) => l.area === area);
  const pk = usePick(AREAS.flatMap(([a]) => alive(linesOf(a)).map((l) => l.id)));   /* 학원 기본 줄 고르기((어28)-④ · 대전제-20) · 고른 것은 화면 안에만 */
  const areasWithLines = AREAS.filter(([a]) => alive(linesOf(a)).length > 0).length;
  const totalBooks = Object.values(b.book_counts ?? {}).reduce((n, x) => n + Number(x), 0);
  const myBooks = b.student_books ?? [], myAreas = [...new Set(myBooks.map((x) => x.area).filter(Boolean))];
  return (<>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <PickAll pick={pk} /><span className="pill" style={{ fontWeight: 700 }}>학원 기본 루틴</span>
      <span className="pill" data-g="area-count">영역 {areasWithLines}</span>
      <span className="pill">교재 예외 0</span>
      <span className="spacer" />
      <button className="btn pri sm" type="button" data-act="add-open" onClick={() => setAdding(adding ? null : "문법")}>+ 항목</button>
      
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <PickBar pick={pk} unit="줄">{/* (어28)-④ 고른 줄에 한 번에 · 줄의 필수·🗑 손과 같다(setLine 한 벌 · 삭제는 지우지 않는다) */}
      <button type="button" className="btn sm" disabled={pending} data-act="required-on-picked" onClick={() => run(() => setLineManyAct("area", pk.ids, { required: true }), (r) => `${r.n}줄을 필수로`, () => pk.clear())}>필수 켬 {pk.count}</button>
      <button type="button" className="btn sm" disabled={pending} data-act="required-off-picked" onClick={() => run(() => setLineManyAct("area", pk.ids, { required: false }), (r) => `${r.n}줄의 필수를 껐습니다`, () => pk.clear())}>필수 끔 {pk.count}</button>
      <button type="button" className="btn sm gho" disabled={pending} data-act="retire-picked" onClick={() => run(() => setLineManyAct("area", pk.ids, { state: "retired" }), (r) => `${r.n}줄을 삭제했습니다(「삭제한 것」에서 복구합니다)`, () => pk.clear())}>삭제 {pk.count}</button>
    </PickBar>
    {adding && <ItemForm areaPick init={{ area: adding }} pending={pending} onClose={() => setAdding(null)} onSave={(f) => run(() => addItemAct(f), (r) => (r.revived ? "내렸던 줄을 복구했습니다" : "항목을 더했습니다"))} />}

    <div className="rall" style={{ marginTop: 8 }} data-g="areas">
      {AREAS.map(([area, emo]) => {
        const all = linesOf(area), lines = alive(all).sort((x, y) => x.sort - y.sort), retired = all.filter((l) => l.state === "retired" && (l.item_state ?? "active") === "active"), st = areaStats(all);
        return (
          <div key={area} className="rcol2" data-g="area" data-area={area}>
            <div className="rh2"><span className="rhi">{emo}</span><b>{area}</b><span className="tag">{b.book_counts?.[area] ?? 0}권</span><span className="spacer" /><span className="pill" data-g="area-stats">학원 {st.class} · 숙제 {st.home} · 필수 {st.required}{st.next ? ` · 예습 ${st.next}` : ""}</span></div>
            {area === "단어" && st.class === 0 && <div className="lf ok" data-g="word-note" style={{ marginBottom: 4 }}><span className="ln">🔤</span><div><b>단어는 학원 0줄</b><small>시험은 루틴 밖</small></div><span className="lm">숙제 {st.home}줄{st.next ? ` · 예습 ${st.next}줄` : ""}</span></div>}
            {!lines.length && area !== "단어" && <div className="ritem" data-g="area-empty"><span className="rn2"></span><div style={{ flex: "1 1 170px", minWidth: 0 }}><b style={{ color: "var(--mute)" }}>아직 없음</b></div></div>}
            {lines.map((l, i) => (
              <div key={l.id}>
                <div className="ritem on" data-g="line" data-line={l.id}>
                  <PickBox pick={pk} id={l.id} label={`${l.name} 고르기`} /><span className="rn2">{i + 1}</span>
                  <div style={{ flex: "1 1 170px", minWidth: 0 }}><b>{l.name}</b>{l.method && <small>{l.method}{l.checks?.length ? ` · ${l.checks.join(" · ")}` : ""}</small>}</div>
                  <button type="button" className={"tag" + (l.required ? " on" : "")} disabled={pending} data-act="required" aria-pressed={l.required} onClick={() => run(() => setLineAct("area", l.id, { required: !l.required }))}>필수</button>
                  {i > 0 && <button type="button" className={"tag" + (l.gate_prev ? " on" : "")} disabled={pending} data-act="agate" aria-pressed={Boolean(l.gate_prev)} onClick={() => run(() => setLineAct("area", l.id, { gate_prev: !l.gate_prev }), l.gate_prev ? "잠금을 풀었습니다" : "🔒 앞엣것을 끝내야 열립니다(아이 화면 숙제 줄)")} {...icon("잠금", "앞엣것을 끝내야 열림")}>🔒</button>}
                  <Seg value={l.place} disabled={pending} g="place" onPick={(k) => run(() => setLineAct("area", l.id, { place: k }))} />
                  <span className="ord" style={{ display: "inline-flex", gap: 2 }}>
                    <button className="btn sm gho" type="button" disabled={pending || i === 0} data-act="up" {...icon("위로")} onClick={() => run(() => moveLineAct("area", l.id, "up"))}>▲</button>
                    <button className="btn sm gho" type="button" disabled={pending || i === lines.length - 1} data-act="down" {...icon("아래로")} onClick={() => run(() => moveLineAct("area", l.id, "down"))}>▼</button>
                    <button className="btn sm gho" type="button" disabled={pending} data-act="edit" {...icon("수정")} onClick={() => setEditing(editing === l.id ? null : l.id)}>✎</button>
                    <button className="btn sm gho" type="button" disabled={pending} data-act="retire" {...icon("삭제")} onClick={() => run(() => setLineAct("area", l.id, { state: "retired" }), "삭제했습니다(아래 「삭제한 것」에서 복구합니다)")}>🗑</button>
                  </span>
                </div>
                {editing === l.id && <ItemForm init={{ id: l.item_id, name: l.name, method: l.method ?? "", checks: l.checks ?? [] }} pending={pending} onClose={() => setEditing(null)} onSave={(f) => run(() => editItemAct(l.item_id, f), "고쳤습니다. 이 항목을 쓰는 영역 전부")} onRetire={() => run(() => retireItemAct(l.item_id), (r) => `항목을 내렸습니다. 「${r.name}」을 쓰는 줄이 모든 영역·아이에서 빠집니다(+ 항목에 같은 이름을 넣으면 복구됩니다)`)} />}
              </div>))}
            {retired.length > 0 && <details className="rout" data-g="retired"><summary style={{ cursor: "pointer" }}><b>삭제한 것 {retired.length}</b></summary>
              {retired.map((l) => <span key={l.id} className="wv" style={{ margin: "4px 0 0" }}><span className="tag" style={{ color: "var(--mute)", textDecoration: "line-through" }}>{l.name}</span><button className="btn sm gho" type="button" disabled={pending} data-act="revive" onClick={() => run(() => setLineAct("area", l.id, { state: "active" }), "복구했습니다")}>복구</button></span>)}
            </details>}
            <div className="wv" style={{ marginTop: 6 }}><button className="btn sm" type="button" data-act="add-area" onClick={() => setAdding(adding === area ? null : area)}>+ {area} 항목</button></div>
          </div>);
      })}
    </div>

    <div className="ctitle" style={{ marginTop: 16 }}><span className="cemo">🧑</span>{student ? `${student.name} · 영역별로 고른 것` : "아이가 없습니다"}
      <span className="spacer" />
      <select value={sid ?? ""} aria-label="아이 고르기" data-g="student-pick" style={{ width: "auto" }} onChange={(e) => go(`/settings/routine?s=${e.target.value}`)}>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade ? ` · ${s.grade}` : ""}</option>)}</select></div>
    {student && !myAreas.length && <p className="note">이 아이에게 배정한 교재가 없습니다. 아래 「+ 교재 배정」으로 배정하면 그 영역 루틴이 저절로 붙습니다.</p>}
    <div className="rt2 rall" data-g="student-areas">
      {myAreas.map((area) => {
        const v = studentAreaView(linesOf(area), (b.student_lines ?? []).filter((l) => l.area === area && !l.book_id));
        const books = myBooks.filter((x) => x.area === area).map((x) => x.name).join(" · ");
        return (
          <div key={area} className={"rcol2" + (v.custom ? " pick2" : "")} data-g="student-area" data-area={area} data-custom={v.custom}>
            <div className="rh2"><span className="rhi">{AREAS.find(([a]) => a === area)?.[1]}</span><b>{area}</b><span className="pill">{books}</span><span className="spacer" />
              {v.custom ? <span className="tag act">이 아이만 수정</span> : <span className="tag on">학원 기본 그대로</span>}
              {v.custom ? <button className="btn sm gho" type="button" disabled={pending} data-act="reset" onClick={() => run(() => resetAct(sid, area), "학원 기본으로 돌렸습니다(줄은 내렸을 뿐 지우지 않았습니다)")}>학원 기본으로</button>
                        : <button className="btn sm" type="button" disabled={pending || !v.lines.length} data-act="customize" onClick={() => run(() => customizeAct(sid, area), "이 아이만의 줄을 만들었습니다. 구분·차례·빼기를 따로 정합니다")}>이 아이만 수정</button>}</div>
            {!v.lines.length && <div className="ritem"><span className="rn2"></span><b style={{ color: "var(--mute)" }}>{area} 영역 루틴이 없습니다. 위에서 만드세요</b></div>}
            {v.lines.map((l, i) => (
              <div key={l.id} className="ritem on" data-g="sline">
                <span className="rn2">{i + 1}</span><b style={{ flex: "1 1 120px", minWidth: 0 }}>{l.name}</b>
                {v.custom && <input type="number" min="0" value={l.count_n ?? ""} placeholder="N개" aria-label="갯수" data-g="count" style={{ width: 64 }} onChange={() => {}} onBlur={(e) => { const val = e.target.value; if (String(l.count_n ?? "") !== val) run(() => setLineAct("student", l.id, { count_n: val })); }} />}
                {v.custom && <input value={l.criterion ?? ""} placeholder="기준(비면 검사받으면 끝)" aria-label="통과 기준" data-g="criterion" style={{ width: 150 }} onChange={() => {}} onBlur={(e) => { const val = e.target.value; if (String(l.criterion ?? "") !== val) run(() => setLineAct("student", l.id, { criterion: val })); }} />}
                {v.custom && i > 0 && <button type="button" className={"tag" + (l.gate_prev ? " on" : "")} disabled={pending} data-act="gate" aria-pressed={Boolean(l.gate_prev)} onClick={() => run(() => setLineAct("student", l.id, { gate_prev: !l.gate_prev }), l.gate_prev ? "잠금을 풀었습니다" : "🔒 앞엣것을 끝내야 열립니다(아이 화면 숙제 줄)")} {...icon("잠금", "앞엣것을 끝내야 열림")}>🔒</button>}
                <Seg value={l.place} disabled={pending || !v.custom} g="splace" onPick={(k) => run(() => setLineAct("student", l.id, { place: k }))} />
                {v.custom && <span className="ord" style={{ display: "inline-flex", gap: 2 }}>
                  <button className="btn sm gho" type="button" disabled={pending || i === 0} data-act="sup" {...icon("위로")} onClick={() => run(() => moveLineAct("student", l.id, "up"))}>▲</button>
                  <button className="btn sm gho" type="button" disabled={pending || i === v.lines.length - 1} data-act="sdown" {...icon("아래로")} onClick={() => run(() => moveLineAct("student", l.id, "down"))}>▼</button>
                  <button className="btn sm gho" type="button" disabled={pending} data-act="sretire" {...icon("빼기")} onClick={() => run(() => setLineAct("student", l.id, { state: "retired" }), "뺐습니다. 복구할 수 있습니다")}>🗑</button></span>}
              </div>))}
            {v.custom && v.removed.length > 0 && <div className="rout" data-g="removed"><b>뺐습니다</b>{v.removed.map((r) => <span key={r.id} className="wv" style={{ display: "inline-flex", margin: "0 0 0 6px" }}><span className="tag" style={{ color: "var(--mute)", textDecoration: "line-through" }}>{r.name}</span><button className="btn sm gho" type="button" disabled={pending} data-act="srevive" onClick={() => run(() => reviveAct(sid, area, r.item_id), "복구했습니다")} {...icon("복구", "뺀 항목 복구")}>＋</button></span>)}</div>}
          </div>);
      })}
    </div>

    <div className="ctitle" style={{ marginTop: 16 }}><span className="cemo">📚</span>교재</div>
    <div className="bkset" data-g="books">
      {myBooks.map((x) => {
        const areaLines = alive(linesOf(x.area ?? "")), custom = alive((b.student_lines ?? []).filter((l) => l.area === x.area && !l.book_id)).length > 0;
        const bv = bookView(linesOf(x.area ?? ""), (b.student_lines ?? []).filter((l) => l.area === x.area && !l.book_id), (b.student_lines ?? []).filter((l) => l.book_id === x.book_id));   // 교재 › 아이 영역 › 학원 영역(4단계-5)
        const pj = projectEnd({ remaining: Number(x.remaining ?? 0), perSession: Number(x.per_session ?? 1), days: b.days ?? [], from: d.date });
        const ut = x.unit_test ?? "off";
        return (
          <div key={x.id} id={`book-${x.book_id}`} className="bs" data-g="book" data-book={x.book_id}>
            <div className="bsh"><span className="tag mono">{x.code ?? ""}</span><b>{x.name}</b><span className="tag type">{x.area}</span><span className="spacer" />
              {!areaLines.length && !custom ? <span className="tag" style={{ background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" }} data-g="book-gap">{x.area} 루틴이 없습니다. 위에서 만드세요</span>
                : bv.custom ? <span className="tag act" data-g="book-routine">이 교재만 고친 루틴</span> : custom ? <span className="tag act">이 아이만 고친 {x.area} 루틴</span> : <span className="tag on">{x.area} 루틴을 씁니다</span>}
              {bv.custom ? <button className="btn sm gho" type="button" disabled={pending} data-act="book-reset" onClick={() => run(() => bookResetAct(sid, x.book_id), "영역 루틴으로 돌렸습니다(교재 줄은 내렸을 뿐 지우지 않았습니다)")}>영역 루틴으로</button>
                         : <button className="btn sm" type="button" disabled={pending || !bv.lines.length} data-act="book-customize" onClick={() => run(() => bookCustomizeAct(sid, x.book_id), "이 교재만의 줄을 만들었습니다. 구분·차례·🔒·빼기를 따로 정합니다")}>이 교재만 다르게</button>}
              <button className="btn sm gho" type="button" disabled={pending} data-act="book-end" onClick={() => sure.ask("end:" + x.id)}>끝내기</button></div>
              <Sure on={sure.is("end:" + x.id)} text={`${x.name} · 오늘부터 안 씁니다(줄은 남습니다). 끝낼까요?`} yes="끝내기" pending={pending} onYes={() => { sure.off(); run(() => endBookAct(x.id), (r) => `끝냈습니다. ${r.to}까지 쓴 것으로(줄은 남습니다)`); }} onNo={sure.off} />
            {bv.custom && <div className="bsr" style={{ flexDirection: "column", alignItems: "stretch" }} data-g="book-lines">
              {bv.lines.map((l, i) => (
                <div key={l.id} className="ritem on" data-g="bline">
                  <span className="rn2">{i + 1}</span><b style={{ flex: "1 1 120px", minWidth: 0 }}>{l.name}</b>
                  <input type="number" min="0" value={l.count_n ?? ""} placeholder="N개" aria-label="갯수" data-g="bcount" style={{ width: 64 }} onChange={() => {}} onBlur={(e) => { const val = e.target.value; if (String(l.count_n ?? "") !== val) run(() => setLineAct("student", l.id, { count_n: val })); }} />
                  {i > 0 && <button type="button" className={"tag" + (l.gate_prev ? " on" : "")} disabled={pending} data-act="bgate" aria-pressed={Boolean(l.gate_prev)} onClick={() => run(() => setLineAct("student", l.id, { gate_prev: !l.gate_prev }), l.gate_prev ? "잠금을 풀었습니다" : "🔒 앞엣것을 끝내야 열립니다(아이 화면 숙제 줄)")} {...icon("잠금", "앞엣것을 끝내야 열림")}>🔒</button>}
                  <Seg value={l.place} disabled={pending} g="bplace" onPick={(k) => run(() => setLineAct("student", l.id, { place: k }))} />
                  <span className="ord" style={{ display: "inline-flex", gap: 2 }}>
                    <button className="btn sm gho" type="button" disabled={pending || i === 0} data-act="bup" {...icon("위로")} onClick={() => run(() => moveLineAct("student", l.id, "up"))}>▲</button>
                    <button className="btn sm gho" type="button" disabled={pending || i === bv.lines.length - 1} data-act="bdown" {...icon("아래로")} onClick={() => run(() => moveLineAct("student", l.id, "down"))}>▼</button>
                    <button className="btn sm gho" type="button" disabled={pending} data-act="bretire" {...icon("빼기")} onClick={() => run(() => setLineAct("student", l.id, { state: "retired" }), "뺐습니다. 복구할 수 있습니다")}>🗑</button></span>
                </div>))}
              {bv.removed.length > 0 && <div className="rout" data-g="bremoved"><b>뺐습니다</b>{bv.removed.map((r) => <span key={r.id} className="wv" style={{ display: "inline-flex", margin: "0 0 0 6px" }}><span className="tag" style={{ color: "var(--mute)", textDecoration: "line-through" }}>{r.name}</span><button className="btn sm gho" type="button" disabled={pending} data-act="brevive" onClick={() => run(() => bookReviveAct(sid, x.area, r.item_id, x.book_id), "복구했습니다")} {...icon("복구", "뺀 항목 복구")}>＋</button></span>)}</div>}
            </div>}
            <div className="bsr"><span className="fl">기준</span>
              <div className="seg sm" data-g="basis">{[["chapter", "대단원"], ["sub", "소단원"]].map(([k, name]) => <button key={k} type="button" aria-pressed={x.order_basis === k} disabled={pending} onClick={() => run(() => setBookAct(x.id, { order_basis: k }))}>{name}</button>)}</div>
              <span className="fl" style={{ width: "auto", margin: "0 0 0 8px" }}>한 번에</span>
              <div className="stepper" data-g="pace"><button type="button" data-s="-" disabled={pending || x.per_session <= 1} onClick={() => run(() => setBookAct(x.id, { per_session: x.per_session - 1 }))} {...icon("줄이기", "한 번에 나갈 소단원 줄이기")}>−</button><input type="text" inputMode="numeric" value={x.per_session} aria-label="한 번에 나가는 소단원 수" readOnly /><button type="button" data-s="+" disabled={pending || x.per_session >= 6} onClick={() => run(() => setBookAct(x.id, { per_session: x.per_session + 1 }))} {...icon("늘리기", "한 번에 나갈 소단원 늘리기")}>+</button></div>
              <span className="spacer" />
              <div className="endd" data-g="endd"><small>이대로면</small><b>{pj.sessions === 0 ? "다 했습니다" : pj.endDate ?? "수업일이 모자랍니다"}</b><span>남은 소단원 {x.remaining}/{x.total} · 수업 {pj.sessions}회{pj.months != null ? ` · ${pj.months}개월` : ""}</span></div></div>
            <div className="bsr"><label className="ckl"><input type="checkbox" className="ck" checked={ut !== "off"} disabled={pending} data-g="ut" onChange={(e) => run(() => setBookAct(x.id, { unit_test: e.target.checked ? "per_chapter" : "off" }))} />단원평가 본다</label>
              {ut !== "off" && <div className="seg sm" data-g="ut-seg">{[["per_chapter", null, "대단원마다"], ["per_n_sub", 5, "소단원 5개마다"], ["per_n_sub", 10, "소단원 10개마다"]].map(([k, n, name]) => <button key={name} type="button" aria-pressed={ut === k && (n == null || Number(x.unit_test_n) === n)} disabled={pending} onClick={() => run(() => setBookAct(x.id, { unit_test: k, unit_test_n: n }))}>{name}</button>)}</div>}
              <span className="spacer" /><button type="button" className="btn sm" data-act="next-round" disabled={pending} onClick={() => run(() => nextRoundAct(x.id))}>다음 회독</button><span className="note" style={{ margin: 0 }} data-g="book-span">{x.round}회독 · {x.from_date}부터{x.to_date ? ` · ${x.to_date}까지` : ""}{x.stop_mode !== "running" ? ` · ${x.stop_mode === "hw_off" ? "숙제 보류" : "교재 보류"}` : ""}</span></div>
          </div>);
      })}
      {student && <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }} data-g="assign">
        <select value={bookPick} aria-label="이을 교재" data-g="book-pick" style={{ width: "auto" }} onChange={(e) => setBookPick(e.target.value)}><option value="">이을 교재 고르기</option>{(b.books_free ?? []).map((x) => <option key={x.id} value={x.id}>{x.area ?? ""} · {x.name}{x.code ? ` (${x.code})` : ""}</option>)}</select>
        <input type="date" className="dt" value={assignDate} aria-label="이 날부터" style={{ width: "auto" }} onChange={(e) => setAssignDate(e.target.value)} />
        <button className="btn pri sm" type="button" disabled={pending || !bookPick || !assignDate} data-act="assign" onClick={() => run(() => assignBookAct(sid, bookPick, assignDate), `이었습니다. ${assignDate}부터 · 그 교재의 영역 루틴이 저절로 붙습니다`)}>+ 교재 배정</button>
        </div>}
    </div>
    <div className="savebar" style={{ marginTop: 12 }}><span className="pill">루틴 <b>{areasWithLines}벌</b> · 교재 예외 <b>0</b></span></div>
  </>);
}
