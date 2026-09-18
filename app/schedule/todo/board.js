"use client";
/** 내 업무 판(목업 05 · 노션 보드 모양 9/3) · 머리(🔥 마감 지남 · 학교 거르개) · 보기줄(⊞표 · ▦보드 · 묶기 고정 · 새로 만들기 한 곳 · 차례는 늘 마감 순, 어9·대전제-14) · 보드(종류마다 칸 · 카드 📅🏫☑🧾) · 숨긴 그룹(✓ 끝냄 · ♻️ 이미 있는 것 · 뺀 것) ·
 *  📦 자료 하나 안에서만 순서 · 🔥 못 따라갑니다 — 줄이기 · 저장줄. 카드 목록은 한 번 세고(cardsOf) 표·보드가 같은 목록을 그린다 — 보기를 바꿔도 조회 0(속도-1 예외). 세는 것은 lib/todo-plan 한 벌 */
import Link from "next/link";
import Sibs from "@/app/_shell/sibs";
import { useMemo, useState, useTransition } from "react";
import QuickMemo from "../../_shell/quickmemo.js";   // (어78) 📌 퀵 메모 한 벌 — 상단 띠와 05 가 같은 부품(원칙-1)
import { usePick, PickAll, PickGroup, PickBox, PickBar } from "../../_shell/pick.js";   /* 고르기 한 벌((어28)-③ · 대전제-20) */
import { useRouter } from "next/navigation";
import { doneAct, undoAct, dueAct, dropAct, manyAct, unitTestAct, unitTestMadeAct, unitTestDueAct, repeatAct, repeatActiveAct, printAllAct, dropMaterialAct, quizPaperAct, scoredAct , restoreAct, addKindAct, editKindAct, dropKindAct, restoreKindAct, kindOrderAct, moveKindAct } from "./actions.js";
import { cardsOf, filterSchool, sortCards, columnsOf, hiddenOf, counts, behindOf, printAllOf, dueLine, isOverdue, kindName, kindList, SHOW_ON, schoolTag, flowOf, repeatText, monthDay, REPEAT_EVENTS, stepTodoOf, filterMaterials, onlyText } from "@/lib/todo-plan";
import { examOn } from "@/lib/exam-plan";
import { ACT } from "@/lib/emoji";
import { icon } from "@/app/_shell/icon.js";   // (어80) 아이콘만 있는 손의 이름·툴팁 한 벌
const WD = ["일", "월", "화", "수", "목", "금", "토"];
/** (어80) 분류 색 — 목업 CSS 의 칸 색 그대로(nb-*). 「기본」은 색 없음 */
const COLORS = [["", "기본"], ["nb-orange", "주황"], ["nb-blue", "파랑"], ["nb-yellow", "노랑"], ["nb-green", "초록"], ["nb-red", "빨강"]];
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date;
  const [editing, setEditing] = useState(null);   // (어80) ✎ 로 고치는 카드 — 그 자리에서 편다(대전제-22)
  const kinds = d.kinds ?? null;   // (어80) 분류 표 줄 · null 이면 0179 를 아직 안 붙이신 DB 라 분류를 고치는 자리를 감춘다(대전제-27)
  const klist = useMemo(() => kindList(kinds), [kinds]);
  const [kindOpen, setKindOpen] = useState(null);   // null · "new" · 그 분류 열쇠 — 그 자리에서 편다(대전제-22)
  const [kf, setKf] = useState({ name: "", cls: "", showOn: "todo" }); const [moveTo, setMoveTo] = useState("");
  const [view, setView] = useState("board"); const [school, setSchool] = useState("all"); const [show, setShow] = useState({}); const [sel, setSel] = useState(null); const [nw, setNw] = useState(null); const [printing, setPrinting] = useState(false); const [behindOpen, setBehindOpen] = useState(null);
  const [ut, setUt] = useState({ studentId: "", topicId: "", qCount: "25" }); const [rp, setRp] = useState({ name: "", every: "month", day: "25", weekday: "1", lead: String(b.rules?.["todo.repeat_lead"] ?? 3), days: "7", left: "5" });
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const all = useMemo(() => cardsOf(b), [b]);                       // 한 번 센다 — 보기·거르개·차례는 이 목록을 다르게 그릴 뿐(재조회 0)
  const [only, setOnly] = useState(d.only ?? []);   // 04 「단계 👉」 — 그 자료만((가)-④) · 「전체 보기 ✕」로 푼다
  const cards = useMemo(() => sortCards(filterSchool(filterMaterials(all, only), school), "due"), [all, only, school]);   // (어10) 늘 마감 순 — 「만든 순」으로 보실 날이 없어 단추를 뺐다(대전제-14)
  const todoIds = useMemo(() => cards.filter((x) => x.todoId).map((x) => x.id), [cards]); const pk = usePick(todoIds);   /* 고른 업무 줄(자료 단계 카드는 ☑ 로 · 여기선 안 고른다) */
  const pickedCards = cards.filter((x) => pk.has(x.id)), toDone = pickedCards.filter((x) => x.state !== "done"), toUndo = pickedCards.filter((x) => x.state === "done"), toRestore = pickedCards.filter((x) => x.state === "dropped");   /* (어80) 복구 — 뺀 것만 */ const [dueTo, setDueTo] = useState("");
  const cols = columnsOf(cards, today, kinds), hidden = hiddenOf(cards), c = counts(cards, today), behind = behindOf(cards, today, parseInt(b.rules?.["todo.behind_per_day"] ?? "1", 10) || 1), pa = printAllOf(cards);
  const selCard = (sel ? all.find((x) => x.id === sel) : only.length ? all.find((x) => only.includes(x.material?.id)) : null) ?? null;   // 자료만 걸러 열었으면 📦 흐름도 그 자료로
  const schools = b.schools ?? [];
  const schoolPick = (v) => setSchool(v);
  const openKind = (col) => { const key = col ? col.kind : "new"; if (kindOpen === key) { setKindOpen(null); return; } setKindOpen(key); setKf(col ? { name: col.name, cls: col.cls ?? "", showOn: col.showOn ?? "todo" } : { name: "", cls: "", showOn: "todo" }); };
  /** (어80) 분류 한 벌 — 넣기와 수정이 **같은 양식**이다(원칙-1 · 대전제-19). 지우지 않고 내린다(대전제-6)이라 「삭제」는 state=off 고, 「복구」가 짝이다 */
  const kindForm = (col) => <div data-g="kind-form" data-kind={col ? col.kind : "new"} style={{ marginTop: 4 }} onClick={(x) => x.stopPropagation()}>
    <input value={kf.name} aria-label="분류 이름" placeholder="학교 행사" onChange={(x) => setKf({ ...kf, name: x.target.value })} style={{ width: "100%" }} />
    <div className="seg sm" data-g="kind-cls" style={{ marginTop: 4 }}>{COLORS.map(([v, nm]) => <button key={v || "none"} type="button" data-cls={v} aria-pressed={kf.cls === v} onClick={() => setKf({ ...kf, cls: v })}>{nm}</button>)}</div>
    <div className="seg sm" data-g="kind-where" style={{ marginTop: 4 }}>{SHOW_ON.map(([v, nm]) => <button key={v} type="button" data-where={v} aria-pressed={kf.showOn === v} onClick={() => setKf({ ...kf, showOn: v })}>{nm}</button>)}</div>
    <div className="wv" style={{ marginTop: 4, gap: 4 }}>
      <button className="btn pri sm" type="button" disabled={pending || !kf.name.trim()} data-act={col ? "kind-save" : "kind-add"} onClick={() => run(() => (col ? editKindAct(col.kind, kf) : addKindAct(kf)), col ? "수정했어요" : `분류 ✓ · ${kf.name.trim()}`, () => setKindOpen(null))}>{col ? "수정" : "넣기"}</button>
      {col && <><button className="btn sm icb" type="button" disabled={pending} data-act="kind-up" {...icon("앞으로")} onClick={() => run(() => kindOrderAct(col.kind, -1), "앞으로 ✓")}>◀</button>
        <button className="btn sm icb" type="button" disabled={pending} data-act="kind-down" {...icon("뒤로")} onClick={() => run(() => kindOrderAct(col.kind, 1), "뒤로 ✓")}>▶</button></>}
      {col && !col.app && col.state === "active" && <button className="btn sm gho" type="button" disabled={pending} data-act="kind-drop" onClick={() => run(() => dropKindAct(col.kind), `삭제 ✓ · ${col.name}`, () => setKindOpen(null))}>삭제</button>}
      {col && col.state === "off" && <button className="btn sm" type="button" disabled={pending} data-act="kind-restore" onClick={() => run(() => restoreKindAct(col.kind), `복구 ✓ · ${col.name}`)}>{ACT.restore} 복구</button>}
      <span className="spacer" /><button className="btn sm gho" type="button" data-act="kind-cancel" onClick={() => setKindOpen(null)}>취소</button>
    </div></div>;
  const Card = ({ c }) => <div className={"nb-card" + (isOverdue(c, today) ? " nb-hot" : "") + (c.state === "done" ? " nb-done" : "")} data-g="card" data-kind={c.kind} data-state={c.state} data-id={c.id} onClick={() => setSel(c.id)} aria-pressed={sel === c.id}>
    {c.todoId ? <PickBox pick={pk} id={c.id} label={`${c.title} 고르기`} /> : null}<span className="nb-title">{c.title}{c.extra ? <span className="tag" style={{ marginLeft: 6 }}>{c.extra}</span> : null}</span>
    <div className={"nb-prop" + (isOverdue(c, today) ? " nb-over" : "")}><span className="nb-pi">📅</span><span className="nb-pv" data-g="due">{c.startOn ? `${monthDay(c.startOn)} 부터 · ` : ""}{dueLine(c, today)}</span></div>
    {c.files?.length > 0 && <div className="nb-prop"><span className="nb-pi">📎</span><span className="nb-pv" data-g="card-files">{c.files.map((f) => <a key={f.id} className="tag" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" style={{ marginRight: 4 }}>{f.name}</a>)}</span></div>}{/* (어78) 붙인 것이 안 보이면 화면이 거짓말한다(대전제-0) */}
    {(c.school || c.n != null) && <div className="nb-prop"><span className="nb-pi">🏛️</span><span className="nb-pv">{c.school && <span className={"nb-pill " + (c.level === "high" ? "nb-blue" : c.level === "middle" ? "nb-green" : "")}>{schoolTag(c)}</span>}{c.n != null && <span className="nb-pill">{c.kind === "print" ? `${c.pages}장 · ` : ""}{c.n}명</span>}</span></div>}
    {c.checks && <div className="nb-prop"><span className="nb-pi">☑</span><span className="nb-pv" data-g="checks">{c.checks.map((s) => { const tid = stepTodoOf(all, c.material?.id, s.step); return <button key={s.step} type="button" className={"nb-check" + (s.done ? " nb-done" : "")} data-step={s.step} data-done={s.done ? "1" : "0"} disabled={pending || !tid} style={{ border: 0, background: "none", padding: 0, font: "inherit", cursor: tid ? "pointer" : "default" }} onClick={(x) => { x.stopPropagation(); if (!tid) return; run(() => (s.done ? undoAct(tid) : doneAct(tid)), s.done ? `${s.name} 취소 · 카드가 제 칸으로 돌아갑니다` : `${s.name} ✓ · 카드가 다음 칸으로 갑니다`); }}><i>{s.done ? "✓" : "·"}</i>{s.name}{s.text ? ` ${s.text}` : ""}</button>; })}</span></div>}
    {c.kind === "solve" && <div className="nb-prop"><span className="nb-pi">✍️</span><span className="nb-pv" data-g="submit">제출 {c.submitted ?? 0}/{c.n}{c.waiting?.length ? ` · 아직: ${c.waiting.join(", ")}` : " · 다 냈습니다"}</span></div>}
    {c.kind === "grade" && <div className="nb-prop"><span className="nb-pi">✅</span><span className="nb-pv" data-g="grade" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>채점 {c.scored ?? 0}/{c.n}{(c.toGrade ?? []).map((s) => <button key={s.id} type="button" className="btn sm pri" data-act="scored" data-student={s.id} disabled={pending} onClick={(x) => { x.stopPropagation(); run(() => scoredAct(c.material.id, s.id, true), `채점 ✓ · ${s.name}`); }}>{s.name} ✓</button>)}{(c.graded ?? []).map((s) => <button key={s.id} type="button" className="btn sm" data-act="unscored" data-student={s.id} disabled={pending} onClick={(x) => { x.stopPropagation(); run(() => scoredAct(c.material.id, s.id, false), `채점 취소 · ${s.name}`); }}>{s.name} 채점함</button>)}</span></div>}
    {c.book && <div className="nb-prop"><span className="nb-pi">📚</span><span className="nb-pv">{c.book}</span></div>}
    {c.style && <div className="nb-prop"><span className="nb-pi">🧪</span><span className="nb-pv">{c.style}</span></div>}
    {c.kind === "score" && <div className="nb-prop"><span className="nb-pi">👧</span><span className="nb-pv">아이가 넣습니다</span></div>}
    {c.why && c.kind !== "score" && <div className="nb-prop"><span className="nb-pi">🧾</span><span className="nb-pv">{c.why}</span></div>}
    {c.note && <div className="nb-prop"><span className="nb-pi">✎</span><span className="nb-pv">{c.note}</span></div>}
    <div className="wv" style={{ marginTop: 6, gap: 4 }}>
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm pri" type="button" disabled={pending} data-act="done" onClick={(x) => { x.stopPropagation(); run(() => doneAct(c.todoId), `끝냈습니다. ${c.title}`); }}>✓ 끝냄</button>}
      {c.todoId && !c.material && (c.state === "todo" || c.state === "doing") && <button className="btn sm gho icb" type="button" disabled={pending} data-act="card-edit" {...icon("수정")} onClick={(x) => { x.stopPropagation(); setEditing(editing === c.id ? null : c.id); }}>{ACT.edit}</button>}{/* (어80) 원장님 2026-09-18 「입력한 세부내용자체도 추가수정삭제가 안됨」 */}
      {c.todoId && c.state === "dropped" && <button className="btn sm" type="button" disabled={pending} data-act="restore" onClick={(x) => { x.stopPropagation(); run(() => restoreAct(c.todoId), `복구 ✓ · ${c.title}`); }}>{ACT.restore} 복구</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={(x) => { x.stopPropagation(); run(() => dropAct(c.todoId, "05 에서 뺌"), "뺐습니다(지우지 않았습니다)"); }}>빼기</button>}
      {c.todoId && (c.state === "done" || c.state === "dropped") && <button className="btn sm" type="button" disabled={pending} data-act="undo" onClick={(x) => { x.stopPropagation(); run(() => undoAct(c.todoId), "되돌렸습니다"); }}>되돌리기</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <input type="date" className="dt" value={c.due ?? ""} aria-label={`${c.title} 마감`} onClick={(x) => x.stopPropagation()} onChange={(x) => run(() => dueAct(c.todoId, x.target.value), "마감을 바꿨습니다")} style={{ width: "auto" }} />}
      {c.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={(x) => { x.stopPropagation(); run(() => unitTestMadeAct(c.unitTestId), "출제했습니다. 오늘 수업 카드에 섭니다"); }}>출제 완료</button>}
      {c.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={(x) => { x.stopPropagation(); run(() => unitTestDueAct(c.dueUnitTest), "출제했습니다. 오늘 수업 카드에 섭니다(같은 것은 다시 안 생깁니다)"); }}>출제 완료</button>}
      {c.quizId && !c.paperAt && <button className="btn sm pri" type="button" disabled={pending} data-act="paper" onClick={(x) => { x.stopPropagation(); run(() => quizPaperAct(c.quizId, true), "재시험지 만들었음 · 시험을 보면 카드가 사라집니다"); }}>🖨 재시험지 만들었음</button>}
      {c.quizId && c.paperAt && <><span className="tag on" data-g="paper">🖨 종이 ✓</span><button className="btn sm" type="button" disabled={pending} data-act="paper-undo" onClick={(x) => { x.stopPropagation(); run(() => quizPaperAct(c.quizId, false), "무렀습니다"); }}>취소</button></>}
      {c.quizId && <Link prefetch={false} className="btn sm" href="/today" onClick={(x) => x.stopPropagation()}>오늘 수업 👉</Link>}
      {c.kind === "score" && <Link prefetch={false} className="btn sm" href={`/scores?e=${c.examId}`} onClick={(x) => x.stopPropagation()}>📈 성적 👉</Link>}
      {c.exam && c.material && <Link prefetch={false} className="btn sm" href={`/schedule/exams/prep?e=${c.exam.id}`} onClick={(x) => x.stopPropagation()}>📄 자료 👉</Link>}
    </div>
    {editing === c.id && <div data-g="card-edit-form" onClick={(x) => x.stopPropagation()} style={{ marginTop: 6 }}>
      <QuickMemo inline edit={c} students={b.students ?? []} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
    </div>}{/* (어80) 넣기 양식이 그대로 **고치기** 양식이다(원칙-1) · 그 자리에서 편다(대전제-22) */}
  </div>;
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <PickAll pick={pk} /><span className="pill" style={{ fontWeight: 700 }} data-g="count">내 업무 {c.open}</span>
      <span className={"pill" + (c.overdue ? " warn" : "")} data-g="overdue">🔥 마감 지남 {c.overdue}</span>
      {only.length > 0 && <span className="pill warn" data-g="only">📄 {onlyText(all, only)} 만 <button type="button" className="lnk" data-act="only-off" onClick={() => { setOnly([]); router.replace("/schedule/todo"); }}>전체 보기 ✕</button></span>}
      <span className="spacer" />
      {schools.length <= 2 ? <div className="seg sm" data-g="school">{[["all", "전체"], ...schools.map((s) => [s.id, s.name.replace(/(중학교|고등학교|초등학교)$/, (m) => ({ 중학교: "중", 고등학교: "고", 초등학교: "초" })[m])]), ["none", "내신 아닌 것"]].map(([k, nm]) => <button key={k} type="button" aria-pressed={school === k} onClick={() => schoolPick(k)}>{nm}</button>)}</div>
        : <select value={school} aria-label="학교" data-g="school" onChange={(x) => schoolPick(x.target.value)} style={{ width: "auto" }}><option value="all">전체</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="none">내신 아닌 것</option></select>}
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <PickBar pick={pk} unit="개">{/* (어28)-③ 고른 업무에 한 번에 · 완료 · 되돌리기 · 미루기(날짜) · 내림(지우지 않는다) */}
      <button type="button" className="btn sm pri" disabled={pending || !toDone.length} data-act="done-picked" onClick={() => run(() => manyAct(toDone.map((x) => x.todoId), "done"), (r) => `${r.n}개 끝냈습니다`, pk.clear)}>✓ 완료 {toDone.length}</button>
      <button type="button" className="btn sm" disabled={pending || !toUndo.length} data-act="undo-picked" onClick={() => run(() => manyAct(toUndo.map((x) => x.todoId), "undo"), (r) => `${r.n}개 되돌렸습니다`, pk.clear)}>↩ 되돌리기 {toUndo.length}</button>
      <input type="date" className="dt" value={dueTo} aria-label="미룰 마감" onChange={(e) => setDueTo(e.target.value)} style={{ width: "auto" }} />
      <button type="button" className="btn sm" disabled={pending || !dueTo || !pickedCards.length} data-act="due-picked" onClick={() => run(() => manyAct(pickedCards.map((x) => x.todoId), "due", dueTo), (r) => `${r.n}개 마감을 ${dueTo} 로`, () => { pk.clear(); setDueTo(""); })}>📅 미루기</button>
      <button type="button" className="btn sm" disabled={pending || !toRestore.length} data-act="restore-picked" onClick={() => run(() => manyAct(toRestore.map((x) => x.todoId), "restore"), (r) => `복구 ✓ · ${r.n}개`, pk.clear)}>{ACT.restore} 복구 {toRestore.length}</button>
      <select value={moveTo} aria-label="옮길 분류" onChange={(e) => setMoveTo(e.target.value)} style={{ width: "auto" }}><option value="">분류</option>{klist.filter((k) => k.state === "active").map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}</select>
      <button type="button" className="btn sm" disabled={pending || !moveTo || !pickedCards.length} data-act="move-kind" onClick={() => run(() => moveKindAct(pickedCards.map((x) => x.todoId), moveTo), (r) => `옮김 ✓ · ${r.n}개`, () => { pk.clear(); setMoveTo(""); })}>↔ 분류 옮기기</button>{/* (어80) 원장님 「세부내용의 일괄처리 · 분류 옮기기가능하게」 */}
      <button type="button" className="btn sm gho" disabled={pending || !pickedCards.length} data-act="drop-picked" onClick={() => run(() => manyAct(pickedCards.map((x) => x.todoId), "drop"), (r) => `${r.n}개 내렸습니다(지우지 않습니다)`, pk.clear)}>내림 {pickedCards.length}</button>
    </PickBar>
    <div className="wv" style={{ margin: "0 0 8px" }}><span className="spacer" /><Sibs here="/schedule/todo" /></div>
    <div className="card" data-g="quick-card" style={{ marginBottom: 8 }}><QuickMemo inline students={b.students ?? []} /></div>{/* (어78) 원장님 2026-09-17 「업무페이지 상단에 바로 내용입력할 수 있게, 현재는 1클릭필요함」 — 상단 띠 📌 와 **같은 부품**이다(원칙-1) */}
    <div className="nb-viewbar" data-g="viewbar">
      <button type="button" className="nb-tab" aria-current={view === "table"} data-act="view-table" onClick={() => setView("table")}><span className="nb-ic">⊞</span>표</button>
      <button type="button" className="nb-tab" aria-current={view === "board"} data-act="view-board" onClick={() => setView("board")}><span className="nb-ic">▦</span>보드</button>
      <div className="nb-tools">
        <span className="nb-tool nb-on">묶기: 업무 종류 · 고정</span>
        <button type="button" className="nb-new" data-act="new-open" onClick={() => setNw(nw ? null : "menu")}>새로 만들기 ⌄</button>
      </div>
    </div>
    {nw === "menu" && <div className="card" data-g="new-menu" style={{ marginTop: 8 }}><div className="wv">
      <span className="fl" style={{ margin: 0 }}>새로 만들기</span>
      <button className="btn sm" type="button" data-act="new-material" onClick={() => setNw("material")}>📄 자료</button>
      <button className="btn sm" type="button" data-act="new-unit-test" onClick={() => setNw("unit_test")}>✍️ 단원평가 출제</button>
      <button className="btn sm" type="button" data-act="new-repeat" onClick={() => setNw("repeat")}>⏰ 반복</button>
      <span className="spacer" /><button className="btn sm" type="button" onClick={() => setNw(null)}>닫기</button></div></div>}
    {nw === "material" && <div className="card" data-g="new-material" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">📄</span>자료 · 시험 고르기</div>
      <div className="tags">{(b.exams_soon ?? []).map((e) => <Link prefetch={false} key={e.id} className="tag on" href={`/schedule/exams/prep?e=${e.id}`}>{e.school ?? "전국"} {e.name} · {monthDay(examOn(e))} · 자료 {e.materials}</Link>)}{!(b.exams_soon ?? []).length && <span className="note" style={{ margin: 0 }}>다가오는 시험 없음 · 🗓️ 학교 시험</span>}</div></div>}
    {nw === "unit_test" && <div className="card" data-g="new-unit-test" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">✍️</span>단원평가 출제</div>
      <div className="wv"><select value={ut.studentId} aria-label="아이" onChange={(x) => setUt({ ...ut, studentId: x.target.value })} style={{ width: "auto" }}><option value="">아이</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.school ? ` · ${s.school}` : ""}</option>)}</select>
        <select value={ut.topicId} aria-label="문법 분류" onChange={(x) => setUt({ ...ut, topicId: x.target.value })} style={{ width: "auto" }}><option value="">문법 분류</option>{(b.topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="text" inputMode="numeric" className="scr" value={ut.qCount} aria-label="문항 수" onChange={(x) => setUt({ ...ut, qCount: x.target.value.replace(/\D/g, "") })} />
        <button className="btn pri sm" type="button" disabled={pending || !ut.studentId || !ut.topicId} data-act="unit-test-save" onClick={() => run(() => unitTestAct({ studentId: ut.studentId, topicId: ut.topicId, qCount: Number(ut.qCount) || 25 }), "낼 것으로 섰습니다. 출제하면 「출제 완료」를 누르세요", () => { setNw(null); setUt({ studentId: "", topicId: "", qCount: "25" }); })}>저장</button></div></div>}
    {nw === "repeat" && <div className="card" data-g="new-repeat" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">⏰</span>반복</div>
      <div className="wv"><input type="text" value={rp.name} placeholder="수납 안내 보내기" aria-label="반복 이름" onChange={(x) => setRp({ ...rp, name: x.target.value })} style={{ flex: "1 1 200px" }} />
        <div className="seg sm" data-g="every"><button type="button" aria-pressed={rp.every === "month"} onClick={() => setRp({ ...rp, every: "month" })}>매달</button><button type="button" aria-pressed={rp.every === "week"} onClick={() => setRp({ ...rp, every: "week" })}>매주</button>{REPEAT_EVENTS.map(([k, name]) => <button key={k} type="button" aria-pressed={rp.every === k} onClick={() => setRp({ ...rp, every: k })}>{name}</button>)}</div>
        {rp.every === "month" && <input type="text" inputMode="numeric" className="scr" value={rp.day} aria-label="며칠" onChange={(x) => setRp({ ...rp, day: x.target.value.replace(/\D/g, "") })} />}
        {rp.every === "week" && <select value={rp.weekday} aria-label="요일" onChange={(x) => setRp({ ...rp, weekday: x.target.value })} style={{ width: "auto" }}>{WD.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>}
        {rp.every === "new_student" && <><label className="fl" style={{ margin: 0 }}>들어온 지</label><input type="text" inputMode="numeric" className="scr" value={rp.days} aria-label="들어온 지 며칠" onChange={(x) => setRp({ ...rp, days: x.target.value.replace(/\D/g, "") })} /><span className="note" style={{ margin: 0 }}>일 · 아이마다 한 번(학생 14 의 들어온 날)</span></>}
        {rp.every === "book_ending" && <><label className="fl" style={{ margin: 0 }}>남은 소단원</label><input type="text" inputMode="numeric" className="scr" value={rp.left} aria-label="남은 소단원" onChange={(x) => setRp({ ...rp, left: x.target.value.replace(/\D/g, "") })} /><span className="note" style={{ margin: 0 }}>개 이하 · 아이·교재·회독마다 한 번</span></>}
        {rp.every !== "book_ending" && <><label className="fl" style={{ margin: 0 }}>며칠 전부터</label><input type="text" inputMode="numeric" className="scr" value={rp.lead} aria-label="며칠 전부터" onChange={(x) => setRp({ ...rp, lead: x.target.value.replace(/\D/g, "") })} /></>}
        <button className="btn pri sm" type="button" disabled={pending || !rp.name.trim()} data-act="repeat-save" onClick={() => run(() => repeatAct(rp), (r) => `반복 규칙을 넣었습니다${r.made ? ` · 오늘 걸리는 것 ${r.made}건이 섰습니다` : ""}`, () => { setNw(null); setRp({ ...rp, name: "" }); })}>저장</button></div>
      {(b.repeats ?? []).length > 0 && <div className="tags" data-g="repeat-rules" style={{ marginTop: 6 }}>{b.repeats.map((r) => <span key={r.id} className={"tag" + (r.active ? " on" : "")}>{r.name} · {repeatText(r.threshold ?? {})}<button className="lnk" type="button" style={{ marginLeft: 6 }} data-act="repeat-toggle" onClick={() => run(() => repeatActiveAct(r.id, !r.active), r.active ? "멈췄습니다" : "다시 돕니다")}>{r.active ? "보류" : "켬"}</button></span>)}</div>}</div>}
    {view === "board" && <div className="nb-board" data-g="board">
      {cols.map((col) => <div className="nb-col" key={col.kind} data-g="col" data-kind={col.kind}>
        <div className="nb-colh"><PickGroup pick={pk} ids={col.cards.filter((x) => x.todoId).map((x) => x.id)} label="" />{/* (어80) 원장님 2026-09-18 「전체선택버튼이 없음」 — 칸마다 그 칸만 집는다(20 올린 기록과 같은 부품) */}
          <span className={"nb-pill " + col.cls}>{col.name}</span><span className="nb-cnt" data-g="col-count">{col.count}</span>
          {col.state === "off" && <span className="tag" data-g="col-off">삭제됨</span>}
          {kinds && <button className="btn sm gho icb" type="button" disabled={pending} data-act="kind-edit" aria-pressed={kindOpen === col.kind} {...icon("분류 수정")} onClick={() => openKind(col)}>{ACT.edit}</button>}</div>
        {kindOpen === col.kind && kindForm(col)}
        {col.cards.map((x) => <Card key={x.id} c={x} />)}
        {!col.cards.length && <p className="note" style={{ margin: "4px 0 0" }}>없음</p>}
        {col.kind === "print" && pa.list.length > 0 && <button className="nb-add" type="button" disabled={pending} data-act="print-all" onClick={() => setPrinting(true)}>🖨 {pa.pages}장 뽑기</button>}
      </div>)}
      {kinds && <div className="nb-col" data-g="kind-new">
        <div className="nb-colh"><button className="nb-add" type="button" disabled={pending} data-act="kind-open-new" aria-pressed={kindOpen === "new"} onClick={() => openKind(null)}>+ 분류</button></div>
        {kindOpen === "new" && kindForm(null)}
      </div>}{/* (어80) 원장님 2026-09-18 「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」 */}
      <div className="nb-hidden" data-g="hidden">
        <div className="nb-hh">숨긴 그룹</div>
        {hidden.done.length > 0 && <button type="button" className="nb-hg" data-act="show-done" aria-pressed={Boolean(show.done)} onClick={() => setShow({ ...show, done: !show.done })}>👁 <span className="nb-pill nb-green">✓ 끝냄</span><span className="nb-cnt" data-g="done-count">{hidden.done.length}</span></button>}
        {hidden.reuse.length > 0 && <button type="button" className="nb-hg" data-act="show-reuse" aria-pressed={Boolean(show.reuse)} onClick={() => setShow({ ...show, reuse: !show.reuse })}>👁 <span className="nb-pill">♻️ 이미 있는 것</span><span className="nb-cnt" data-g="reuse-count">{hidden.reuse.length}</span></button>}
        {hidden.dropped.length > 0 && <button type="button" className="nb-hg" data-act="show-dropped" aria-pressed={Boolean(show.dropped)} onClick={() => setShow({ ...show, dropped: !show.dropped })}>👁 <span className="nb-pill">뺀 것</span><span className="nb-cnt">{hidden.dropped.length}</span></button>}
        {hidden.reuse.length > 0 && <div className="nb-hh" style={{ paddingTop: 8 }}>이미 있는 것 {hidden.reuse.length} · {hidden.reuse.map((x) => x.title).join(" · ")}. 「만들기」가 <b>체크된 채로</b> 섰습니다(㊵)</div>}
        {show.done && hidden.done.map((x) => <Card key={x.id} c={x} />)}
        {show.reuse && hidden.reuse.map((x) => <Card key={x.id} c={x} />)}
        {show.dropped && hidden.dropped.map((x) => <Card key={x.id} c={x} />)}
      </div>
    </div>}
    {view === "table" && <div className="tblwrap" data-g="table"><table><thead><tr><th>종류</th><th>업무</th><th>마감</th><th>학교</th><th>인원</th><th>단계</th><th>왜 생겼나</th><th></th></tr></thead><tbody>
      {cards.filter((x) => x.state === "todo" || x.state === "doing").map((x) => <tr key={x.id} className={isOverdue(x, today) ? "hi" : ""} data-g="row" data-kind={x.kind} data-id={x.id}>
        <td><span className={"nb-pill " + (cols.find((cl) => cl.kind === x.kind)?.cls ?? "")}>{kindName(x.kind, klist)}</span></td><td className="sch">{x.title}{x.extra ? ` · ${x.extra}` : ""}</td><td>{dueLine(x, today)}</td><td>{x.school ? schoolTag(x) : ""}</td><td className="num">{x.n ?? ""}</td>
        <td>{x.checks ? x.checks.filter((s) => ["make", "print", "hand"].includes(s.step)).map((s) => `${s.done ? "✓" : "·"}${s.name}`).join(" ") : ""}</td><td>{x.why ?? ""}</td>
        <td>{x.todoId && <button className="btn sm pri" type="button" disabled={pending} data-act="done" onClick={() => run(() => doneAct(x.todoId), `끝냈습니다. ${x.title}`)}>✓ 끝냄</button>}{x.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={() => run(() => unitTestMadeAct(x.unitTestId), "출제했습니다")}>출제 완료</button>}{x.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={() => run(() => unitTestDueAct(x.dueUnitTest), "출제했습니다")}>출제 완료</button>}</td>
      </tr>)}
      {!cards.filter((x) => x.state === "todo" || x.state === "doing").length && <tr><td colSpan={8} className="note">업무가 없습니다</td></tr>}
    </tbody></table></div>}
    <div className="two" style={{ marginTop: 12 }}>
      <div className="card" style={{ margin: 0 }} data-g="flow">
        <div className="ctitle"><span className="cemo">📦</span>자료 단계{selCard?.material ? ` · ${selCard.material.type} · ${selCard.material.title}` : ""}</div>
        {selCard?.material ? <div className="mflow">{flowOf(selCard.material).map((s, i) => <span key={s.step} style={{ display: "contents" }}>{i > 0 && <span className="mar">→</span>}<div className={"mf" + (s.state === "done" ? " done" : s.state === "now" ? " now" : "")} data-step={s.step} data-state={s.state}>{s.name}<i>{s.state === "done" ? "✓" : s.text ?? ""}</i></div></span>)}</div>
          : <p className="note" style={{ margin: 0 }}>자료 카드를 누르면 여기 섭니다</p>}
      </div>
      <div className="card" style={{ margin: 0, borderColor: behind.length ? "var(--miss)" : undefined }} data-g="behind">
        <div className="ctitle"><span className="cemo">🔥</span>{behind.length ? `${behind[0].title}` : "못 따라가는 시험 없음"}</div>
        {!behind.length && <p className="note" style={{ margin: 0 }}>남은 자료가 남은 날 × {b.rules?.["todo.behind_per_day"] ?? 1} 안입니다</p>}
        {behind.map((x) => <div className="lf over" key={x.exam.id} data-g="behind-row"><span className="ln">{x.remaining}</span><div><b>{x.text}</b><small>{x.small}</small></div>
          <button className="btn sm pri" type="button" data-act="behind-open" onClick={() => setBehindOpen(behindOpen === x.exam.id ? null : x.exam.id)}>줄이기</button></div>)}
        {behindOpen && <div className="left" data-g="behind-list">{cards.filter((x) => x.kind === "make" && (x.state === "todo" || x.state === "doing") && x.exam?.id === behindOpen).map((x) => <div className="lf" key={x.id}><span className="ln">·</span><div><b>{x.title}</b><small>{dueLine(x, today)}</small></div><button className="btn sm" type="button" disabled={pending} data-act="behind-drop" onClick={() => run(() => dropMaterialAct(x.material.id, "못 따라가서 줄임(05 🔥)"), `뺐습니다. ${x.title}`)}>빼기</button></div>)}</div>}
      </div>
    </div>
    <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
      <span className="pill" data-g="bar-count">업무 {c.open} · 마감 지남 {c.overdue} · 이미 있음 {c.reuse}</span>
      <span className="spacer" />
    </div>
    {printing && <div className="mdlov" data-g="print-all" onClick={(x) => { if (x.target === x.currentTarget) setPrinting(false); }}><div className="mdl" style={{ maxWidth: 520 }}>
      <div className="mdlh"><b>🖨 한 번에 뽑기 · {pa.pages}장</b><span className="spacer" /><button className="btn sm" type="button" onClick={() => setPrinting(false)}>닫기</button></div>
      <div className="mdlb"><div className="left">{pa.list.map((x) => <div className="lf" key={x.id}><span className="ln">{x.pages}</span><div><b>{x.title}</b><small>{x.school ? `${schoolTag(x)} · ` : ""}{x.n}명 × 항목 {x.material.items || 1}</small></div></div>)}</div>
        </div>
      <div className="mdlf"><span className="spacer" /><button className="btn pri" type="button" disabled={pending} data-act="print-all-save" onClick={() => run(() => printAllAct(pa.ids), (r) => `뽑았습니다. 자료 ${r.materials}개 · ${pa.pages}장`, () => setPrinting(false))}>뽑았습니다</button></div>
    </div></div>}
  </>;
}
