"use client";
/** 범위 고르기 한 벌((어21) · 원칙-1) — 06b 학교 시험 카드와 01 오늘 수업의 「내신 자료」 업무가 **같은 부품**을 쓴다. 손은 scopeAct 하나.
 *  넣으면 **그 학교 시험**에 붙는다(아이 것이 아니다 — 「시험은 학교에 붙는다」 원장님 9/14). 교재 목록만 부르는 쪽이 준다(06b 는 시험 보는 아이들 것 · 01 은 이 아이 것) */
import { useState } from "react";
import { scopeAct, unitsAct } from "../schedule/exams/actions.js";
import { unitsByChapter } from "@/lib/exam-plan";
export default function ScopeForm({ examId, books = [], pending, run, onDone }) {
  const [bookId, setBookId] = useState(""); const [units, setUnits] = useState([]); const [picked, setPicked] = useState({}); const [note, setNote] = useState("");
  const chapters = unitsByChapter(units);
  const pickBook = (id) => { setBookId(id); setUnits([]); setPicked({}); if (id) run(async () => { const r = await unitsAct(id); if (r.ok) setUnits(r.units); return r; }); };
  const chosen = chapters.filter((ch) => picked[ch.chapter]).flatMap((ch) => ch.units.map((u) => u.id));
  return (<div className="card" style={{ marginTop: 8 }} data-g="scope-form">
    <div className="wv"><select value={bookId} onChange={(x) => pickBook(x.target.value)} aria-label="교재" data-g="scope-book" style={{ width: "auto" }}><option value="">교재 고르기</option>{books.map((bk) => <option key={bk.id} value={bk.id}>{bk.name}{bk.area ? ` · ${bk.area}` : ""}</option>)}</select>
      <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="글로 적는 범위 (예: 2409 학평 22-24)" aria-label="글로 적는 범위" style={{ flex: "1 1 200px" }} /></div>
    {bookId && !units.length && <p className="note">단원을 읽는 중…</p>}
    {chapters.length > 0 && <div className="left" style={{ marginTop: 8 }}>{chapters.map((ch) => <label key={ch.chapter} className="ckl" data-g="scope-chapter"><input type="checkbox" className="ck" checked={Boolean(picked[ch.chapter])} onChange={(x) => setPicked({ ...picked, [ch.chapter]: x.target.checked })} /> <b>{ch.chapter}</b> <small>소단원 {ch.units.length} · {ch.units.slice(0, 4).map((u) => u.short ?? u.sub).join(" · ")}{ch.units.length > 4 ? " …" : ""}</small></label>)}</div>}
    <div className="wv" style={{ marginTop: 8 }}><button className="btn pri sm" type="button" disabled={pending || (!chosen.length && !note.trim())} data-act="scope-save" onClick={() => run(() => scopeAct(examId, { unitIds: chosen, freeNote: note }), (r) => `범위를 더했습니다. ${r.added}줄${r.already ? ` · 이미 있던 것 ${r.already}` : ""}`, () => { setPicked({}); setNote(""); onDone?.(); })}>더하기</button><button className="btn sm" type="button" onClick={() => onDone?.()}>닫기</button></div>
  </div>);
}
