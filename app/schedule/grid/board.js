"use client";
/** 학교별 표 판(목업 06c) — 머리(내 표/전체 표 · + 새 표) · 따로 챙길 아이들 띠 · 표 알약(shtabs) · 고른 표: 이름 · 표 삭제(내림) · 칸으로 이동 · 보기 둘(⊞표 · ▦보드 — 조회 0) · 표(머리칸 ⠿·◀▶✕·종류 ⌄ · 줄 ⠿·▣·✕ · 셀 종류대로 · + 칸 · + 줄) · 보드(선택 칸으로 묶기 · 카드 ◀ ▶) · 저장줄.
 *  값의 뜻·셈은 lib/grid-plan 한 벌. 셀은 손을 떼면 저장(저장 단추 없음) */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gridAddAct, gridRetireAct, gridReviveAct, gridRenameAct, gridMoveAct, colAddAct, colSetAct, colMoveAct, colRetireAct, boardColAct, rowAddAct, rowMoveAct, rowRetireAct, cellAct, watchAct, unitsAct, unitsAllAct } from "./actions.js";
import { TEMPLATES, COL_TYPES, PICK_OF, typeName, pickName, parseCol, cellText, toggleItem, addItem, removeItem, checkText, rowTitle, rowSub, alive, liveOf, counts, jumpTargets, jumpStep, unitGroups, unitPick, focusRows, boardOf, nextOption, cardTitle, watchSummary, visibleGrids } from "@/lib/grid-plan";
function Cell({ r, col, ctx }) {
  const { pending, save, val, setV, edit, setEdit, chk, setChk, chkNew, setChkNew, units, loadUnits, refs } = ctx;
    const v = val(r, col);
    if (col.type === "text") return <input type="text" value={v ?? ""} placeholder="—" aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => setV(r, col, x.target.value)} onBlur={(x) => { if ((x.target.value || null) !== (r.cells?.[col.id] ?? null)) save(r, col, x.target.value); }} />;
    if (col.type === "date") return <input type="date" className="dt" value={v ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value)} style={{ width: "auto" }} />;
    if (col.type === "select") return <select value={v ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value)} style={{ width: "auto" }}><option value="">—</option>{(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    if (col.type === "yn") return <div className="seg sm" data-g="yn">{[[true, "예"], [false, "아니오"], [null, "—"]].map(([k, nm]) => <button key={String(k)} type="button" aria-pressed={v === k} disabled={pending} onClick={() => v !== k && save(r, col, k)}>{nm}</button>)}</div>;
    if (col.type === "checklist") { const key = `${r.id}|${col.id}`, list = Array.isArray(v) ? v : []; return <>
      <button type="button" className="cellp" data-g="chk-open" aria-pressed={chk === key} onClick={() => setChk(chk === key ? null : key)}>{list.length ? `${checkText(list)} · ${list.map((x) => `${x.done ? "☑" : "☐"} ${x.name}`).join(" ")}` : "+"}</button>
      {chk === key && <div className="task" data-g="chk" style={{ marginTop: 4, padding: 8 }}>
        {list.map((x, i) => <div key={i} className="wv" style={{ gap: 4, marginBottom: 0 }} data-g="chk-item"><label className="ckl" style={{ display: "flex" }}><input type="checkbox" className="ck" checked={x.done} disabled={pending} onChange={() => save(r, col, toggleItem(list, i), `${x.name} — ${x.done ? "풀었습니다" : "✓"}`)} /> {x.name}</label><button type="button" className="btn sm gho" disabled={pending} aria-label={`${x.name} 빼기`} data-act="chk-remove" onClick={() => save(r, col, removeItem(list, i), `${x.name} — 뺐습니다`)}>✕</button></div>)}
        <div className="wv" style={{ marginTop: 4 }}><input type="text" value={chkNew} placeholder="항목 더하기" aria-label="항목 더하기" onChange={(x) => setChkNew(x.target.value)} style={{ flex: "1 1 120px" }} /><button className="btn sm" type="button" disabled={pending || !chkNew.trim()} data-act="chk-add" onClick={() => save(r, col, addItem(list, chkNew), `${chkNew} — 더했습니다`, () => setChkNew(""))}>더하기</button></div>
      </div>}
    </>; }
    if (col.type === "pick") { const of = col.options?.of ?? "book"; const cur = v ?? {};
      if (of === "book") return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value ? { id: x.target.value } : null)} style={{ width: "auto" }}><option value="">교재 고르기</option>{refs.books.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
      if (of === "exam") return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value ? { id: x.target.value } : null)} style={{ width: "auto" }}><option value="">회차 고르기</option>{refs.exams.map((x) => <option key={x.id} value={x.id}>{x.school ?? "전국"} {x.name}</option>)}</select>;
      // 단원 — 교재 → 단원 두 단이 아니라 한 고르개((가)-⑤): 교재마다 묶은 목록(단원 전부는 이 칸이 보일 때 한 번 읽는다) · 교재는 단원에서 나온다
      const groups = unitGroups(refs.books, refs.units);
      return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} disabled={!units.all} onChange={(x) => save(r, col, unitPick(refs.units, x.target.value))} style={{ width: "auto", maxWidth: 220 }}><option value="">{units.all ? (groups.length ? "단원 고르기" : "단원이 없습니다") : "단원 읽는 중"}</option>{groups.map((gp) => <optgroup key={gp.book.id} label={gp.book.name}>{gp.units.map((u) => <option key={u.id} value={u.id}>{u.chapter} › {u.short ?? u.label}</option>)}</optgroup>)}</select>; }
    return null;
}
function Head({ col, i, ctx }) {
  const { pending, run, g, cols } = ctx;
  return <th className="colhd" data-g="col" data-col={col.id} data-type={col.type}>
    <div className="cn2"><span className="sgrip">⠿</span>{col.label}<span className="ord"><button type="button" aria-label="왼쪽으로" disabled={pending || i === 0} data-act="col-left" onClick={() => run(() => colMoveAct(g.id, col.id, "left"), null)}>◀</button><button type="button" aria-label="오른쪽으로" disabled={pending || i === cols.length - 1} data-act="col-right" onClick={() => run(() => colMoveAct(g.id, col.id, "right"), null)}>▶</button><button type="button" aria-label="칸 내리기" disabled={pending} data-act="col-retire" onClick={() => run(() => colRetireAct(col.id), `${col.label} 칸을 내렸습니다(지우지 않았습니다)`)}>✕</button></span></div>
    <select value={col.type} aria-label={`${col.label} 종류`} data-g="ctype" style={{ width: "auto", marginTop: 4 }} onChange={(x) => { const type = x.target.value; const options = type === "select" ? (Array.isArray(col.options) && col.options.length ? col.options : ["예정", "진행", "끝"]) : type === "pick" ? { of: "book" } : []; run(() => colSetAct(col.id, { label: col.label, type, options }), (r) => `${col.label} — ${typeName(type)} · 옮겨 담음 ${r.moved ?? 0} · 못 옮김 ${r.unmoved ?? 0}${r.unmovedRows?.length ? `(그대로 둠 — ${r.unmovedRows.join(", ")} · 글로 되돌리면 되살아납니다)` : ""}`); }}>{COL_TYPES.map(([k, nm]) => <option key={k} value={k}>{nm}{k === "select" && col.type === "select" ? ` · ${(col.options ?? []).join(" / ")}` : k === "pick" && col.type === "pick" ? ` · ${pickName(col.options?.of)}` : ""}</option>)}</select>
  </th>;
}
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date;
  const [mine, setMine] = useState(!d.principal); const [sel, setSel] = useState(d.sel); const [view, setView] = useState("table"); const [newOpen, setNewOpen] = useState(false); const [tpl, setTpl] = useState("books"); const [tplLabel, setTplLabel] = useState("");
  const [colForm, setColForm] = useState(null); const [rowForm, setRowForm] = useState(null); const [focus, setFocus] = useState(null); const [edit, setEdit] = useState({}); const [chk, setChk] = useState(null); const [chkNew, setChkNew] = useState(""); const [units, setUnits] = useState({}); const [watchOpen, setWatchOpen] = useState(true); const [watchNew, setWatchNew] = useState(null); const [showRetired, setShowRetired] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const grids = useMemo(() => visibleGrids(b.grids ?? [], { me: b.me, principal: d.principal, mine }), [b, d.principal, mine]);
  const retired = (b.grids ?? []).filter((g) => g.state === "retired");
  const g = grids.find((x) => x.id === sel) ?? grids[0] ?? null;
  const { cols, rows } = liveOf(g); const c = counts(b.grids ?? []); const jumps = jumpTargets(cols); const ws = watchSummary(b.watch ?? [], b.students ?? []);
  const refs = { books: b.books ?? [], exams: b.exams ?? [], units: Object.values(units).flat() };   // units.all(전부) 과 교재마다 읽은 것이 섞여도 id 로 찾으니 같다
  const bd = g ? boardOf(g) : null;
  const val = (r, col) => (edit[`${r.id}|${col.id}`] !== undefined ? edit[`${r.id}|${col.id}`] : r.cells?.[col.id] ?? null);
  const setV = (r, col, v) => setEdit({ ...edit, [`${r.id}|${col.id}`]: v });
  const save = (r, col, v, what = null) => run(() => cellAct(r.id, col.id, v, r.cells_at?.[col.id] ?? null), what ?? `${rowTitle(r)} · ${col.label} — 저장`, () => setEdit((s) => { const n = { ...s }; delete n[`${r.id}|${col.id}`]; return n; }));
  const loadUnits = (bookId) => { if (!bookId || units[bookId]) return; run(async () => { const r = await unitsAct(bookId); if (r.ok) setUnits((u) => ({ ...u, [bookId]: r.units })); return r; }); };
  const hasUnitCol = cols.some((c) => c.type === "pick" && c.options?.of === "unit");   // 「앱에서 고르기 → 단원」 칸이 있으면 단원 전부를 한 번((가)-⑤) — 새로고침 없이 상태만
  useEffect(() => { if (!hasUnitCol || units.all) return; let on = true; unitsAllAct().then((r) => { if (on && r.ok) setUnits((u) => ({ ...u, all: r.units })); }); return () => { on = false; }; }, [hasUnitCol, units.all]);
  const ctx = { pending, run, g, cols, save, val, setV, edit, setEdit, chk, setChk, chkNew, setChkNew, units, loadUnits: (id) => loadUnits(id), refs };
  const jumpTo = (id) => { const el = document.querySelector(`[data-col='${id}']`); if (el) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); };
  const [jumpAt, setJumpAt] = useState(null); const cur = jumps.find((j) => j.id === jumpAt) ?? jumps[0] ?? null;   // 「칸으로 이동」의 지금 칸 — ◀ ▶ 가 한 칸씩((가)-③ · 목업 06c)
  const jumpGo = (j) => { if (!j) return; setJumpAt(j.id); jumpTo(j.id); };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }}>🗂️ 학교별 표</span>
      <span className="note" style={{ margin: 0 }}>시험범위·직보·교재 진도 — 누가 보나는 <b>일정 권한</b>을 따릅니다(메뉴 32칸 그대로 · 원장님 답 기다림)</span>
      <span className="spacer" />
      {d.principal && <div className="seg sm" data-g="mine"><button type="button" aria-pressed={mine} onClick={() => { setMine(true); setSel(null); }}>내 표</button><button type="button" aria-pressed={!mine} onClick={() => { setMine(false); setSel(null); }}>전체 표(원장)</button></div>}
      <button className="btn pri sm" type="button" data-act="new-open" onClick={() => setNewOpen(!newOpen)}>+ 새 표</button>
      <a className="btn sm" href="/schedule/todo">🗂️ 할 일 ↗</a>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="lf ok" style={{ margin: "0 0 8px" }}><span className="ln">⇄</span><div><b>표 하나에 보기가 둘입니다 — 표 · 보드</b><small>줄과 칸은 하나입니다. <b>보드는 표의 「선택」 칸 하나로 묶어 보는 것</b>이라, 카드를 옮기면 표의 그 칸 값이 바뀝니다 — 같은 값입니다(원장님 9/3). 05 내 할 일은 「내 할 일」 표의 보드 보기, 04 내신 자료는 「내신 자료」 표의 표 보기입니다</small></div><span className="lm">원장님 9/3</span></div>
    {newOpen && <div className="card" data-g="new-grid" style={{ marginTop: 0 }}><div className="ctitle"><span className="cemo">＋</span>새 표 — 본 여섯 중 하나(이름은 바꿔도 됩니다)</div>
      <div className="wv"><select value={tpl} aria-label="본" data-g="tpl" onChange={(x) => setTpl(x.target.value)} style={{ width: "auto" }}>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label} — 줄 {t.rows === "school" ? "학교" : t.rows === "student" ? "학생" : "자유"} · 칸 {t.cols.length}</option>)}</select>
        <input type="text" value={tplLabel} placeholder="표 이름(비면 본 이름)" aria-label="표 이름" onChange={(x) => setTplLabel(x.target.value)} style={{ flex: "1 1 200px" }} />
        <button className="btn pri sm" type="button" disabled={pending} data-act="new-save" onClick={() => run(() => gridAddAct(tpl, tplLabel), (r) => `표를 세웠습니다 — 칸 ${r.cols}${r.board ? " · 보드 축 붙음" : ""}`, () => { setNewOpen(false); setTplLabel(""); })}>만들기</button></div>
      <p className="note k" style={{ margin: "6px 0 0" }}>{TEMPLATES.find((t) => t.key === tpl)?.cols.map(([l, ty]) => `${l}(${typeName(ty)})`).join(" · ") || "칸 없이 시작 — + 칸으로 더합니다"}</p></div>}
    <div className="exr" style={{ marginBottom: 8 }} data-g="watch">
      <div className="exh"><span className="ai">🎯</span><b>따로 챙길 아이들</b><span className="tag act" data-g="watch-noted">{ws.noted}명</span>
        <button className="btn sm gho" type="button" data-act="watch-toggle" onClick={() => setWatchOpen(!watchOpen)}>{watchOpen ? "접기 ▲" : "펴기 ▼"}</button><span className="spacer" /><span className="tag act">적어 둔 {ws.noted}</span><span className="tag">전체 {ws.total}</span></div>
      {watchOpen && <div className="left">
        {ws.rows.map((w) => <div className="lf" key={w.student_id} data-g="watch-row"><span className="ln">🎯</span><div><b>{w.name}</b><small>{w.school ?? ""}</small></div><input type="text" defaultValue={w.note ?? ""} aria-label={`${w.name} 메모`} onBlur={(x) => x.target.value !== (w.note ?? "") && run(() => watchAct(w.student_id, x.target.value), `${w.name} — 메모 저장`)} style={{ flex: "1 1 200px" }} /></div>)}
        {watchNew && <div className="lf" data-g="watch-new"><span className="ln">＋</span><div><b>{(b.students ?? []).find((s) => s.id === watchNew)?.name}</b><small>손을 떼면 저장 · 학생 화면에는 안 보입니다</small></div><input type="text" placeholder="무엇을 챙기나" aria-label="새 메모" onBlur={(x) => { if (x.target.value.trim()) run(() => watchAct(watchNew, x.target.value), "메모를 적었습니다", () => setWatchNew(null)); else setWatchNew(null); }} style={{ flex: "1 1 200px" }} /></div>}
        <div className="schips" data-g="watch-chips">{(b.students ?? []).filter((s) => !ws.rows.some((w) => w.student_id === s.id)).map((s) => <button key={s.id} type="button" className="schip" data-act="watch-pick" onClick={() => setWatchNew(s.id)}>+ {s.name}<small>{s.school ?? "학교 없음"}</small></button>)}</div>
      </div>}
    </div>
    <div className="shtabs" data-g="tabs">{grids.map((x) => <button key={x.id} type="button" className="shtab" aria-pressed={g?.id === x.id} data-act="tab" data-grid={x.id} onClick={() => { setSel(x.id); setFocus(null); }}>{x.label} <i>{alive(x.rows_).length}</i></button>)}
      {retired.length > 0 && <button type="button" className="shtab" aria-pressed={showRetired} data-act="show-retired" onClick={() => setShowRetired(!showRetired)}>내린 표 <i>{retired.length}</i></button>}</div>
    {showRetired && retired.map((x) => <div className="lf" key={x.id} data-g="retired-row"><span className="ln">·</span><div><b>{x.label}</b><small>내린 표 — 되살릴 수 있습니다(대전제-6)</small></div><button className="btn sm" type="button" disabled={pending} data-act="revive" onClick={() => run(() => gridReviveAct(x.id), `${x.label} — 되살렸습니다`)}>되살리기</button></div>)}
    {!g && <p className="note" data-g="empty">{mine ? "내 표가 아직 없습니다 — + 새 표" : "표가 아직 없습니다 — + 새 표"}</p>}
    {g && <div data-g="grid" data-grid={g.id}>
      <div className="shtitle"><b data-g="grid-label">{g.label}</b><button className="lnk" type="button" data-act="rename" onClick={() => { const nm = window.prompt("표 이름", g.label); if (nm != null && nm.trim() && nm.trim() !== g.label) run(() => gridRenameAct(g.id, nm), "이름을 바꿨습니다"); }}>✎</button>
        <span className="ord" data-g="grid-order"><button type="button" aria-label="표 왼쪽으로" disabled={pending || grids.findIndex((x) => x.id === g.id) <= 0} data-act="grid-left" onClick={() => run(() => gridMoveAct(g.id, "left"), "표 차례를 바꿨습니다(알약 차례)")}>◀</button><button type="button" aria-label="표 오른쪽으로" disabled={pending || grids.findIndex((x) => x.id === g.id) >= grids.length - 1} data-act="grid-right" onClick={() => run(() => gridMoveAct(g.id, "right"), "표 차례를 바꿨습니다(알약 차례)")}>▶</button></span><span className="spacer" /><button className="del" type="button" disabled={pending} data-act="grid-retire" onClick={() => run(() => gridRetireAct(g.id), `${g.label} — 내렸습니다(되살릴 수 있습니다)`, () => setSel(null))}>표 삭제</button></div>
      <div className="sortrow"><span className="fl" style={{ margin: 0 }}>🔽 정렬</span><span className="sel">내가 정한 순서 ⌄</span><span className="note" style={{ margin: 0 }}>⠿ 대신 ◀ ▶ · ▲ ▼ 로 옮깁니다(폰에서도 같습니다)</span></div>
      <div className="nb-viewbar" data-g="viewbar">
        <button type="button" className="nb-tab" aria-current={view === "table"} data-act="view-table" onClick={() => setView("table")}><span className="nb-ic">⊞</span>표</button>
        <button type="button" className="nb-tab" aria-current={view === "board"} data-act="view-board" onClick={() => setView("board")}><span className="nb-ic">▦</span>보드</button>
        <div className="nb-tools">
          {bd?.selects.length > 0 && <select value={bd.axis?.id ?? ""} aria-label="묶기" data-g="axis" style={{ width: "auto" }} onChange={(x) => run(() => boardColAct(g.id, x.target.value || null), "보드 축을 바꿨습니다")}>{bd.selects.map((s) => <option key={s.id} value={s.id}>묶기: {s.label}</option>)}</select>}
          <button type="button" className="nb-new" data-act="col-open" onClick={() => setColForm(colForm ? null : { label: "", type: "text", options: "" })}>+ 칸 ⌄</button>
        </div>
      </div>
      {colForm && <div className="card" data-g="col-form" style={{ marginTop: 0 }}><div className="wv"><input type="text" value={colForm.label} placeholder="칸 이름" aria-label="칸 이름" onChange={(x) => setColForm({ ...colForm, label: x.target.value })} style={{ flex: "1 1 160px" }} />
        <select value={colForm.type} aria-label="칸 종류" onChange={(x) => setColForm({ ...colForm, type: x.target.value })} style={{ width: "auto" }}>{COL_TYPES.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select>
        {colForm.type === "select" && <input type="text" value={colForm.options} placeholder="선택지 — 만들기, 인쇄, 배부" aria-label="선택지" onChange={(x) => setColForm({ ...colForm, options: x.target.value })} style={{ flex: "1 1 200px" }} />}
        {colForm.type === "pick" && <select value={colForm.of ?? "book"} aria-label="무엇을 고르나" onChange={(x) => setColForm({ ...colForm, of: x.target.value })} style={{ width: "auto" }}>{PICK_OF.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select>}
        <button className="btn pri sm" type="button" disabled={pending || !colForm.label.trim()} data-act="col-save" onClick={() => { try { const f = parseCol({ label: colForm.label, type: colForm.type, options: colForm.type === "pick" ? { of: colForm.of ?? "book" } : colForm.options }); run(() => colAddAct(g.id, f), `${f.label} 칸을 더했습니다`, () => setColForm(null)); } catch (e) { setErr(String(e.message)); } }}>더하기</button></div></div>}
      {jumps.length > 0 && <div className="jump" data-g="jump">📍 칸으로 이동 <button type="button" className="jn" data-act="jump-prev" aria-label="앞 칸" disabled={!jumpStep(jumps, cur?.id, "prev")} onClick={() => jumpGo(jumpStep(jumps, cur?.id, "prev"))}>◀</button>{jumps.map((j) => <button key={j.id} type="button" className="jb" data-act="jump" aria-current={cur?.id === j.id} style={cur?.id === j.id ? { textDecoration: "underline" } : undefined} onClick={() => jumpGo(j)}>{j.n} {j.label}</button>)}<button type="button" className="jn" data-act="jump-next" aria-label="뒤 칸" disabled={!jumpStep(jumps, cur?.id, "next")} onClick={() => jumpGo(jumpStep(jumps, cur?.id, "next"))}>▶</button><span>넓은 표에서 한 칸씩 · 한 줄만 크게 고치려면 줄의 ▣</span></div>}
      {view === "table" && <div className="tblwrap" data-g="table" data-focus={focus ? "1" : "0"}><table style={{ minWidth: 700 }}><thead><tr><th style={{ minWidth: 150 }}>{g.rows === "school" ? "학교" : g.rows === "student" ? "학생" : "줄"}</th>{cols.map((col, i) => <Head key={col.id} col={col} i={i} ctx={ctx} />)}<th className="addc">+ 칸</th></tr></thead><tbody>
        {focusRows(rows, focus).map((r, i) => <tr key={r.id} data-g="row" data-row={r.id} className={focus === r.id ? "hi" : ""}>
          <td className="stu"><span className="sgrip">⠿</span><b>{rowTitle(r)}</b><small>{rowSub(r) || (g.rows === "school" ? "🏫" : "")} <button className="lnk" type="button" aria-label="이 줄만 크게" data-act="row-focus" aria-pressed={focus === r.id} onClick={() => setFocus(focus === r.id ? null : r.id)}>▣</button> <button className="lnk" type="button" aria-label="위로" disabled={pending || i === 0} data-act="row-up" onClick={() => run(() => rowMoveAct(g.id, r.id, "up"), null)}>▲</button> <button className="lnk" type="button" aria-label="아래로" disabled={pending || i === rows.length - 1} data-act="row-down" onClick={() => run(() => rowMoveAct(g.id, r.id, "down"), null)}>▼</button> <button className="lnk" type="button" aria-label="줄 내리기" disabled={pending} data-act="row-retire" onClick={() => run(() => rowRetireAct(r.id), `${rowTitle(r)} 줄을 내렸습니다(지우지 않았습니다)`)}>✕</button></small></td>
          {cols.map((col) => <td key={col.id} data-g="cell" data-col={col.id}><Cell r={r} col={col} ctx={ctx} /></td>)}<td className="addc" />
        </tr>)}
        {!rows.length && <tr className="emptyrow"><td colSpan={cols.length + 2}>아직 줄이 없습니다. 아래에서 {g.rows === "school" ? "학교" : g.rows === "student" ? "아이" : "줄"}를 추가하세요.</td></tr>}
      </tbody></table></div>}
      {view === "table" && focus && (() => { const r = rows.find((x) => x.id === focus); return r ? <div className="card" data-g="focus"><div className="ctitle"><span className="cemo">▣</span>{rowTitle(r)} — 한 줄만 크게<span className="spacer" /><button className="btn sm" type="button" data-act="row-unfocus" onClick={() => setFocus(null)}>← 전체 {rows.length}줄</button></div><div className="left">{cols.map((col) => <div className="lf" key={col.id}><span className="ln">·</span><div><b>{col.label}</b><small>{cellText(col, r.cells?.[col.id], refs) || "—"}</small></div><div style={{ flex: "1 1 220px" }}><Cell r={r} col={col} ctx={ctx} /></div></div>)}</div></div> : null; })()}
      {view === "board" && bd && <div className="nb-board" data-g="board">
        {!bd.axis && <p className="note" data-g="no-axis">보드로 보려면 「선택」 칸이 하나 있어야 합니다 — + 칸에서 선택 종류로 더하세요</p>}
        {bd.axis && bd.columns.map((col) => <div className="nb-col" key={col.key} data-g="bcol" data-key={col.key}><div className="nb-colh"><span className="nb-pill">{col.label}</span><span className="nb-cnt" data-g="bcount">{col.cards.length}</span></div>
          {col.cards.map((r) => <div className="nb-card" key={r.id} data-g="bcard" data-row={r.id}><span className="nb-title">{cardTitle(g, r, refs)}</span>
            {(r.school || r.student) && <div className="nb-prop"><span className="nb-pi">🏫</span><span className="nb-pv"><span className="nb-pill nb-blue">{r.school ?? r.student}</span>{r.grade != null && <span className="nb-pill">{r.grade}학년</span>}</span></div>}
            {cols.filter((x) => x.id !== bd.axis.id && r.cells?.[x.id] != null).slice(0, 4).map((x) => <div className="nb-prop" key={x.id}><span className="nb-pi">{x.type === "date" ? "📅" : x.type === "yn" ? "☑" : "·"}</span><span className="nb-pv">{x.label} {cellText(x, r.cells[x.id], refs)}</span></div>)}
            <div className="wv" style={{ marginTop: 6, gap: 4 }}><button className="btn sm" type="button" disabled={pending || !nextOption(bd.axis, col.key, "left")} data-act="card-left" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, col.key, "left"), r.cells_at?.[bd.axis.id] ?? null), `${rowTitle(r)} → ${nextOption(bd.axis, col.key, "left")}`)}>◀</button><button className="btn sm" type="button" disabled={pending || !nextOption(bd.axis, col.key, "right")} data-act="card-right" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, col.key, "right"), r.cells_at?.[bd.axis.id] ?? null), `${rowTitle(r)} → ${nextOption(bd.axis, col.key, "right")}`)}>▶</button></div></div>)}
          {!col.cards.length && <div className="nb-empty">비어 있음</div>}</div>)}
        {bd.axis && <div className="nb-hidden" data-g="bhidden"><div className="nb-hh">숨긴 그룹</div><div className="nb-hg">👁 <span className="nb-pill">{bd.axis.label} 없음</span><span className="nb-cnt" data-g="bnone">{bd.none.length}</span></div>
          {bd.none.map((r) => <div className="nb-card" key={r.id} data-g="bcard-none"><span className="nb-title">{cardTitle(g, r, refs)}</span><div className="wv" style={{ marginTop: 6 }}><button className="btn sm" type="button" disabled={pending} data-act="card-first" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, null, "right")), `${rowTitle(r)} → ${nextOption(bd.axis, null, "right")}`)}>{nextOption(bd.axis, null, "right")} 으로</button></div></div>)}</div>}
      </div>}
      <div className="wv" style={{ marginTop: 8 }} data-g="row-add">
        {g.rows === "school" && <select value={rowForm?.schoolId ?? ""} aria-label="학교 추가" onChange={(x) => setRowForm({ schoolId: x.target.value })} style={{ width: "auto", maxWidth: 220 }}><option value="">학교 추가</option>{(b.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        {g.rows === "free" && <input type="text" value={rowForm?.label ?? ""} placeholder="줄 이름" aria-label="줄 추가" onChange={(x) => setRowForm({ label: x.target.value })} style={{ maxWidth: 220 }} />}
        {g.rows !== "student" && <button className="btn sm" type="button" disabled={pending || !(rowForm?.schoolId || rowForm?.label?.trim())} data-act="row-save" onClick={() => run(() => rowAddAct(g.id, rowForm), "줄을 더했습니다", () => setRowForm(null))}>추가</button>}
        <span className="note" style={{ margin: 0 }} data-g="grid-count">{g.rows === "school" ? "학교" : g.rows === "student" ? "학생" : "줄"} {rows.length}{g.rows === "school" ? "곳" : g.rows === "student" ? "명" : ""} · 칸 {cols.length}개{g.rows === "student" ? " · 아래에서 아이를 누르면 줄이 하나 생깁니다" : ""}</span></div>
      {g.rows === "student" && <div className="schips" data-g="student-chips">{(b.students ?? []).filter((s) => !rows.some((r) => r.student_id === s.id)).map((s) => <button key={s.id} type="button" className="schip" disabled={pending} data-act="row-student" onClick={() => run(() => rowAddAct(g.id, { studentId: s.id }), `${s.name} 줄을 더했습니다`)}>+ {s.name}<small>{s.school ?? "학교 없음"}</small></button>)}</div>}
    </div>}
    <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
      <span className="pill" data-g="bar-count">표 {c.grids}종 · 줄 {c.rows} · 칸 {c.cols}{c.retired ? ` · 내린 표 ${c.retired}` : ""}</span>
      <span className="spacer" />
      <span className="pill">메모는 칸에서 손을 떼면 저장됩니다 — 저장 단추가 없습니다</span>
    </div>
  </>;
}
