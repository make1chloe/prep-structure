"use client";
/** 시험 회차 판(목업 06b) · 학교 회차 카드(보는 아이 · 영어 시험일 · 범위 칩 · + 범위(교재 단원에서 고른다 · 글) · 학교가 뺌 · 시험 기간 · 교재 보류 줄 · 안 봄 · 숨김 · (저) 📡 날짜 바뀜 → 봤음) · 교재 보류 · 언제부터(학교급 규칙 · 아이 따로) · 전국 · 숨긴 회차.
 *  세는 것(N명 · N줄 · 영어 시험일 없음 N)은 화면이 센다(원칙-5) · lib/exam-plan 한 벌 */
import Link from "next/link";
import Sibs from "@/app/_shell/sibs";
import ScopeForm from "@/app/_shell/scopeform";
import SchoolsCard from "@/app/_shell/schoolscard";   // 학교 이름·급 고치기 · 닫기 · + 새 학교(대전제-19)
import ExamForm from "@/app/_shell/examform";   // (어52) 원장님 9/16 「내신에도 그게 가능해」 — 12 일정 · 12b 가져오기와 같은 칸(원칙-1) · 넣으면 일정 달력에도 뜬다
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scopeAct, removeScopeAct, skipAct, skipAllAct, hiddenAct, hiddenManyAct, stopWeeksAct, studentWeeksAct, stopNowAct, releaseAct, changeSeenAct, changeSeenManyAct } from "./actions.js";
import { usePick, PickAll, PickBox, PickBar } from "../../_shell/pick.js";   /* 고르기 한 벌((어28)-③ · 대전제-20) */
import { englishOnAct } from "../actions.js";
import { weeksFor, stopWindow, groupScopes, counts, examHead, examOn, mdDot, SOURCE_TEXT, stopText, stopDone, releaseDone, skipCandidates, LEVEL_NAME, LEVELS, WEEK_CHOICES, dateChanged, changeText } from "@/lib/exam-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, exams = b.exams ?? [];
  const [showHidden, setShowHidden] = useState(false); const [adding, setAdding] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const c = counts(exams, today);
  const school = exams.filter((e) => e.scope === "school" && !e.hidden), nat = exams.filter((e) => e.scope === "national" && !e.hidden), hidden = exams.filter((e) => e.hidden);
  const stName = (id) => (b.students ?? []).find((s) => s.id === id)?.name ?? "?";
  const ids = useMemo(() => exams.map((e) => e.id), [exams]); const pk = usePick(ids);   /* 고른 시험(학교 · 숨긴 것 · 전국) · 띠에서 한 번에 */
  const picked = exams.filter((e) => pk.has(e.id)), toHide = picked.filter((e) => !e.hidden && e.scope === "school"), toShow = picked.filter((e) => e.hidden), toSee = picked.filter((e) => dateChanged(e));   /* 📡 바뀐 것 = 꼬리표와 같은 판단(dateChanged 한 벌) · 🙈 는 학교 시험만(전국 줄은 카드에도 🙈 손이 없다 · 한 번에 업무는 줄 손과 같다) */
  const ctx = { b, today, pending, run, stName, pk };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <PickAll pick={pk} /><span className="pill" style={{ fontWeight: 700 }} data-g="count">학교 시험 {c.exams}</span>
      <span className={"pill" + (c.missing ? " warn" : "")} data-g="missing">영어 시험일 없음 {c.missing}</span>
      <span className="pill" data-g="scopes">범위 {c.scopes}줄</span>
      {c.hidden > 0 && <button className="btn sm" type="button" data-act="show-hidden" aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>🙈 숨긴 시험 {c.hidden}</button>}
      <span className="spacer" />
      <button className="btn sm pri" type="button" data-act="exam-add" aria-pressed={adding} onClick={() => setAdding(!adding)}>+ 시험</button>
      <Sibs here="/schedule/exams" /><Link prefetch={false} className="btn sm" href="/schedule">📅 일정 ↗</Link><Link prefetch={false} className="btn sm" href="/schedule/import">📡 학사일정 ↗</Link>
    </div>
    {adding && <ExamForm schools={b.schools ?? []} date={today} pending={pending} run={run} onDone={() => setAdding(false)} />}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <PickBar pick={pk} unit="개">{/* (어28)-③ 고른 시험에 한 번에 · 숨기기(대비·알림·교재 보류에서 빠짐 · 지우지 않는다) · 복구 · 📡 봤음 */}
      <button type="button" className="btn sm" disabled={pending || !toHide.length} data-act="hide-picked" onClick={() => run(() => hiddenManyAct(toHide.map((e) => e.id), true), (r) => `${r.n}개 숨겼습니다. 대비·알림·교재 보류에서 빠집니다`, pk.clear)}>🙈 숨기기 {toHide.length}</button>
      <button type="button" className="btn sm" disabled={pending || !toShow.length} data-act="unhide-picked" onClick={() => run(() => hiddenManyAct(toShow.map((e) => e.id), false), (r) => `${r.n}개 복구했습니다`, pk.clear)}>👁 복구 {toShow.length}</button>
      <button type="button" className="btn sm" disabled={pending || !toSee.length} data-act="seen-picked" onClick={() => run(() => changeSeenManyAct(toSee.map((e) => e.id)), (r) => `${r.n}개 봤음`, pk.clear)}>📡 봤음 {toSee.length}</button>
    </PickBar>
    {!school.length && <p className="note" data-g="empty">학교 시험 없음 · 📡 가져오기 · 손으로 넣기</p>}
    <div className="two" style={{ gap: 8 }} data-g="exams">{school.map((e) => <ExamCard key={e.id} e={e} {...ctx} />)}</div>
    <StopCard {...ctx} />
    <SchoolsCard schools={b.schools ?? []} />
    <div className="exr" style={{ marginTop: 8 }} data-g="national">
      <div className="exh"><span className="ai">🌏</span><b>전국</b><span className="spacer" /><span className="pill">고등 전부</span></div>
      {!nat.length && <p className="note" style={{ margin: 0 }}>아직 없음 · 📡 가져오기</p>}
      <div className="left">{nat.map((e, i) => <div key={e.id} className="lf" data-g="nat-row"><PickBox pick={pk} id={e.id} label={`${e.name} 고르기`} /><span className="ln">{i + 1}</span><div><b>{e.name}</b><small>{e.grade ? `고${e.grade}` : "고1·2·3"} · {e.takers.length}명</small><ChangedTag e={e} pending={pending} run={run} /></div><span className="lm">{mdDot(examOn(e))}</span></div>)}</div>
    </div>
    {showHidden && hidden.length > 0 && <div className="exr" style={{ marginTop: 8 }} data-g="hidden">
      <div className="exh"><span className="ai">🙈</span><b>숨긴 시험</b><span className="spacer" /></div>
      <div className="left">{hidden.map((e) => <div key={e.id} className="lf" data-g="hidden-row"><PickBox pick={pk} id={e.id} label={`${examHead(e)} 고르기`} /><span className="ln">·</span><div><b>{examHead(e)}</b><small>{e.name} · {mdDot(e.term_from)}~{mdDot(e.term_to)}</small></div><button className="btn sm" type="button" disabled={pending} data-act="unhide" onClick={() => run(() => hiddenAct(e.id, false), "다시 보입니다")}>보이기</button></div>)}</div>
    </div>}
    <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
      <span className="pill" data-g="sum">시험 {c.exams} · 범위 {c.scopes}줄 · 영어 시험일 없음 {c.missing}</span>
      <span className="spacer" />
    </div>
  </>;
}
function ExamCard({ e, b, today, pending, run, stName, pk }) {
  const [eng, setEng] = useState(""); const [open, setOpen] = useState(false); const [skipPick, setSkipPick] = useState("");
  const groups = groupScopes(e.scopes ?? [], today);
  const weeks = weeksFor(e.level, b.rules ?? {}), win = stopWindow(e, weeks), st = stopText(win, today);
  const takers = e.takers ?? [], skipped = new Set((e.skips ?? []).map((k) => k.student_id));
  const pickable = skipCandidates(b.students, takers, e.skips);   // 안 봄 후보 — 한 명씩 · 한 번에((가)-⑨) 같은 목록
  return <div className="exr" style={{ borderColor: e.english_on ? undefined : "var(--miss)" }} data-g="exam-card" data-exam={e.id}>
    <div className="exh"><PickBox pick={pk} id={e.id} label={`${examHead(e)} 고르기`} /><span className="ai">🏫</span><b data-g="exam-head">{examHead(e)}</b>
      {e.english_on ? <span className="tag on">영어 {mdDot(e.english_on)}</span> : <span className="tag act">영어 시험일 없음</span>}<ChangedTag e={e} pending={pending} run={run} />
      <span className="tag" data-g="takers">{takers.length}명</span><Link prefetch={false} className="btn sm" href={`/schedule/exams/prep?e=${e.id}`} data-act="prep">📄 자료 ↗</Link>
      {(e.skips ?? []).length > 0 && <span className="tag" data-g="skips">안 봄 {e.skips.length}</span>}
      <span className="spacer" /><span className="pill">{SOURCE_TEXT[e.source] ?? "손으로 넣음"}</span>
      <Link prefetch={false} className="btn sm" href={`/scores?e=${e.id}`} data-act="scores">📈 성적</Link>
      <button className="btn sm" type="button" disabled={pending} data-act="hide" onClick={() => run(() => hiddenAct(e.id, true), "숨겼습니다. 대비·알림·교재 보류에서 빠집니다")}>🙈 숨김</button></div>
    <div className="note" style={{ margin: "0 0 8px" }}>{e.name} · 시험 기간 {mdDot(e.term_from)}{e.term_to && e.term_to !== e.term_from ? `~${mdDot(e.term_to)}` : ""}{e.source === "neis" ? " · 나이스가 주인(덮지 않습니다)" : ""}</div>
    {!e.english_on && <div className="lf over"><span className="ln">!</span><div><b>영어 시험일 없음</b><small>교재 보류가 안 생깁니다</small></div>
      <input type="date" value={eng} onChange={(x) => setEng(x.target.value)} aria-label="영어 시험일" style={{ width: "auto" }} /><button className="btn sm pri" type="button" disabled={pending || !eng} data-act="english-save" onClick={() => run(() => englishOnAct(e.id, eng), "영어 시험일을 넣었습니다. 교재 보류 창이 섰습니다")}>넣기</button></div>}
    <div className="rng" data-g="rng">
      {!groups.length && <span className="note" style={{ margin: 0 }} data-g="no-scope">범위가 아직 없습니다</span>}
      {groups.map((g) => <span key={g.key} className={"rg1" + (g.state === "add" ? " add" : g.state === "del" ? " del" : "")} data-g="scope" data-state={g.state}>{g.state === "del" ? <s>{g.title}</s> : <b>{g.title}</b>}<i>{g.sub}</i>
        {g.state !== "del" && <button className="btn sm" type="button" disabled={pending} data-act="scope-remove" style={{ marginTop: 4 }} onClick={() => run(() => removeScopeAct(g.liveIds), "학교가 뺀 것으로 적었습니다(지우지 않습니다)")}>학교가 뺌</button>}</span>)}
    </div>
    <div className="lf"><span className="ln">+</span><div><b>범위 더하기</b></div>
      <button className="btn sm pri" type="button" data-act="scope-open" aria-pressed={open} onClick={() => setOpen(!open)}>+ 범위</button></div>
    {open && <ScopeForm examId={e.id} books={b.books ?? []} pending={pending} run={run} onDone={() => setOpen(false)} />}
    <div className="lf" style={{ marginTop: 8 }} data-g="stop-line"><span className="ln">⏸</span>
      <div><b>교재 보류</b><small>{st ? `${st.text} · ${weeks}주 전부터(${LEVEL_NAME[e.level] ?? "학교급"} 기본값)` : e.english_on ? "규칙 줄이 없습니다. prep.stop_weeks(0122)" : "영어 시험일이 있어야 섭니다"}</small></div>
      <span className="tag" data-g="stopped">멈춘 교재 {e.stopped ?? 0}</span>
      <button className="btn sm" type="button" disabled={pending || !e.english_on} data-act="stop-now" onClick={() => run(() => stopNowAct(e.id), stopDone)}>지금 보류</button>
      <button className="btn sm" type="button" disabled={pending} data-act="release" onClick={() => run(() => releaseAct(e.id), releaseDone)}>풀기</button></div>
    <div className="wv" style={{ marginTop: 8 }} data-g="skip-line"><span className="fl" style={{ margin: 0 }}>안 봄</span>
      {(e.skips ?? []).map((k) => <span key={k.student_id} className="tag" style={MISS} data-g="skip-tag">{k.name} <button className="btn sm" type="button" disabled={pending} data-act="unskip" onClick={() => run(() => skipAct(e.id, k.student_id, false), `${k.name} · 다시 봅니다`)}>본다</button></span>)}
      <select value={skipPick} onChange={(x) => setSkipPick(x.target.value)} aria-label="안 볼 아이" data-g="skip-pick" style={{ width: "auto" }}><option value="">아이 고르기</option>{pickable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="btn sm" type="button" disabled={pending || !skipPick} data-act="skip" onClick={() => run(() => skipAct(e.id, skipPick, true), `${stName(skipPick)} · 안 봄(대비·알림·보류에서 빠집니다)`, () => setSkipPick(""))}>안 봄</button>
      {pickable.length > 1 && <button className="btn sm" type="button" disabled={pending} data-act="skip-all" onClick={() => run(() => skipAllAct(e.id, pickable.map((s) => s.id)), (r) => `${r.n}명 · 안 봄(대비·알림·보류에서 빠집니다 · 한 명씩 「본다」로 되돌립니다)`, () => setSkipPick(""))}>남은 {pickable.length}명 다 안 봄</button>}
      {pickable.length === 1 && <button className="btn sm" type="button" disabled={pending} data-act="skip-all" onClick={() => run(() => skipAllAct(e.id, pickable.map((s) => s.id)), (r) => `${r.n}명 · 안 봄(대비·알림·보류에서 빠집니다 · 「본다」로 되돌립니다)`, () => setSkipPick(""))}>남은 1명 다 안 봄</button>}</div>
  </div>;
}
/** (저) 「📡 날짜 바뀜 M/D~M/D → M/D~M/D · 봤음」 · 나이스가 기간을 옮긴 회차(0152 · 확정-69) · 학교 카드와 전국 줄이 같은 꼬리표 · 영어 시험일이 있으면 「다시 보기」(안 건드렸다) */
function ChangedTag({ e, pending, run }) {
  if (!dateChanged(e)) return null;
  return <span className="tag act" data-g="changed">📡 날짜 바뀜 {changeText(e)}{e.english_on ? " · 영어 시험일 다시 보기" : ""} <button className="btn sm" type="button" disabled={pending} data-act="change-seen" onClick={() => run(() => changeSeenAct(e.id), "봤음 · 대시보드에서 내려갑니다(이전 기간은 남습니다)")}>봤음</button></span>;
}
function StopCard({ b, today, pending, run }) {
  const [sid, setSid] = useState(""); const [w, setW] = useState("");
  const custom = (b.students ?? []).filter((s) => s.stop_weeks != null);
  return <div className="exr" style={{ marginTop: 8 }} data-g="stop-card">
    <div className="exh"><span className="ai">⏸</span><b>교재 보류</b><span className="spacer" /></div>
    <div className="left">
      {LEVELS.map((lv) => { const cur = b.rules?.[`prep.stop_weeks.${lv}`]; return <div key={lv} className="lf ok"><span className="ln">{lv === "high" ? "🎓" : lv === "middle" ? "🏫" : "🏠"}</span><div><b>{LEVEL_NAME[lv]}</b><small>{cur == null ? "규칙 줄이 없습니다(0122)" : "기본값"}</small></div>
        <div className="seg sm" data-g={`weeks-${lv}`}>{WEEK_CHOICES.map((n) => <button key={n} type="button" aria-pressed={String(cur) === String(n)} disabled={pending} onClick={() => run(() => stopWeeksAct(lv, n), `${LEVEL_NAME[lv]} ${n}주 · 앞으로의 시험에 다시 맞췄습니다`)}>{n}주</button>)}</div></div>; })}
      <div className="lf"><span className="ln">🧑‍🎓</span><div><b>아이만 따로</b><small>학교급 기본값 대신 이 아이만 · {custom.length ? custom.map((s) => `${s.name} ${s.stop_weeks}주`).join(" · ") : "따로 정한 아이 없음"}</small></div>
        <select value={sid} onChange={(x) => setSid(x.target.value)} aria-label="아이" data-g="weeks-student" style={{ width: "auto" }}><option value="">아이 고르기</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={w} onChange={(x) => setW(x.target.value)} aria-label="주 수" data-g="weeks-n" style={{ width: "auto" }}><option value="">기본값</option>{WEEK_CHOICES.map((n) => <option key={n} value={n}>{n}주</option>)}</select>
        <button className="btn sm pri" type="button" disabled={pending || !sid} data-act="student-weeks" onClick={() => run(() => studentWeeksAct(sid, w || null), w ? `${w}주로 따로 정했습니다` : "학교급 기본값으로 돌렸습니다")}>저장</button></div>
      
    </div>
  </div>;
}
