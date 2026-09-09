"use client";
/** 시험 회차 판(목업 06b) — 학교 회차 카드(보는 아이 · 영어일 · 범위 칩 · + 범위(교재 단원에서 고른다 · 글) · 학교가 뺌 · 시험 기간 · 교재 멈춤 줄 · 안 봄 · 숨김 · (저) 📡 날짜 바뀜 → 봤음) · 교재 멈춤 — 언제부터(학교급 규칙 · 아이 따로) · 전국 · 숨긴 회차.
 *  세는 것(N명 · N줄 · 영어일 없음 N)은 화면이 센다(원칙-5) — lib/exam-plan 한 벌 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scopeAct, removeScopeAct, skipAct, skipAllAct, hiddenAct, stopWeeksAct, studentWeeksAct, stopNowAct, releaseAct, unitsAct, changeSeenAct } from "./actions.js";
import { englishOnAct } from "../actions.js";
import { weeksFor, stopWindow, groupScopes, counts, examHead, examOn, mdDot, SOURCE_TEXT, stopText, unitsByChapter, skipCandidates, LEVEL_NAME, LEVELS, WEEK_CHOICES, dateChanged, changeText } from "@/lib/exam-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, exams = b.exams ?? [];
  const [showHidden, setShowHidden] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const c = counts(exams, today);
  const school = exams.filter((e) => e.scope === "school" && !e.hidden), nat = exams.filter((e) => e.scope === "national" && !e.hidden), hidden = exams.filter((e) => e.hidden);
  const stName = (id) => (b.students ?? []).find((s) => s.id === id)?.name ?? "?";
  const ctx = { b, today, pending, run, stName };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }} data-g="count">시험 회차 {c.exams}</span>
      <span className={"pill" + (c.missing ? " warn" : "")} data-g="missing">영어일 없음 {c.missing}</span>
      <span className="pill" data-g="scopes">범위 {c.scopes}줄</span>
      {c.hidden > 0 && <button className="btn sm" type="button" data-act="show-hidden" aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>🙈 숨긴 회차 {c.hidden}</button>}
      <span className="spacer" />
      <Link prefetch={false} className="btn sm" href="/schedule">📅 일정 ↗</Link><Link prefetch={false} className="btn sm" href="/schedule/import">📡 받아오기 · + 회차 ↗</Link>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {!school.length && <p className="note" data-g="empty">학교 회차가 없습니다 — 📡 받아오기에서 나이스로 받거나 손으로 넣으세요.</p>}
    <div className="two" style={{ gap: 8 }} data-g="exams">{school.map((e) => <ExamCard key={e.id} e={e} {...ctx} />)}</div>
    <StopCard {...ctx} />
    <div className="exr" style={{ marginTop: 8 }} data-g="national">
      <div className="exh"><span className="ai">🌏</span><b>전국 — 학교를 안 붙입니다</b><span className="spacer" /><span className="pill">고등 아이 전부에게(학년이 적혔으면 그 학년)</span></div>
      {!nat.length && <p className="note" style={{ margin: 0 }}>아직 없습니다 — 받아오기에서 전국 낱말로 판정됩니다.</p>}
      <div className="left">{nat.map((e, i) => <div key={e.id} className="lf" data-g="nat-row"><span className="ln">{i + 1}</span><div><b>{e.name}</b><small>{e.grade ? `고${e.grade}` : "고1·2·3"} · {e.takers.length}명</small><ChangedTag e={e} pending={pending} run={run} /></div><span className="lm">{mdDot(examOn(e))}</span></div>)}</div>
    </div>
    {showHidden && hidden.length > 0 && <div className="exr" style={{ marginTop: 8 }} data-g="hidden">
      <div className="exh"><span className="ai">🙈</span><b>숨긴 회차 — 통째로 안 보는 시험</b><span className="spacer" /><span className="pill">대비 · 범위 재촉 · 교재 멈춤에서 빠집니다</span></div>
      <div className="left">{hidden.map((e) => <div key={e.id} className="lf" data-g="hidden-row"><span className="ln">·</span><div><b>{examHead(e)}</b><small>{e.name} · {mdDot(e.term_from)}~{mdDot(e.term_to)}</small></div><button className="btn sm" type="button" disabled={pending} data-act="unhide" onClick={() => run(() => hiddenAct(e.id, false), "다시 보입니다")}>보이기</button></div>)}</div>
    </div>}
    <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
      <span className="pill" data-g="sum">회차 {c.exams} · 범위 {c.scopes}줄 · 영어일 없음 {c.missing}</span>
      <span className="spacer" />
      <span className="pill">범위·영어일은 시험 04 · 할 일 05 · 성적 16 이 읽습니다(다음에 짓는다)</span>
    </div>
  </>;
}
function ExamCard({ e, b, today, pending, run, stName }) {
  const [eng, setEng] = useState(""); const [open, setOpen] = useState(false); const [bookId, setBookId] = useState(""); const [units, setUnits] = useState([]); const [picked, setPicked] = useState({}); const [note, setNote] = useState(""); const [skipPick, setSkipPick] = useState("");
  const groups = groupScopes(e.scopes ?? [], today);
  const weeks = weeksFor(e.level, b.rules ?? {}), win = stopWindow(e, weeks), st = stopText(win, today);
  const chapters = unitsByChapter(units);
  const pickBook = (id) => { setBookId(id); setUnits([]); setPicked({}); if (id) run(async () => { const r = await unitsAct(id); if (r.ok) setUnits(r.units); return r; }); };
  const chosen = chapters.filter((ch) => picked[ch.chapter]).flatMap((ch) => ch.units.map((u) => u.id));
  const takers = e.takers ?? [], skipped = new Set((e.skips ?? []).map((k) => k.student_id));
  const pickable = skipCandidates(b.students, takers, e.skips);   // 안 봄 후보 — 한 명씩 · 한 번에((가)-⑨) 같은 목록
  return <div className="exr" style={{ borderColor: e.english_on ? undefined : "var(--miss)" }} data-g="exam-card" data-exam={e.id}>
    <div className="exh"><span className="ai">🏫</span><b data-g="exam-head">{examHead(e)}</b>
      {e.english_on ? <span className="tag on">영어 {mdDot(e.english_on)}</span> : <span className="tag act">영어일 없음</span>}<ChangedTag e={e} pending={pending} run={run} />
      <span className="tag" data-g="takers">{takers.length}명</span><Link prefetch={false} className="btn sm" href={`/schedule/exams/prep?e=${e.id}`} data-act="prep">📄 자료 ↗</Link>
      {(e.skips ?? []).length > 0 && <span className="tag" data-g="skips">안 봄 {e.skips.length}</span>}
      <span className="spacer" /><span className="pill">{SOURCE_TEXT[e.source] ?? "손으로 넣음"}</span>
      <Link prefetch={false} className="btn sm" href={`/scores?e=${e.id}`} data-act="scores">📈 성적</Link>
      <button className="btn sm" type="button" disabled={pending} data-act="hide" onClick={() => run(() => hiddenAct(e.id, true), "숨겼습니다 — 대비·재촉·교재 멈춤에서 빠집니다")}>🙈 숨김</button></div>
    <div className="note" style={{ margin: "0 0 8px" }}>{e.name} · 시험 기간 {mdDot(e.term_from)}{e.term_to && e.term_to !== e.term_from ? `~${mdDot(e.term_to)}` : ""}{e.source === "neis" ? " · 나이스가 주인(덮지 않습니다)" : ""}</div>
    {!e.english_on && <div className="lf over"><span className="ln">!</span><div><b>영어 시험일을 넣어 주세요</b><small>나이스는 기간만 줍니다 — 모르면 루틴(교재 멈춤)을 안 세웁니다</small></div>
      <input type="date" value={eng} onChange={(x) => setEng(x.target.value)} aria-label="영어 시험일" style={{ width: "auto" }} /><button className="btn sm pri" type="button" disabled={pending || !eng} data-act="english-save" onClick={() => run(() => englishOnAct(e.id, eng), "영어 시험일을 넣었습니다 — 교재 멈춤 창이 섰습니다")}>넣기</button></div>}
    <div className="rng" data-g="rng">
      {!groups.length && <span className="note" style={{ margin: 0 }} data-g="no-scope">범위가 아직 없습니다</span>}
      {groups.map((g) => <span key={g.key} className={"rg1" + (g.state === "add" ? " add" : g.state === "del" ? " del" : "")} data-g="scope" data-state={g.state}>{g.state === "del" ? <s>{g.title}</s> : <b>{g.title}</b>}<i>{g.sub}</i>
        {g.state !== "del" && <button className="btn sm" type="button" disabled={pending} data-act="scope-remove" style={{ marginTop: 4 }} onClick={() => run(() => removeScopeAct(g.liveIds), "학교가 뺀 것으로 적었습니다(지우지 않습니다)")}>학교가 뺌</button>}</span>)}
    </div>
    <div className="lf"><span className="ln">+</span><div><b>범위 더하기 — 교재 단원에서 고릅니다</b><small>글자로 적지 않습니다 · 단원으로 못 고르는 것만 글로</small></div>
      <button className="btn sm pri" type="button" data-act="scope-open" aria-pressed={open} onClick={() => setOpen(!open)}>+ 범위</button></div>
    {open && <div className="card" style={{ marginTop: 8 }} data-g="scope-form">
      <div className="wv"><select value={bookId} onChange={(x) => pickBook(x.target.value)} aria-label="교재" data-g="scope-book" style={{ width: "auto" }}><option value="">교재 고르기</option>{(b.books ?? []).map((bk) => <option key={bk.id} value={bk.id}>{bk.name}{bk.area ? ` · ${bk.area}` : ""}</option>)}</select>
        <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="글로 적는 범위 (예: 2409 학평 22-24)" aria-label="글로 적는 범위" style={{ flex: "1 1 200px" }} /></div>
      {bookId && !units.length && <p className="note">단원을 읽는 중…</p>}
      {chapters.length > 0 && <div className="left" style={{ marginTop: 8 }}>{chapters.map((ch) => <label key={ch.chapter} className="ckl" data-g="scope-chapter"><input type="checkbox" className="ck" checked={Boolean(picked[ch.chapter])} onChange={(x) => setPicked({ ...picked, [ch.chapter]: x.target.checked })} /> <b>{ch.chapter}</b> <small>소단원 {ch.units.length} · {ch.units.slice(0, 4).map((u) => u.short ?? u.sub).join(" · ")}{ch.units.length > 4 ? " …" : ""}</small></label>)}</div>}
      <div className="wv" style={{ marginTop: 8 }}><button className="btn pri sm" type="button" disabled={pending || (!chosen.length && !note.trim())} data-act="scope-save" onClick={() => run(() => scopeAct(e.id, { unitIds: chosen, freeNote: note }), (r) => `범위를 더했습니다 — ${r.added}줄${r.already ? ` · 이미 있던 것 ${r.already}` : ""}`, () => { setOpen(false); setPicked({}); setNote(""); })}>더하기</button><button className="btn sm" type="button" onClick={() => setOpen(false)}>닫기</button></div>
    </div>}
    <div className="lf" style={{ marginTop: 8 }} data-g="stop-line"><span className="ln">⏸</span>
      <div><b>교재 멈춤</b><small>{st ? `${st.text} · ${weeks}주 전부터(${LEVEL_NAME[e.level] ?? "학교급"} 기본값)` : e.english_on ? "규칙 줄이 없습니다 — prep.stop_weeks(0122)" : "영어 시험일이 있어야 섭니다"}</small></div>
      <span className="tag" data-g="stopped">멈춘 교재 {e.stopped ?? 0}</span>
      <button className="btn sm" type="button" disabled={pending || !e.english_on} data-act="stop-now" onClick={() => run(() => stopNowAct(e.id), (r) => `지금 멈췄습니다 — 교재 ${r.kept}권`)}>지금 멈춤</button>
      <button className="btn sm" type="button" disabled={pending} data-act="release" onClick={() => run(() => releaseAct(e.id), (r) => `풀었습니다 — 교재 ${r.released}권`)}>풀기</button></div>
    <div className="wv" style={{ marginTop: 8 }} data-g="skip-line"><span className="fl" style={{ margin: 0 }}>안 봄</span>
      {(e.skips ?? []).map((k) => <span key={k.student_id} className="tag" style={MISS} data-g="skip-tag">{k.name} <button className="btn sm" type="button" disabled={pending} data-act="unskip" onClick={() => run(() => skipAct(e.id, k.student_id, false), `${k.name} — 다시 봅니다`)}>본다</button></span>)}
      <select value={skipPick} onChange={(x) => setSkipPick(x.target.value)} aria-label="안 볼 아이" data-g="skip-pick" style={{ width: "auto" }}><option value="">아이 고르기</option>{pickable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="btn sm" type="button" disabled={pending || !skipPick} data-act="skip" onClick={() => run(() => skipAct(e.id, skipPick, true), `${stName(skipPick)} — 안 봄(대비·재촉·멈춤에서 빠집니다)`, () => setSkipPick(""))}>안 봄</button>
      {pickable.length > 1 && <button className="btn sm" type="button" disabled={pending} data-act="skip-all" title="보는 아이 가운데 아직 안 봄이 아닌 아이 전부 — 이 학년이 다 안 볼 때(한 명씩 되돌릴 수 있습니다)" onClick={() => run(() => skipAllAct(e.id, pickable.map((s) => s.id)), (r) => `${r.n}명 — 안 봄(대비·재촉·멈춤에서 빠집니다 · 한 명씩 「본다」로 되돌립니다)`, () => setSkipPick(""))}>남은 {pickable.length}명 다 안 봄</button>}
      {pickable.length === 1 && <button className="btn sm" type="button" disabled={pending} data-act="skip-all" onClick={() => run(() => skipAllAct(e.id, pickable.map((s) => s.id)), (r) => `${r.n}명 — 안 봄(대비·재촉·멈춤에서 빠집니다 · 「본다」로 되돌립니다)`, () => setSkipPick(""))}>남은 1명 다 안 봄</button>}</div>
  </div>;
}
/** (저) 「📡 날짜 바뀜 M/D~M/D → M/D~M/D · 봤음」 — 나이스가 기간을 옮긴 회차(0152 · 확정-69) · 학교 카드와 전국 줄이 같은 꼬리표 · 영어일이 있으면 「다시 보기」(안 건드렸다) */
function ChangedTag({ e, pending, run }) {
  if (!dateChanged(e)) return null;
  return <span className="tag act" data-g="changed">📡 날짜 바뀜 {changeText(e)}{e.english_on ? " · 영어일 다시 보기" : ""} <button className="btn sm" type="button" disabled={pending} data-act="change-seen" onClick={() => run(() => changeSeenAct(e.id), "봤음 — 대시보드에서 내려갑니다(이전 기간은 남습니다)")}>봤음</button></span>;
}
function StopCard({ b, today, pending, run }) {
  const [sid, setSid] = useState(""); const [w, setW] = useState("");
  const custom = (b.students ?? []).filter((s) => s.stop_weeks != null);
  return <div className="exr" style={{ marginTop: 8 }} data-g="stop-card">
    <div className="exh"><span className="ai">⏸</span><b>교재 멈춤 — 언제부터</b><span className="spacer" /><span className="pill">시험 끝나는 날 <b>저절로 풀립니다</b></span></div>
    <div className="left">
      {LEVELS.map((lv) => { const cur = b.rules?.[`prep.stop_weeks.${lv}`]; return <div key={lv} className="lf ok"><span className="ln">{lv === "high" ? "🎓" : lv === "middle" ? "🏫" : "🏠"}</span><div><b>{LEVEL_NAME[lv]}</b><small>영어 시험일에서 거꾸로 — 기본값{cur == null ? " · 규칙 줄이 없습니다(0122)" : ""}</small></div>
        <div className="seg sm" data-g={`weeks-${lv}`}>{WEEK_CHOICES.map((n) => <button key={n} type="button" aria-pressed={String(cur) === String(n)} disabled={pending} onClick={() => run(() => stopWeeksAct(lv, n), `${LEVEL_NAME[lv]} ${n}주 — 앞으로의 회차에 다시 맞췄습니다`)}>{n}주</button>)}</div></div>; })}
      <div className="lf"><span className="ln">🧑‍🎓</span><div><b>아이만 따로</b><small>학교급 기본값 대신 이 아이만 — {custom.length ? custom.map((s) => `${s.name} ${s.stop_weeks}주`).join(" · ") : "따로 정한 아이 없음"}</small></div>
        <select value={sid} onChange={(x) => setSid(x.target.value)} aria-label="아이" data-g="weeks-student" style={{ width: "auto" }}><option value="">아이 고르기</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={w} onChange={(x) => setW(x.target.value)} aria-label="주 수" data-g="weeks-n" style={{ width: "auto" }}><option value="">기본값</option>{WEEK_CHOICES.map((n) => <option key={n} value={n}>{n}주</option>)}</select>
        <button className="btn sm pri" type="button" disabled={pending || !sid} data-act="student-weeks" onClick={() => run(() => studentWeeksAct(sid, w || null), w ? `${w}주로 따로 정했습니다` : "학교급 기본값으로 돌렸습니다")}>저장</button></div>
      <p className="note" style={{ margin: 0 }}>회차마다 「지금 멈춤 · 풀기」는 위 카드에서 — 날짜와 상관없이 원장님이 누르시면 그 자리에서.</p>
    </div>
  </div>;
}
