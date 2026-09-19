"use client";
/** 학교별 표 판(목업 06c) — 머리(내 표/전체 표 · + 새 표) · 따로 챙길 아이들 띠 · 표 알약(shtabs) · 고른 표: 이름 · 표 삭제(내림) · 칸으로 이동 · 보기 둘(⊞표 · ▦보드 — 조회 0) · 표(머리칸 ⠿·◀▶✕·종류 ⌄ · 줄 ⠿·▣·✕ · 셀 종류대로 · + 칸 · + 줄) · 보드(선택 칸으로 묶기 · 카드 ◀ ▶) · 저장줄.
 *  값의 뜻·셈은 lib/grid-plan 한 벌. 셀은 손을 떼면 저장(저장 단추 없음) */
import Link from "next/link";
import Sibs from "@/app/_shell/sibs";
import SchoolAdd from "@/app/_shell/schooladd";   // 원장님 2026-09-15 「칸반에 학교추가를 못해 … 그걸 어디서 입력해야함」 · 학교 넣는 자리(한 벌)
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gridAddAct, gridRetireAct, gridReviveAct, gridRenameAct, gridShareAct, gridMoveAct, colAddAct, colSetAct, colMoveAct, colRetireAct, boardColAct, rowAddAct, rowMoveAct, rowRetireAct, cellAct, watchAct, unitsAllAct } from "./actions.js";
import { TEMPLATES, COL_TYPES, PICK_OF, SORT_DIRS, typeName, pickName, parseCol, cellText, toggleItem, addItem, removeItem, rowTitle, rowSub, alive, liveOf, jumpTargets, jumpStep, unitGroups, unitPick, focusRows, sortRows, boardOf, calendarOf, nextOption, cardTitle, watchSummary, visibleGrids, dateFrom, dateTo, monthLabel, nextYm } from "@/lib/grid-plan";
import { icon } from "../../_shell/icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
import { DateBox } from "../../_shell/datebox.js";
function Cell({ r, col, ctx }) {
  const { pending, save, quick, val, setV, chk, setChk, chkNew, setChkNew, units, refs } = ctx;
    const v = val(r, col);
    if (col.type === "text") return <input type="text" value={v ?? ""} placeholder="" aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => setV(r, col, x.target.value)} onBlur={(x) => { if ((x.target.value || null) !== (r.cells?.[col.id] ?? null)) save(r, col, x.target.value); }} />;
    if (col.type === "date") { const f = dateFrom(v), t = dateTo(v); return <span className="wv" style={{ gap: 4, marginBottom: 0 }} data-g="date-cell">
      <DateBox type="date" className="dt" value={f} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value ? { from: x.target.value, to: t } : null)} style={{ width: "auto" }} />
      {Boolean(t) && <DateBox type="date" className="dt" value={t} min={f || undefined} aria-label={`${rowTitle(r)} ${col.label} 종료일`} onChange={(x) => save(r, col, { from: f, to: x.target.value })} style={{ width: "auto" }} />}
      {Boolean(f) && <label className="ckl"><input type="checkbox" className="ck" data-g="date-span" aria-label={`${rowTitle(r)} ${col.label} 종료일 쓰기`} checked={Boolean(t)} disabled={pending} onChange={() => save(r, col, { from: f, to: t ? "" : f })} /> 종료일</label>}
    </span>; }
    if (col.type === "select") return <select value={v ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value)} style={{ width: "auto" }}><option value=""></option>{(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    if (col.type === "yn") return <div className="seg sm" data-g="yn">{[[true, "예"], [false, "아니오"], [null, ""]].map(([k, nm]) => <button key={String(k)} type="button" aria-pressed={v === k} disabled={pending} onClick={() => v !== k && save(r, col, k)}>{nm}</button>)}</div>;
    if (col.type === "checklist") { const key = `${r.id}|${col.id}`, list = Array.isArray(v) ? v : []; return <div className="wv" style={{ gap: 6, marginBottom: 0 }} data-g="chk">
      {list.map((x, i) => <span key={i} className="wv" style={{ gap: 2, marginBottom: 0 }} data-g="chk-item"><label className="ckl"><input type="checkbox" className="ck" checked={x.done} aria-label={`${rowTitle(r)} ${col.label} ${x.name}`} onChange={() => quick(r, col, toggleItem(list, i))} /> {x.name}</label><button type="button" className="lnk" disabled={pending} {...icon(`${x.name} 삭제`)} data-act="chk-remove" onClick={() => save(r, col, removeItem(list, i), `${x.name} · 삭제 ✓`)}>✕</button></span>)}
      {chk === key
        ? <span className="wv" style={{ gap: 4, marginBottom: 0 }}><input type="text" value={chkNew} aria-label="항목 더하기" onChange={(x) => setChkNew(x.target.value)} style={{ width: 110 }} /><button className="btn sm" type="button" disabled={pending || !chkNew.trim()} data-act="chk-add" onClick={() => save(r, col, addItem(list, chkNew), `${chkNew} · 더했습니다`, () => { setChkNew(""); setChk(null); })}>더하기</button></span>
        : <button type="button" className="lnk" data-g="chk-open" {...icon("항목 더하기")} onClick={() => { setChkNew(""); setChk(key); }}>＋</button>}
    </div>; }
    if (col.type === "pick") { const of = col.options?.of ?? "book"; const cur = v ?? {};
      if (of === "book") return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value ? { id: x.target.value } : null)} style={{ width: "auto" }}><option value="">교재 고르기</option>{refs.books.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
      if (of === "exam") return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} onChange={(x) => save(r, col, x.target.value ? { id: x.target.value } : null)} style={{ width: "auto" }}><option value="">시험 고르기</option>{refs.exams.map((x) => <option key={x.id} value={x.id}>{x.school ?? "전국"} {x.name}</option>)}</select>;
      // 단원 — 교재 → 단원 두 단이 아니라 한 고르개((가)-⑤): 교재마다 묶은 목록(단원 전부는 이 칸이 보일 때 한 번 읽는다) · 교재는 단원에서 나온다
      const groups = unitGroups(refs.books, refs.units);
      return <select value={cur.id ?? ""} aria-label={`${rowTitle(r)} ${col.label}`} disabled={!units.all} onChange={(x) => save(r, col, unitPick(refs.units, x.target.value))} style={{ width: "auto", maxWidth: 220 }}><option value="">{units.all ? (groups.length ? "단원 고르기" : "단원이 없습니다") : "단원 읽는 중"}</option>{groups.map((gp) => <optgroup key={gp.book.id} label={gp.book.name}>{gp.units.map((u) => <option key={u.id} value={u.id}>{u.chapter} › {u.short ?? u.label}</option>)}</optgroup>)}</select>; }
    return null;
}
function Head({ col, i, ctx }) {
  const { pending, run, g, cols } = ctx;
  return <th className="colhd" data-g="col" data-col={col.id} data-type={col.type}>
    <div className="cn2">{col.label}<span className="ord"><button type="button" {...icon("왼쪽으로")} disabled={pending || i === 0} data-act="col-left" onClick={() => run(() => colMoveAct(g.id, col.id, "left"), null)}>◀</button><button type="button" {...icon("오른쪽으로")} disabled={pending || i === cols.length - 1} data-act="col-right" onClick={() => run(() => colMoveAct(g.id, col.id, "right"), null)}>▶</button><button type="button" {...icon("칸 삭제")} disabled={pending} data-act="col-retire" onClick={() => run(() => colRetireAct(col.id), `${col.label} 칸 삭제 ✓ · 복구할 수 있습니다`)}>✕</button></span></div>
    <select value={col.type} aria-label={`${col.label} 종류`} data-g="ctype" style={{ width: "auto", marginTop: 4 }} onChange={(x) => { const type = x.target.value; const options = type === "select" ? (Array.isArray(col.options) && col.options.length ? col.options : ["예정", "진행", "끝"]) : type === "pick" ? { of: "book" } : []; run(() => colSetAct(col.id, { label: col.label, type, options }), (r) => `${col.label} · ${typeName(type)} · 옮겨 담음 ${r.moved ?? 0} · 못 옮김 ${r.unmoved ?? 0}${r.unmovedRows?.length ? `(그대로 둠 · ${r.unmovedRows.join(", ")} · 글로 되돌리면 복구됩니다)` : ""}`); }}>{COL_TYPES.map(([k, nm]) => <option key={k} value={k}>{nm}{k === "select" && col.type === "select" ? ` · ${(col.options ?? []).join(" / ")}` : k === "pick" && col.type === "pick" ? ` · ${pickName(col.options?.of)}` : ""}</option>)}</select>
  </th>;
}
export default function Board({ d }) {
  const [bnone, setBnone] = useState(true);   // (어92) 06c 「{축} 없음」 펴고 접기
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [rename, setRename] = useState(null);   /* 표 이름 바꾸기 — prompt 창 대신 화면 안에서(대전제-10 · 검사-④) { id, name } */
  const b = d.board, today = d.date;
  const [mine, setMine] = useState(!d.principal); const [sel, setSel] = useState(d.sel); const [view, setView] = useState("table"); const [sort, setSort] = useState({ by: null, dir: "asc" }); const [calYm, setCalYm] = useState(String(today).slice(0, 7)); const [newOpen, setNewOpen] = useState(false); const [tpl, setTpl] = useState("books"); const [tplLabel, setTplLabel] = useState("");
  const [colForm, setColForm] = useState(null); const [rowForm, setRowForm] = useState(null); const [focus, setFocus] = useState(null); const [edit, setEdit] = useState({}); const [chk, setChk] = useState(null); const [chkNew, setChkNew] = useState(""); const [units, setUnits] = useState({}); const [watchOpen, setWatchOpen] = useState(true); const [watchNew, setWatchNew] = useState(null); const [showRetired, setShowRetired] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const grids = useMemo(() => visibleGrids(b.grids ?? [], { me: b.me, principal: d.principal, mine }), [b, d.principal, mine]);
  const retired = (b.grids ?? []).filter((g) => g.state === "retired");
  const g = grids.find((x) => x.id === sel) ?? grids[0] ?? null;
  const { cols, rows: raw } = liveOf(g); const jumps = jumpTargets(cols); const ws = watchSummary(b.watch ?? [], b.students ?? []);
  const refs = { books: b.books ?? [], exams: b.exams ?? [], units: Object.values(units).flat() };   // units.all(전부) 과 교재마다 읽은 것이 섞여도 id 로 찾으니 같다
  const bd = g ? boardOf(g) : null;
  const rows = sortRows(raw, cols, sort.by, sort.dir, refs);   // 만든 칸을 기준으로 정렬(한 벌 sortRows) · 기본은 내가 정한 차례
  const cal = g && view === "cal" ? calendarOf(g, calYm, null, refs) : null;
  const dateCols = cols.filter((x) => x.type === "date");
  const wrote = useRef({});   // 내가 방금 쓴 셀 — 잇따라 누를 때 「다른 사람이 먼저 고쳤습니다」 가 안 뜨게(0-3 은 남의 손을 막는 것)
  const seenOf = (r, col) => (wrote.current[`${r.id}|${col.id}`] ? null : r.cells_at?.[col.id] ?? null);
  const val = (r, col) => (edit[`${r.id}|${col.id}`] !== undefined ? edit[`${r.id}|${col.id}`] : r.cells?.[col.id] ?? null);
  const setV = (r, col, v) => setEdit({ ...edit, [`${r.id}|${col.id}`]: v });
  const save = (r, col, v, what = null) => run(() => cellAct(r.id, col.id, v, seenOf(r, col)), what ?? `${rowTitle(r)} · ${col.label} · 저장`, () => { wrote.current[`${r.id}|${col.id}`] = true; setEdit((s) => { const n = { ...s }; delete n[`${r.id}|${col.id}`]; return n; }); });
  /** 체크는 화면을 먼저 바꾸고 저장은 뒤에서(속도-3 · 원장님 9/16 「체크하는 행위자체의 속도가 너무 느려」). 실패하면 되돌린다 */
  const quick = (r, col, v) => { const key = `${r.id}|${col.id}`, prev = val(r, col);
    setErr(""); setMsg(""); setEdit((e) => ({ ...e, [key]: v })); wrote.current[key] = true;
    start(async () => { const res = await cellAct(r.id, col.id, v, seenOf(r, col)); if (!res.ok) { setErr(res.msg); setEdit((e) => ({ ...e, [key]: prev })); return; } router.refresh(); }); };
  const hasUnitCol = cols.some((c) => c.type === "pick" && c.options?.of === "unit");   // 「앱에서 고르기 → 단원」 칸이 있으면 단원 전부를 한 번((가)-⑤) — 새로고침 없이 상태만
  useEffect(() => { if (!hasUnitCol || units.all) return; let on = true; unitsAllAct().then((r) => { if (on && r.ok) setUnits((u) => ({ ...u, all: r.units })); }); return () => { on = false; }; }, [hasUnitCol, units.all]);
  const ctx = { pending, run, g, cols, save, quick, val, setV, chk, setChk, chkNew, setChkNew, units, refs };
  const jumpTo = (id) => { const el = document.querySelector(`[data-col='${id}']`); if (el) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); };
  const [jumpAt, setJumpAt] = useState(null); const cur = jumps.find((j) => j.id === jumpAt) ?? jumps[0] ?? null;   // 「칸으로 이동」의 지금 칸 — ◀ ▶ 가 한 칸씩((가)-③ · 목업 06c)
  const jumpGo = (j) => { if (!j) return; setJumpAt(j.id); jumpTo(j.id); };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }}>🗂️ 학교별 표</span>
      <span className="spacer" />
      {d.principal && <div className="seg sm" data-g="mine"><button type="button" aria-pressed={mine} onClick={() => { setMine(true); setSel(null); }}>내 표</button><button type="button" aria-pressed={!mine} onClick={() => { setMine(false); setSel(null); }}>전체 표(원장)</button></div>}
      <Sibs here="/schedule/grid" />
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {newOpen && <div className="card" data-g="new-grid" style={{ marginTop: 0 }}><div className="ctitle"><span className="cemo">＋</span>새 표</div>
      <div className="wv"><select value={tpl} aria-label="본" data-g="tpl" onChange={(x) => setTpl(x.target.value)} style={{ width: "auto" }}>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label} · 줄 {t.rows === "school" ? "학교" : t.rows === "student" ? "학생" : "자유"} · 칸 {t.cols.length}</option>)}</select>
        <input type="text" value={tplLabel} placeholder="표 이름(비면 본 이름)" aria-label="표 이름" onChange={(x) => setTplLabel(x.target.value)} style={{ flex: "1 1 200px" }} />
        <button className="btn pri sm" type="button" disabled={pending} data-act="new-save" onClick={() => run(() => gridAddAct(tpl, tplLabel), (r) => `표를 세웠습니다. 칸 ${r.cols}${r.board ? " · 보드 축 붙음" : ""}`, () => { setNewOpen(false); setTplLabel(""); })}>만들기</button></div>
      <p className="note k" style={{ margin: "6px 0 0" }}>{TEMPLATES.find((t) => t.key === tpl)?.cols.map(([l, ty]) => `${l}(${typeName(ty)})`).join(" · ") || "칸 없이 시작 · + 칸으로 더합니다"}</p></div>}
    <div className="shtabs" data-g="tabs">{grids.map((x) => <button key={x.id} type="button" className="shtab" aria-pressed={g?.id === x.id} data-act="tab" data-grid={x.id} onClick={() => { setSel(x.id); setFocus(null); }}>{x.label} <i>{alive(x.rows_).length}</i></button>)}
      {retired.length > 0 && <button type="button" className="shtab" aria-pressed={showRetired} data-act="show-retired" onClick={() => setShowRetired(!showRetired)}>삭제한 표 <i>{retired.length}</i></button>}
      <button type="button" className="shtab" data-act="new-open" aria-pressed={newOpen} onClick={() => setNewOpen(!newOpen)}>+ 새 표</button></div>
    {showRetired && retired.map((x) => <div className="lf" key={x.id} data-g="retired-row"><span className="ln">·</span><div><b>{x.label}</b><small>삭제한 표 · 복구할 수 있습니다</small></div><button className="btn sm" type="button" disabled={pending} data-act="revive" onClick={() => run(() => gridReviveAct(x.id), `${x.label} · 복구했습니다`)}>복구</button></div>)}
    {!g && <p className="note" data-g="empty">{mine ? "내 표가 아직 없습니다. + 새 표" : "표가 아직 없습니다. + 새 표"}</p>}
    {g && <div data-g="grid" data-grid={g.id}>
      <div className="shtitle" data-g="grid-bar">{rename?.id === g.id ? <><input value={rename.name} aria-label="표 이름" data-g="rename" onChange={(e) => setRename({ id: g.id, name: e.target.value })} style={{ width: 160 }} /><button className="btn sm pri" type="button" data-act="rename-save" disabled={pending || !rename.name.trim()} onClick={() => { const nm = rename.name.trim(); setRename(null); if (nm && nm !== g.label) run(() => gridRenameAct(g.id, nm), "이름을 바꿨습니다"); }}>저장</button><button className="btn sm" type="button" data-act="rename-cancel" onClick={() => setRename(null)}>취소</button></> : <button className="lnk" type="button" data-act="rename" data-g="grid-label" data-label={g.label} {...icon("표 이름 바꾸기")} onClick={() => setRename({ id: g.id, name: g.label })}>✎</button>}
        <span className="seg sm" data-g="view"><button type="button" aria-pressed={view === "table"} data-act="view-table" onClick={() => setView("table")}>⊞ 표</button><button type="button" aria-pressed={view === "board"} data-act="view-board" onClick={() => setView("board")}>▦ 보드</button><button type="button" aria-pressed={view === "cal"} data-act="view-cal" disabled={!dateCols.length} onClick={() => setView("cal")}>📅 달력</button></span>
        <span className="seg sm" data-g="share"><button type="button" aria-pressed={!g.share} data-act="share-off" disabled={pending} onClick={() => { if (g.share) run(() => gridShareAct(g.id, false), "아이·학부모에게 안 보입니다"); }}>학원만</button><button type="button" aria-pressed={Boolean(g.share)} data-act="share-on" disabled={pending || g.rows !== "school"} onClick={() => { if (!g.share) run(() => gridShareAct(g.id, true), "아이·학부모 화면에 우리 학교 줄이 보입니다"); }}>아이·학부모 공개</button></span>
        <span className="ord" data-g="grid-order"><button type="button" {...icon("표 왼쪽으로")} disabled={pending || grids.findIndex((x) => x.id === g.id) <= 0} data-act="grid-left" onClick={() => run(() => gridMoveAct(g.id, "left"), "표 차례를 바꿨습니다(표시 차례)")}>◀</button><button type="button" {...icon("표 오른쪽으로")} disabled={pending || grids.findIndex((x) => x.id === g.id) >= grids.length - 1} data-act="grid-right" onClick={() => run(() => gridMoveAct(g.id, "right"), "표 차례를 바꿨습니다(표시 차례)")}>▶</button></span><span className="spacer" /><button className="del" type="button" disabled={pending} data-act="grid-retire" onClick={() => run(() => gridRetireAct(g.id), `${g.label} · 삭제 ✓ · 복구할 수 있습니다`, () => setSel(null))}>표 삭제</button></div>
      <div className="sortrow" data-g="sortrow">
        <span className="fl" style={{ margin: 0 }}>🔽 정렬</span>
        <select value={sort.by ?? ""} aria-label="정렬 기준" data-g="sort" style={{ width: "auto" }} onChange={(x) => setSort({ by: x.target.value || null, dir: sort.dir })}><option value="">내가 정한 순서</option>{cols.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        {Boolean(sort.by) && <span className="seg sm" data-g="sort-dir">{SORT_DIRS.map(([k, nm]) => <button key={k} type="button" aria-pressed={sort.dir === k} data-act={`sort-${k}`} onClick={() => setSort({ by: sort.by, dir: k })}>{nm}</button>)}</span>}
        {view === "board" && bd?.selects.length > 0 && <select value={bd.axis?.id ?? ""} aria-label="묶기" data-g="axis" style={{ width: "auto" }} onChange={(x) => run(() => boardColAct(g.id, x.target.value || null), "보드 축을 바꿨습니다")}>{bd.selects.map((x) => <option key={x.id} value={x.id}>묶기: {x.label}</option>)}</select>}
        {view === "cal" && <span className="seg sm" data-g="cal-move"><button type="button" {...icon("지난달")} data-act="cal-prev" onClick={() => setCalYm(nextYm(calYm, -1))}>◀</button><button type="button" {...icon("다음달")} data-act="cal-next" onClick={() => setCalYm(nextYm(calYm, 1))}>▶</button></span>}
        {view === "cal" && <b data-g="cal-ym">{monthLabel(calYm)}{cal?.axis ? ` · ${cal.axis.label}` : ""}</b>}
        <span className="spacer" />
        <button type="button" className="btn sm" data-act="col-open" aria-pressed={Boolean(colForm)} onClick={() => setColForm(colForm ? null : { label: "", type: "text", options: "" })}>+ 칸</button>
      </div>
      {colForm && <div className="card" data-g="col-form" style={{ marginTop: 0 }}><div className="wv"><input type="text" value={colForm.label} placeholder="칸 이름" aria-label="칸 이름" onChange={(x) => setColForm({ ...colForm, label: x.target.value })} style={{ flex: "1 1 160px" }} />
        <select value={colForm.type} aria-label="칸 종류" onChange={(x) => setColForm({ ...colForm, type: x.target.value })} style={{ width: "auto" }}>{COL_TYPES.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select>
        {colForm.type === "select" && <input type="text" value={colForm.options} placeholder="선택지 · 만들기, 인쇄, 배부" aria-label="선택지" onChange={(x) => setColForm({ ...colForm, options: x.target.value })} style={{ flex: "1 1 200px" }} />}
        {colForm.type === "pick" && <select value={colForm.of ?? "book"} aria-label="무엇을 고르나" onChange={(x) => setColForm({ ...colForm, of: x.target.value })} style={{ width: "auto" }}>{PICK_OF.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select>}
        <button className="btn pri sm" type="button" disabled={pending || !colForm.label.trim()} data-act="col-save" onClick={() => { try { const f = parseCol({ label: colForm.label, type: colForm.type, options: colForm.type === "pick" ? { of: colForm.of ?? "book" } : colForm.options }); run(() => colAddAct(g.id, f), `${f.label} 칸을 더했습니다`, () => setColForm(null)); } catch (e) { setErr(String(e.message)); } }}>더하기</button></div></div>}
      {jumps.length > 0 && <div className="jump" data-g="jump">📍 칸으로 이동 <button type="button" className="jn" data-act="jump-prev" {...icon("앞 칸")} disabled={!jumpStep(jumps, cur?.id, "prev")} onClick={() => jumpGo(jumpStep(jumps, cur?.id, "prev"))}>◀</button>{jumps.map((j) => <button key={j.id} type="button" className="jb" data-act="jump" aria-current={cur?.id === j.id} style={cur?.id === j.id ? { textDecoration: "underline" } : undefined} onClick={() => jumpGo(j)}>{j.n} {j.label}</button>)}<button type="button" className="jn" data-act="jump-next" {...icon("뒤 칸")} disabled={!jumpStep(jumps, cur?.id, "next")} onClick={() => jumpGo(jumpStep(jumps, cur?.id, "next"))}>▶</button><span>넓은 표에서 한 칸씩 · 한 줄만 크게 고치려면 줄의 ▣</span></div>}
      {view === "table" && <div className="tblwrap" data-g="table" data-focus={focus ? "1" : "0"}><table style={{ minWidth: 700 }}><thead><tr><th style={{ minWidth: 150 }}>{g.rows === "school" ? "학교" : g.rows === "student" ? "학생" : "줄"}</th>{cols.map((col, i) => <Head key={col.id} col={col} i={i} ctx={ctx} />)}<th className="addc">+ 칸</th></tr></thead><tbody>
        {focusRows(rows, focus).map((r, i) => <tr key={r.id} data-g="row" data-row={r.id} className={focus === r.id ? "hi" : ""}>
          <td className="stu"><b>{rowTitle(r)}</b><small>{rowSub(r) || (g.rows === "school" ? "🏛️" : "")} <button className="lnk" type="button" {...icon("이 줄만 크게")} data-act="row-focus" aria-pressed={focus === r.id} onClick={() => setFocus(focus === r.id ? null : r.id)}>▣</button> <button className="lnk" type="button" {...icon("위로")} disabled={pending || i === 0} data-act="row-up" onClick={() => run(() => rowMoveAct(g.id, r.id, "up"), null)}>▲</button> <button className="lnk" type="button" {...icon("아래로")} disabled={pending || i === rows.length - 1} data-act="row-down" onClick={() => run(() => rowMoveAct(g.id, r.id, "down"), null)}>▼</button> <button className="lnk" type="button" {...icon("줄 삭제")} disabled={pending} data-act="row-retire" onClick={() => run(() => rowRetireAct(r.id), `${rowTitle(r)} 줄 삭제 ✓ · 복구할 수 있습니다`)}>✕</button></small></td>
          {cols.map((col) => <td key={col.id} data-g="cell" data-col={col.id}><Cell r={r} col={col} ctx={ctx} /></td>)}<td className="addc" />
        </tr>)}
        {!rows.length && <tr className="emptyrow"><td colSpan={cols.length + 2}>아직 줄이 없습니다. 아래에서 {g.rows === "school" ? "학교" : g.rows === "student" ? "아이" : "줄"}를 추가하세요.</td></tr>}
      </tbody></table></div>}
      {view === "table" && focus && (() => { const r = rows.find((x) => x.id === focus); return r ? <div className="card" data-g="focus"><div className="ctitle"><span className="cemo">▣</span>{rowTitle(r)} · 한 줄만 크게<span className="spacer" /><button className="btn sm" type="button" data-act="row-unfocus" onClick={() => setFocus(null)}>← 전체 {rows.length}줄</button></div><div className="left">{cols.map((col) => <div className="lf" key={col.id}><span className="ln">·</span><div><b>{col.label}</b><small>{cellText(col, r.cells?.[col.id], refs) || ""}</small></div><div style={{ flex: "1 1 220px" }}><Cell r={r} col={col} ctx={ctx} /></div></div>)}</div></div> : null; })()}
      {view === "board" && bd && <div className="nb-board" data-g="board">
        {!bd.axis && <p className="note" data-g="no-axis">선택 칸이 없어 보드가 없음 · + 칸</p>}
        {bd.axis && bd.columns.map((col) => <div className="nb-col" key={col.key} data-g="bcol" data-key={col.key}><div className="nb-colh"><span className="nb-pill">{col.label}</span><span className="nb-cnt" data-g="bcount">{col.cards.length}</span></div>
          {col.cards.map((r) => <div className="nb-card" key={r.id} data-g="bcard" data-row={r.id}><span className="nb-title">{cardTitle(g, r, refs)}</span>
            {(r.school || r.student) && <div className="nb-prop"><span className="nb-pi">🏛️</span><span className="nb-pv"><span className="nb-pill nb-blue">{r.school ?? r.student}</span>{r.grade != null && <span className="nb-pill">{r.grade}학년</span>}</span></div>}
            {cols.filter((x) => x.id !== bd.axis.id && r.cells?.[x.id] != null).slice(0, 4).map((x) => <div className="nb-prop" key={x.id}><span className="nb-pi">{x.type === "date" ? "📅" : x.type === "yn" ? "☑" : "·"}</span><span className="nb-pv">{x.label} {cellText(x, r.cells[x.id], refs)}</span></div>)}
            <div className="wv" style={{ marginTop: 6, gap: 4 }}><button className="btn sm" type="button" disabled={pending || !nextOption(bd.axis, col.key, "left")} data-act="card-left" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, col.key, "left"), r.cells_at?.[bd.axis.id] ?? null), `${rowTitle(r)} → ${nextOption(bd.axis, col.key, "left")}`)} {...icon("앞 칸", "앞 칸으로 옮기기")}>◀</button><button className="btn sm" type="button" disabled={pending || !nextOption(bd.axis, col.key, "right")} data-act="card-right" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, col.key, "right"), r.cells_at?.[bd.axis.id] ?? null), `${rowTitle(r)} → ${nextOption(bd.axis, col.key, "right")}`)} {...icon("뒤 칸", "뒤 칸으로 옮기기")}>▶</button></div></div>)}
          {!col.cards.length && <div className="nb-empty">비어 있음</div>}</div>)}
        {bd.axis && <div className="nb-hidden" data-g="bhidden"><div className="nb-hh">숨긴 그룹</div>
          {/* (어92) 05 에서는 같은 `.nb-hg` 가 **단추**로 펴고 접는데 06c 것만 div 였다 — 눌러도 아무 일이 없었다
              (원장님 2026-09-18 「눌리지도않음」과 같은 병). 진짜 토글로 만들되 **펴진 채로 시작**한다 — 보이던 것이 사라지면 안 된다 */}
          <button type="button" className="nb-hg" data-act="show-bnone" aria-pressed={bnone} onClick={() => setBnone(!bnone)}>👁 <span className="nb-pill">{bd.axis.label} 없음</span><span className="nb-cnt" data-g="bnone">{bd.none.length}</span></button>
          {bnone && bd.none.map((r) => <div className="nb-card" key={r.id} data-g="bcard-none"><span className="nb-title">{cardTitle(g, r, refs)}</span><div className="wv" style={{ marginTop: 6 }}><button className="btn sm" type="button" disabled={pending} data-act="card-first" onClick={() => run(() => cellAct(r.id, bd.axis.id, nextOption(bd.axis, null, "right")), `${rowTitle(r)} → ${nextOption(bd.axis, null, "right")}`)}>{nextOption(bd.axis, null, "right")} 으로</button></div></div>)}</div>}
      </div>}
      {view === "cal" && cal && <div className="calwrap" data-g="cal">
        {!cal.axis && <p className="note" data-g="no-date">날짜 칸이 없어 달력이 없습니다. + 칸</p>}
        {Boolean(cal.axis) && <div className="cal big2">
          {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
          {cal.cells.map((c) => <div key={c.date} className={"cd" + (c.out ? " out" : "") + (c.date === today ? " today" : "")} data-g="cal-day" data-date={c.date}>
            <span className="dn">{c.day}</span>
            {c.items.slice(0, 3).map((it) => <button key={it.id} type="button" className={"ce " + (it.span ? "cls" : "todo")} data-g="cal-item" data-row={it.id} style={{ border: 0, width: "100%", textAlign: "left" }} onClick={() => { setView("table"); setFocus(it.id); }}>{it.head ? it.title : `↳ ${it.title}`}</button>)}
            {c.items.length > 3 && <span className="ce">+{c.items.length - 3}</span>}
          </div>)}
        </div>}
        {Boolean(cal.axis) && cal.none.length > 0 && <p className="note" data-g="cal-none">{cal.axis.label} 안 적은 줄 {cal.none.length}</p>}
      </div>}
      <div className="wv" style={{ marginTop: 8 }} data-g="row-add">
        {g.rows === "school" && <select value={rowForm?.schoolId ?? ""} aria-label="학교 추가" onChange={(x) => setRowForm({ schoolId: x.target.value })} style={{ width: "auto", maxWidth: 220 }}><option value="">학교 추가</option>{(b.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        {g.rows === "school" && <SchoolAdd open={!(b.schools ?? []).length} onAdded={(id) => setRowForm({ schoolId: id })} />}
        {g.rows === "free" && <input type="text" value={rowForm?.label ?? ""} placeholder="줄 이름" aria-label="줄 추가" onChange={(x) => setRowForm({ label: x.target.value })} style={{ maxWidth: 220 }} />}
        {g.rows !== "student" && <button className="btn sm" type="button" disabled={pending || !(rowForm?.schoolId || rowForm?.label?.trim())} data-act="row-save" onClick={() => run(() => rowAddAct(g.id, rowForm), "줄을 더했습니다", () => setRowForm(null))}>추가</button>}
      </div>
      {g.rows === "student" && <div className="schips" data-g="student-chips">{(b.students ?? []).filter((s) => !rows.some((r) => r.student_id === s.id)).map((s) => <button key={s.id} type="button" className="schip" disabled={pending} data-act="row-student" onClick={() => run(() => rowAddAct(g.id, { studentId: s.id }), `${s.name} 줄을 더했습니다`)}>+ {s.name}<small>{s.school ?? "학교 없음"}</small></button>)}</div>}
    </div>}
    <div className="exr" style={{ marginTop: 12 }} data-g="watch">
      <div className="exh"><span className="ai">🎯</span><b>따로 챙길 아이들</b><span className="tag act" data-g="watch-noted">{ws.noted}명</span>
        <button className="btn sm gho" type="button" data-act="watch-toggle" onClick={() => setWatchOpen(!watchOpen)}>{watchOpen ? "접기 ▲" : "펴기 ▼"}</button><span className="spacer" /><span className="tag act">적어 둔 {ws.noted}</span><span className="tag">전체 {ws.total}</span></div>
      {watchOpen && <div className="left">
        {ws.rows.map((w) => <div className="lf" key={w.student_id} data-g="watch-row"><span className="ln">🎯</span><div><b>{w.name}</b><small>{w.school ?? ""}</small></div><input type="text" defaultValue={w.note ?? ""} aria-label={`${w.name} 메모`} onBlur={(x) => x.target.value !== (w.note ?? "") && run(() => watchAct(w.student_id, x.target.value), `${w.name} · 메모 저장`)} style={{ flex: "1 1 200px" }} /></div>)}
        {watchNew && <div className="lf" data-g="watch-new"><span className="ln">＋</span><div><b>{(b.students ?? []).find((s) => s.id === watchNew)?.name}</b><small>학생에게는 안 보임</small></div><input type="text" placeholder="무엇을 챙기나" aria-label="새 메모" onBlur={(x) => { if (x.target.value.trim()) run(() => watchAct(watchNew, x.target.value), "메모를 적었습니다", () => setWatchNew(null)); else setWatchNew(null); }} style={{ flex: "1 1 200px" }} /></div>}
        <div className="schips" data-g="watch-chips">{(b.students ?? []).filter((s) => !ws.rows.some((w) => w.student_id === s.id)).map((s) => <button key={s.id} type="button" className="schip" data-act="watch-pick" onClick={() => setWatchNew(s.id)}>+ {s.name}<small>{s.school ?? "학교 없음"}</small></button>)}</div>
      </div>}
    </div>
  </>;
}
