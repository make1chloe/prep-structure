"use client";
/** 내 할 일 판(목업 05 · 노션 보드 모양 9/3) — 머리(🔥 마감 지남 · 학교 거르개) · 보기줄(⊞표 · ▦보드 · 묶기 고정 · 마감 순 · 새로 만들기 한 곳) · 보드(종류마다 칸 · 카드 📅🏫☑🧾) · 숨긴 그룹(✓ 끝냄 · ♻️ 이미 있는 것 · 뺀 것) ·
 *  📦 자료 하나 안에서만 순서 · 🔥 못 따라갑니다 — 줄이기 · 저장줄. 카드 목록은 한 번 세고(cardsOf) 표·보드가 같은 목록을 그린다 — 보기를 바꿔도 조회 0(속도-1 예외). 세는 것은 lib/todo-plan 한 벌 */
import Link from "next/link";
import Sibs from "@/app/_shell/sibs";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { doneAct, undoAct, dueAct, dropAct, unitTestAct, unitTestMadeAct, unitTestDueAct, noteAct, repeatAct, repeatActiveAct, printAllAct, dropMaterialAct, quizPaperAct, scoredAct } from "./actions.js";
import { cardsOf, filterSchool, sortCards, columnsOf, hiddenOf, counts, behindOf, printAllOf, dueLine, isOverdue, kindName, schoolTag, flowOf, repeatText, monthDay, REPEAT_EVENTS, stepTodoOf, filterMaterials, onlyText } from "@/lib/todo-plan";
import { examOn } from "@/lib/exam-plan";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date;
  const [view, setView] = useState("board"); const [school, setSchool] = useState("all"); const [sort, setSort] = useState("due"); const [show, setShow] = useState({}); const [sel, setSel] = useState(null); const [nw, setNw] = useState(null); const [printing, setPrinting] = useState(false); const [behindOpen, setBehindOpen] = useState(null);
  const [ut, setUt] = useState({ studentId: "", topicId: "", qCount: "25" }); const [note, setNote] = useState({ title: "", dueOn: today, dueTime: "", studentId: "" }); const [rp, setRp] = useState({ name: "", every: "month", day: "25", weekday: "1", lead: String(b.rules?.["todo.repeat_lead"] ?? 3), days: "7", left: "5" });
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const all = useMemo(() => cardsOf(b), [b]);                       // 한 번 센다 — 보기·거르개·차례는 이 목록을 다르게 그릴 뿐(재조회 0)
  const [only, setOnly] = useState(d.only ?? []);   // 04 「단계 ↗」 — 그 자료만((가)-④) · 「전체 보기 ✕」로 푼다
  const cards = useMemo(() => sortCards(filterSchool(filterMaterials(all, only), school), sort), [all, only, school, sort]);
  const cols = columnsOf(cards, today), hidden = hiddenOf(cards), c = counts(cards, today), behind = behindOf(cards, today, parseInt(b.rules?.["todo.behind_per_day"] ?? "1", 10) || 1), pa = printAllOf(cards);
  const selCard = (sel ? all.find((x) => x.id === sel) : only.length ? all.find((x) => only.includes(x.material?.id)) : null) ?? null;   // 자료만 걸러 열었으면 📦 흐름도 그 자료로
  const schools = b.schools ?? [];
  const schoolPick = (v) => setSchool(v);
  const Card = ({ c }) => <div className={"nb-card" + (isOverdue(c, today) ? " nb-hot" : "") + (c.state === "done" ? " nb-done" : "")} data-g="card" data-kind={c.kind} data-state={c.state} data-id={c.id} onClick={() => setSel(c.id)} aria-pressed={sel === c.id}>
    <span className="nb-title">{c.title}{c.extra ? <span className="tag" style={{ marginLeft: 6 }}>{c.extra}</span> : null}</span>
    <div className={"nb-prop" + (isOverdue(c, today) ? " nb-over" : "")}><span className="nb-pi">📅</span><span className="nb-pv" data-g="due">{dueLine(c, today)}</span></div>
    {(c.school || c.n != null) && <div className="nb-prop"><span className="nb-pi">🏫</span><span className="nb-pv">{c.school && <span className={"nb-pill " + (c.level === "high" ? "nb-blue" : c.level === "middle" ? "nb-green" : "")}>{schoolTag(c)}</span>}{c.n != null && <span className="nb-pill">{c.kind === "print" ? `${c.pages}장 · ` : ""}{c.n}명</span>}</span></div>}
    {c.checks && <div className="nb-prop"><span className="nb-pi">☑</span><span className="nb-pv" data-g="checks">{c.checks.map((s) => { const tid = stepTodoOf(all, c.material?.id, s.step); return <button key={s.step} type="button" className={"nb-check" + (s.done ? " nb-done" : "")} data-step={s.step} data-done={s.done ? "1" : "0"} disabled={pending || !tid} title={tid ? (s.done ? "누르면 무릅니다 — 카드가 제 칸으로" : "누르면 끝냄 — 카드가 다음 칸으로(끌지 않습니다)") : (["solve", "score"].includes(s.step) ? "풀이는 아이가 앱에서 제출 · 채점은 채점 칸에서 아이마다" : "켜 둔 단계가 아닙니다")} style={{ border: 0, background: "none", padding: 0, font: "inherit", cursor: tid ? "pointer" : "default" }} onClick={(x) => { x.stopPropagation(); if (!tid) return; run(() => (s.done ? undoAct(tid) : doneAct(tid)), s.done ? `${s.name} 무름 — 카드가 제 칸으로 돌아갑니다` : `${s.name} ✓ — 카드가 다음 칸으로 갑니다`); }}><i>{s.done ? "✓" : "·"}</i>{s.name}{s.text ? ` ${s.text}` : ""}</button>; })}</span></div>}
    {c.kind === "solve" && <div className="nb-prop"><span className="nb-pi">✍️</span><span className="nb-pv" data-g="submit">제출 {c.submitted ?? 0}/{c.n}{c.waiting?.length ? ` · 아직: ${c.waiting.join(", ")}` : " · 다 냈습니다"}</span></div>}
    {c.kind === "grade" && <div className="nb-prop"><span className="nb-pi">✅</span><span className="nb-pv" data-g="grade" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>채점 {c.scored ?? 0}/{c.n}{(c.toGrade ?? []).map((s) => <button key={s.id} type="button" className="btn sm pri" data-act="scored" data-student={s.id} disabled={pending} onClick={(x) => { x.stopPropagation(); run(() => scoredAct(c.material.id, s.id, true), `채점 ✓ — ${s.name}`); }}>{s.name} ✓</button>)}{(c.graded ?? []).map((s) => <button key={s.id} type="button" className="btn sm" data-act="unscored" data-student={s.id} disabled={pending} title="누르면 무릅니다" onClick={(x) => { x.stopPropagation(); run(() => scoredAct(c.material.id, s.id, false), `채점 무름 — ${s.name}`); }}>{s.name} 채점함</button>)}</span></div>}
    {c.book && <div className="nb-prop"><span className="nb-pi">📚</span><span className="nb-pv">{c.book}</span></div>}
    {c.style && <div className="nb-prop"><span className="nb-pi">🧪</span><span className="nb-pv">{c.style}</span></div>}
    {c.kind === "score" && <div className="nb-prop"><span className="nb-pi">👧</span><span className="nb-pv">아이가 넣습니다</span></div>}
    {c.why && c.kind !== "score" && <div className="nb-prop"><span className="nb-pi">🧾</span><span className="nb-pv">{c.why}</span></div>}
    {c.note && <div className="nb-prop"><span className="nb-pi">✎</span><span className="nb-pv">{c.note}</span></div>}
    <div className="wv" style={{ marginTop: 6, gap: 4 }}>
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm pri" type="button" disabled={pending} data-act="done" onClick={(x) => { x.stopPropagation(); run(() => doneAct(c.todoId), `끝냈습니다 — ${c.title}`); }}>✓ 끝냄</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={(x) => { x.stopPropagation(); run(() => dropAct(c.todoId, "05 에서 뺌"), "뺐습니다(지우지 않았습니다)"); }}>빼기</button>}
      {c.todoId && (c.state === "done" || c.state === "dropped") && <button className="btn sm" type="button" disabled={pending} data-act="undo" onClick={(x) => { x.stopPropagation(); run(() => undoAct(c.todoId), "되돌렸습니다"); }}>되돌리기</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <input type="date" className="dt" value={c.due ?? ""} aria-label={`${c.title} 마감`} onClick={(x) => x.stopPropagation()} onChange={(x) => run(() => dueAct(c.todoId, x.target.value), "마감을 바꿨습니다")} style={{ width: "auto" }} />}
      {c.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={(x) => { x.stopPropagation(); run(() => unitTestMadeAct(c.unitTestId), "출제했습니다 — 오늘 수업 카드에 섭니다"); }}>출제함</button>}
      {c.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={(x) => { x.stopPropagation(); run(() => unitTestDueAct(c.dueUnitTest), "출제했습니다 — 오늘 수업 카드에 섭니다(같은 묶음은 다시 안 섭니다)"); }}>출제함</button>}
      {c.quizId && !c.paperAt && <button className="btn sm pri" type="button" disabled={pending} data-act="paper" onClick={(x) => { x.stopPropagation(); run(() => quizPaperAct(c.quizId, true), "재시험지 만들었음 — 시험을 보면 카드가 사라집니다"); }}>🖨 재시험지 만들었음</button>}
      {c.quizId && c.paperAt && <><span className="tag on" data-g="paper">🖨 종이 ✓</span><button className="btn sm" type="button" disabled={pending} data-act="paper-undo" onClick={(x) => { x.stopPropagation(); run(() => quizPaperAct(c.quizId, false), "무렀습니다"); }}>무르기</button></>}
      {c.quizId && <Link prefetch={false} className="btn sm" href="/today" onClick={(x) => x.stopPropagation()}>오늘 수업 ↗</Link>}
      {c.kind === "score" && <Link prefetch={false} className="btn sm" href={`/scores?e=${c.examId}`} onClick={(x) => x.stopPropagation()}>📈 성적 ↗</Link>}
      {c.exam && c.material && <Link prefetch={false} className="btn sm" href={`/schedule/exams/prep?e=${c.exam.id}`} onClick={(x) => x.stopPropagation()}>📄 자료 ↗</Link>}
    </div>
  </div>;
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }} data-g="count">내 할 일 {c.open}</span>
      <span className={"pill" + (c.overdue ? " warn" : "")} data-g="overdue">🔥 마감 지남 {c.overdue}</span>
      {only.length > 0 && <span className="pill warn" data-g="only">📄 {onlyText(all, only)} 만 <button type="button" className="lnk" data-act="only-off" onClick={() => { setOnly([]); router.replace("/schedule/todo"); }}>전체 보기 ✕</button></span>}
      <span className="spacer" />
      {schools.length <= 2 ? <div className="seg sm" data-g="school">{[["all", "전체"], ...schools.map((s) => [s.id, s.name.replace(/(중학교|고등학교|초등학교)$/, (m) => ({ 중학교: "중", 고등학교: "고", 초등학교: "초" })[m])]), ["none", "내신 아닌 것"]].map(([k, nm]) => <button key={k} type="button" aria-pressed={school === k} onClick={() => schoolPick(k)}>{nm}</button>)}</div>
        : <select value={school} aria-label="학교" data-g="school" onChange={(x) => schoolPick(x.target.value)} style={{ width: "auto" }}><option value="all">전체</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="none">내신 아닌 것</option></select>}
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="lf ok" style={{ margin: "0 0 8px" }}><span className="ln">⇄</span><div><b>표 하나에 보기 둘 — 표 · 보드는 같은 줄입니다</b><small>보기를 바꿔도 서버 조회 0건 · 범위·시험일은 🏫 시험 회차에서 · 자료는 📄 내신 자료에서</small></div><Sibs here="/schedule/todo" /></div>
    <div className="nb-viewbar" data-g="viewbar">
      <button type="button" className="nb-tab" aria-current={view === "table"} data-act="view-table" onClick={() => setView("table")}><span className="nb-ic">⊞</span>표</button>
      <button type="button" className="nb-tab" aria-current={view === "board"} data-act="view-board" onClick={() => setView("board")}><span className="nb-ic">▦</span>보드</button>
      <div className="nb-tools">
        <span className="nb-tool nb-on" title="바꿀 수 없습니다 — 학교로 묶으면 인쇄가 흩어집니다(9/5 ⑩)">묶기: 할 일 종류 · 고정</span>
        <button type="button" className="nb-tool" data-act="sort" aria-pressed={sort === "due"} onClick={() => setSort(sort === "due" ? "made" : "due")}>{sort === "due" ? "마감 순" : "만든 순"}</button>
        <button type="button" className="nb-new" data-act="new-open" onClick={() => setNw(nw ? null : "menu")}>새로 만들기 ⌄</button>
      </div>
    </div>
    {nw === "menu" && <div className="card" data-g="new-menu" style={{ marginTop: 8 }}><div className="wv">
      <span className="fl" style={{ margin: 0 }}>새로 만들기 — 한 곳(9/5 ⑨)</span>
      <button className="btn sm" type="button" data-act="new-material" onClick={() => setNw("material")}>📄 자료</button>
      <button className="btn sm" type="button" data-act="new-unit-test" onClick={() => setNw("unit_test")}>📝 단원평가 출제</button>
      <button className="btn sm" type="button" data-act="new-note" onClick={() => setNw("note")}>📋 메모</button>
      <button className="btn sm" type="button" data-act="new-repeat" onClick={() => setNw("repeat")}>⏰ 되풀이</button>
      <span className="spacer" /><button className="btn sm" type="button" onClick={() => setNw(null)}>닫기</button></div></div>}
    {nw === "material" && <div className="card" data-g="new-material" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">📄</span>자료는 회차에서 세웁니다 — 회차를 고르세요</div>
      <div className="tags">{(b.exams_soon ?? []).map((e) => <Link prefetch={false} key={e.id} className="tag on" href={`/schedule/exams/prep?e=${e.id}`}>{e.school ?? "전국"} {e.name} · {monthDay(examOn(e))} · 자료 {e.materials}</Link>)}{!(b.exams_soon ?? []).length && <span className="note" style={{ margin: 0 }}>다가오는 회차가 없습니다 — 🏫 시험 회차에서 넣으세요</span>}</div></div>}
    {nw === "unit_test" && <div className="card" data-g="new-unit-test" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">📝</span>단원평가 출제 — 아이 · 문법 분류 · 문항 수</div>
      <div className="wv"><select value={ut.studentId} aria-label="아이" onChange={(x) => setUt({ ...ut, studentId: x.target.value })} style={{ width: "auto" }}><option value="">아이</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.school ? ` · ${s.school}` : ""}</option>)}</select>
        <select value={ut.topicId} aria-label="문법 분류" onChange={(x) => setUt({ ...ut, topicId: x.target.value })} style={{ width: "auto" }}><option value="">문법 분류</option>{(b.topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="text" inputMode="numeric" className="scr" value={ut.qCount} aria-label="문항 수" onChange={(x) => setUt({ ...ut, qCount: x.target.value.replace(/\D/g, "") })} />
        <button className="btn pri sm" type="button" disabled={pending || !ut.studentId || !ut.topicId} data-act="unit-test-save" onClick={() => run(() => unitTestAct({ studentId: ut.studentId, topicId: ut.topicId, qCount: Number(ut.qCount) || 25 }), "낼 것으로 섰습니다 — 출제하면 「출제함」을 누르세요", () => { setNw(null); setUt({ studentId: "", topicId: "", qCount: "25" }); })}>저장</button></div></div>}
    {nw === "note" && <div className="card" data-g="new-note" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">📋</span>메모 — 제목 · 날짜 · 시각 · 아이(비워도 됨) — 일정 12 의 + 할 일과 같은 줄</div>
      <div className="wv"><input type="text" value={note.title} placeholder="무엇을" aria-label="할 일" onChange={(x) => setNote({ ...note, title: x.target.value })} style={{ flex: "1 1 200px" }} />
        <input type="date" className="dt" value={note.dueOn} aria-label="날짜" onChange={(x) => setNote({ ...note, dueOn: x.target.value })} style={{ width: "auto" }} /><input type="time" value={note.dueTime} aria-label="시각" onChange={(x) => setNote({ ...note, dueTime: x.target.value })} style={{ width: "auto" }} />
        <select value={note.studentId} aria-label="아이" onChange={(x) => setNote({ ...note, studentId: x.target.value })} style={{ width: "auto" }}><option value="">아이 없음</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn pri sm" type="button" disabled={pending || !note.title.trim() || !note.dueOn} data-act="note-save" onClick={() => run(() => noteAct(note), "메모를 넣었습니다", () => { setNw(null); setNote({ title: "", dueOn: today, dueTime: "", studentId: "" }); })}>저장</button></div></div>}
    {nw === "repeat" && <div className="card" data-g="new-repeat" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">⏰</span>되풀이 — 때가 되면 늘 하는 일(규칙만 적어 두면 할 일은 저절로)</div>
      <div className="wv"><input type="text" value={rp.name} placeholder="수납 안내 보내기" aria-label="되풀이 이름" onChange={(x) => setRp({ ...rp, name: x.target.value })} style={{ flex: "1 1 200px" }} />
        <div className="seg sm" data-g="every"><button type="button" aria-pressed={rp.every === "month"} onClick={() => setRp({ ...rp, every: "month" })}>매달</button><button type="button" aria-pressed={rp.every === "week"} onClick={() => setRp({ ...rp, every: "week" })}>매주</button>{REPEAT_EVENTS.map(([k, name]) => <button key={k} type="button" aria-pressed={rp.every === k} onClick={() => setRp({ ...rp, every: k })}>{name}</button>)}</div>
        {rp.every === "month" && <input type="text" inputMode="numeric" className="scr" value={rp.day} aria-label="며칠" onChange={(x) => setRp({ ...rp, day: x.target.value.replace(/\D/g, "") })} />}
        {rp.every === "week" && <select value={rp.weekday} aria-label="요일" onChange={(x) => setRp({ ...rp, weekday: x.target.value })} style={{ width: "auto" }}>{WD.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>}
        {rp.every === "new_student" && <><label className="fl" style={{ margin: 0 }}>들어온 지</label><input type="text" inputMode="numeric" className="scr" value={rp.days} aria-label="들어온 지 며칠" onChange={(x) => setRp({ ...rp, days: x.target.value.replace(/\D/g, "") })} /><span className="note" style={{ margin: 0 }}>일 — 아이마다 한 번(학생 14 의 들어온 날)</span></>}
        {rp.every === "book_ending" && <><label className="fl" style={{ margin: 0 }}>남은 소단원</label><input type="text" inputMode="numeric" className="scr" value={rp.left} aria-label="남은 소단원" onChange={(x) => setRp({ ...rp, left: x.target.value.replace(/\D/g, "") })} /><span className="note" style={{ margin: 0 }}>개 이하 — 아이·교재·회독마다 한 번</span></>}
        {rp.every !== "book_ending" && <><label className="fl" style={{ margin: 0 }}>며칠 전부터</label><input type="text" inputMode="numeric" className="scr" value={rp.lead} aria-label="며칠 전부터" onChange={(x) => setRp({ ...rp, lead: x.target.value.replace(/\D/g, "") })} /></>}
        <button className="btn pri sm" type="button" disabled={pending || !rp.name.trim()} data-act="repeat-save" onClick={() => run(() => repeatAct(rp), (r) => `되풀이 규칙을 넣었습니다${r.made ? ` — 오늘 걸리는 것 ${r.made}건이 섰습니다` : ""}`, () => { setNw(null); setRp({ ...rp, name: "" }); })}>저장</button></div>
      {(b.repeats ?? []).length > 0 && <div className="tags" data-g="repeat-rules" style={{ marginTop: 6 }}>{b.repeats.map((r) => <span key={r.id} className={"tag" + (r.active ? " on" : "")}>{r.name} · {repeatText(r.threshold ?? {})}<button className="lnk" type="button" style={{ marginLeft: 6 }} data-act="repeat-toggle" onClick={() => run(() => repeatActiveAct(r.id, !r.active), r.active ? "멈췄습니다" : "다시 돕니다")}>{r.active ? "멈춤" : "켬"}</button></span>)}</div>}</div>}
    {view === "board" && <div className="nb-board" data-g="board">
      {cols.map((col) => <div className="nb-col" key={col.kind} data-g="col" data-kind={col.kind}>
        <div className="nb-colh"><span className={"nb-pill " + col.cls}>{col.name}</span><span className="nb-cnt" data-g="col-count">{col.count}</span></div>
        {col.cards.map((x) => <Card key={x.id} c={x} />)}
        {!col.cards.length && <p className="note" style={{ margin: "4px 0 0" }}>없음</p>}
        {col.kind === "print" && pa.list.length > 0 && <button className="nb-add" type="button" disabled={pending} data-act="print-all" onClick={() => setPrinting(true)}>🖨 한 번에 뽑기 — {pa.pages}장 (여기서 여는 창)</button>}
      </div>)}
      <div className="nb-hidden" data-g="hidden">
        <div className="nb-hh">숨긴 그룹</div>
        <button type="button" className="nb-hg" data-act="show-done" aria-pressed={Boolean(show.done)} onClick={() => setShow({ ...show, done: !show.done })}>👁 <span className="nb-pill nb-green">✓ 끝냄</span><span className="nb-cnt" data-g="done-count">{hidden.done.length}</span></button>
        <button type="button" className="nb-hg" data-act="show-reuse" aria-pressed={Boolean(show.reuse)} onClick={() => setShow({ ...show, reuse: !show.reuse })}>👁 <span className="nb-pill">♻️ 이미 있는 것</span><span className="nb-cnt" data-g="reuse-count">{hidden.reuse.length}</span></button>
        <button type="button" className="nb-hg" data-act="show-dropped" aria-pressed={Boolean(show.dropped)} onClick={() => setShow({ ...show, dropped: !show.dropped })}>👁 <span className="nb-pill">뺀 것</span><span className="nb-cnt">{hidden.dropped.length}</span></button>
        {hidden.reuse.length > 0 && <div className="nb-hh" style={{ paddingTop: 8 }}>이미 있는 것 {hidden.reuse.length} — {hidden.reuse.map((x) => x.title).join(" · ")}. 「만들기」가 <b>체크된 채로</b> 섰습니다(㊵)</div>}
        {show.done && hidden.done.map((x) => <Card key={x.id} c={x} />)}
        {show.reuse && hidden.reuse.map((x) => <Card key={x.id} c={x} />)}
        {show.dropped && hidden.dropped.map((x) => <Card key={x.id} c={x} />)}
      </div>
    </div>}
    {view === "table" && <div className="tblwrap" data-g="table"><table><thead><tr><th>종류</th><th>할 일</th><th>마감</th><th>학교</th><th>인원</th><th>단계</th><th>왜 생겼나</th><th></th></tr></thead><tbody>
      {cards.filter((x) => x.state === "todo" || x.state === "doing").map((x) => <tr key={x.id} className={isOverdue(x, today) ? "hi" : ""} data-g="row" data-kind={x.kind} data-id={x.id}>
        <td><span className={"nb-pill " + (cols.find((cl) => cl.kind === x.kind)?.cls ?? "")}>{kindName(x.kind)}</span></td><td className="sch">{x.title}{x.extra ? ` · ${x.extra}` : ""}</td><td>{dueLine(x, today)}</td><td>{x.school ? schoolTag(x) : "—"}</td><td className="num">{x.n ?? "—"}</td>
        <td>{x.checks ? x.checks.filter((s) => ["make", "print", "hand"].includes(s.step)).map((s) => `${s.done ? "✓" : "·"}${s.name}`).join(" ") : "—"}</td><td>{x.why ?? ""}</td>
        <td>{x.todoId && <button className="btn sm pri" type="button" disabled={pending} data-act="done" onClick={() => run(() => doneAct(x.todoId), `끝냈습니다 — ${x.title}`)}>✓ 끝냄</button>}{x.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={() => run(() => unitTestMadeAct(x.unitTestId), "출제했습니다")}>출제함</button>}{x.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={() => run(() => unitTestDueAct(x.dueUnitTest), "출제했습니다")}>출제함</button>}</td>
      </tr>)}
      {!cards.filter((x) => x.state === "todo" || x.state === "doing").length && <tr><td colSpan={8} className="note">할 일이 없습니다</td></tr>}
    </tbody></table></div>}
    <div className="two" style={{ marginTop: 12 }}>
      <div className="card" style={{ margin: 0 }} data-g="flow">
        <div className="ctitle"><span className="cemo">📦</span>자료 하나 안에서만 순서가 있습니다{selCard?.material ? ` — ${selCard.material.type} · ${selCard.material.title}` : ""}</div>
        {selCard?.material ? <div className="mflow">{flowOf(selCard.material).map((s, i) => <span key={s.step} style={{ display: "contents" }}>{i > 0 && <span className="mar">→</span>}<div className={"mf" + (s.state === "done" ? " done" : s.state === "now" ? " now" : "")} data-step={s.step} data-state={s.state}>{s.name}<i>{s.state === "done" ? "✓" : s.text ?? ""}</i></div></span>)}</div>
          : <p className="note" style={{ margin: 0 }}>자료 카드를 누르면 만들기 → 인쇄 → 배부 → 풀이 → 채점이 어디까지 왔는지 보입니다. 다른 종류끼리는 순서가 없습니다</p>}
      </div>
      <div className="card" style={{ margin: 0, borderColor: behind.length ? "var(--miss)" : undefined }} data-g="behind">
        <div className="ctitle"><span className="cemo">🔥</span>{behind.length ? `${behind[0].title}` : "못 따라가는 회차 없음"}</div>
        {!behind.length && <p className="note" style={{ margin: 0 }}>남은 자료가 남은 날 × {b.rules?.["todo.behind_per_day"] ?? 1} 안입니다</p>}
        {behind.map((x) => <div className="lf over" key={x.exam.id} data-g="behind-row"><span className="ln">{x.remaining}</span><div><b>{x.text}</b><small>{x.small}</small></div>
          <button className="btn sm pri" type="button" data-act="behind-open" onClick={() => setBehindOpen(behindOpen === x.exam.id ? null : x.exam.id)}>줄이기</button></div>)}
        {behindOpen && <div className="left" data-g="behind-list">{cards.filter((x) => x.kind === "make" && (x.state === "todo" || x.state === "doing") && x.exam?.id === behindOpen).map((x) => <div className="lf" key={x.id}><span className="ln">·</span><div><b>{x.title}</b><small>{dueLine(x, today)}</small></div><button className="btn sm" type="button" disabled={pending} data-act="behind-drop" onClick={() => run(() => dropMaterialAct(x.material.id, "못 따라가서 줄임(05 🔥)"), `뺐습니다 — ${x.title}`)}>빼기</button></div>)}</div>}
      </div>
    </div>
    <div className="savebar" style={{ marginTop: 8 }} data-g="bar">
      <span className="pill" data-g="bar-count">할 일 {c.open} · 마감 지남 {c.overdue} · 이미 있음 {c.reuse}</span>
      <span className="spacer" />
      <span className="pill">범위·시험일은 <b>06 시험 회차</b>에서 관리합니다</span>
    </div>
    {printing && <div className="mdlov" data-g="print-all" onClick={(x) => { if (x.target === x.currentTarget) setPrinting(false); }}><div className="mdl" style={{ maxWidth: 520 }}>
      <div className="mdlh"><b>🖨 한 번에 뽑기 — {pa.pages}장</b><span className="spacer" /><button className="btn sm" type="button" onClick={() => setPrinting(false)}>닫기</button></div>
      <div className="mdlb"><div className="left">{pa.list.map((x) => <div className="lf" key={x.id}><span className="ln">{x.pages}</span><div><b>{x.title}</b><small>{x.school ? `${schoolTag(x)} · ` : ""}{x.n}명 × 항목 {x.material.items || 1}</small></div></div>)}</div>
        <p className="note k" style={{ margin: "8px 0 0" }}>뽑았다고 찍으면 자료가 「인쇄함」이 되고 인쇄 할 일이 끝납니다. 종이는 프린터가 뽑습니다 — 앱은 표시만.</p></div>
      <div className="mdlf"><span className="spacer" /><button className="btn pri" type="button" disabled={pending} data-act="print-all-save" onClick={() => run(() => printAllAct(pa.ids), (r) => `뽑았습니다 — 자료 ${r.materials}개 · ${pa.pages}장`, () => setPrinting(false))}>뽑았습니다</button></div>
    </div></div>}
  </>;
}
