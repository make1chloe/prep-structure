"use client";
/** 내 업무 판(목업 05 · 노션 보드 모양 9/3) · 머리(🔥 마감 지남 · 학교 거르개) · 보기줄(⊞표 · ▦보드 · 새로 만들기 한 곳 · 차례는 늘 마감 순, 어9·대전제-14) · 보드(종류마다 칸 · 카드 📅🏫☑🧾) · 숨긴 그룹(✓ 끝냄 · ♻️ 이미 있는 것 · 삭제한 것) ·
 *  📦 자료 하나 안에서만 순서 · 🔥 못 따라갑니다 — 줄이기 · 저장줄. 카드 목록은 한 번 세고(cardsOf) 표·보드가 같은 목록을 그린다 — 보기를 바꿔도 조회 0(속도-1 예외). 세는 것은 lib/todo-plan 한 벌 */
import Link from "next/link";
import Sibs from "@/app/_shell/sibs";
import { useMemo, useState, useTransition } from "react";
import QuickMemo from "../../_shell/quickmemo.js";   // (어78) 📌 퀵 메모 한 벌 — 상단 띠와 05 가 같은 부품(원칙-1)
import { usePick, PickAll, PickGroup, PickBox, PickBar } from "../../_shell/pick.js";   /* 고르기 한 벌((어28)-③ · 대전제-20) */
import { useRouter } from "next/navigation";
import Photo from "@/app/_shell/photo.js";
import { isImage } from "@/lib/files-plan";
import { doneAct, undoAct, dueAct, dropAct, manyAct, unitTestAct, unitTestMadeAct, unitTestDueAct, repeatAct, repeatActiveAct, printAllAct, dropMaterialAct, quizPaperAct, scoredAct, checkedAct, retestTakeAct, restoreAct, addKindAct, editKindAct, dropKindAct, restoreKindAct, kindOrderAct, moveKindAct, materialFormAct, addMaterialAct } from "./actions.js";
import { cardsOf, filterSchool, sortCards, columnsOf, hiddenOf, counts, behindOf, printAllOf, dueLine, isOverdue, kindName, kindList, SHOW_ON, NOTIFY_WAYS, giveCross, schoolTag, flowOf, repeatText, monthDay, REPEAT_EVENTS, stepTodoOf, filterMaterials, onlyText, whoPicks } from "@/lib/todo-plan";
import { examOn } from "@/lib/exam-plan";
import { ACT, FACE } from "@/lib/emoji";
import { icon } from "@/app/_shell/icon.js";   // (어80) 아이콘만 있는 손의 이름·툴팁 한 벌
import { DateBox } from "../../_shell/datebox.js";
import MaterialModal from "../../_shell/materialmodal.js";   // (어94) 04 와 같은 「+ 자료」 양식 한 벌(원칙-1)
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
  const picks = useMemo(() => whoPicks(b), [b]);                    // (어95) 「누구에게」 고르개가 먹는 꼴 — 판이 이미 읽은 명단이라 조회 0(속도-1)
  const [only, setOnly] = useState(d.only ?? []);   // 04 「단계 👉」 — 그 자료만((가)-④) · 「전체 보기 ✕」로 푼다
  const cards = useMemo(() => sortCards(filterSchool(filterMaterials(all, only), school), "due"), [all, only, school]);   // (어10) 늘 마감 순 — 「만든 순」으로 보실 날이 없어 단추를 뺐다(대전제-14)
  const todoIds = useMemo(() => cards.filter((x) => x.todoId).map((x) => x.id), [cards]); const pk = usePick(todoIds);   /* 고른 업무 줄(자료 단계 카드는 ☑ 로 · 여기선 안 고른다) */
  const [detail, setDetail] = useState(null);   // (어88) 세부 내용 모달 · 카드 id
  const [taking, setTaking] = useState(null); const [wrong, setWrong] = useState("");   // (어89) 재시험 끝냄 · 틀린 개수
  const [drag, setDrag] = useState(null);       // (어88) 끌고 있는 카드 id
  const [over, setOver] = useState(null);       // (어88) 지금 가리키는 칸(분류)
  const pickedCards = cards.filter((x) => pk.has(x.id)), toDone = pickedCards.filter((x) => x.state !== "done"), toUndo = pickedCards.filter((x) => x.state === "done"), toRestore = pickedCards.filter((x) => x.state === "dropped");   /* (어80) 복구 — 뺀 것만 */ const [dueTo, setDueTo] = useState("");
  const cols = columnsOf(cards, today, kinds), hidden = hiddenOf(cards), c = counts(cards, today), behind = behindOf(cards, today, parseInt(b.rules?.["todo.behind_per_day"] ?? "1", 10) || 1), pa = printAllOf(cards);
  const selCard = (sel ? all.find((x) => x.id === sel) : only.length ? all.find((x) => only.includes(x.material?.id)) : null) ?? null;   // 자료만 걸러 열었으면 📦 흐름도 그 자료로
  const schools = b.schools ?? [];
  const schoolPick = (v) => setSchool(v);
  const openKind = (col) => { const key = col ? col.kind : "new"; if (kindOpen === key) { setKindOpen(null); return; } setKindOpen(key); setKf(col ? { name: col.name, cls: col.cls ?? "", showOn: col.showOn ?? "todo", notifyWay: col.notifyWay ?? "none", confirmGot: Boolean(col.confirmGot) } : { name: "", cls: "", showOn: "todo", notifyWay: "none", confirmGot: false }); };
  /** (어80) 분류 한 벌 — 넣기와 수정이 **같은 양식**이다(원칙-1 · 대전제-19). 지우지 않고 내린다(대전제-6)이라 「삭제」는 state=off 고, 「복구」가 짝이다 */
  const kindForm = (col) => <div data-g="kind-form" data-kind={col ? col.kind : "new"} style={{ marginTop: 4 }} onClick={(x) => x.stopPropagation()}>
    <input value={kf.name} aria-label="분류 이름" placeholder="학교 행사" onChange={(x) => setKf({ ...kf, name: x.target.value })} style={{ width: "100%" }} />
    <div className="seg sm" data-g="kind-cls" style={{ marginTop: 4 }}>{COLORS.map(([v, nm]) => <button key={v || "none"} type="button" data-cls={v} aria-pressed={kf.cls === v} onClick={() => setKf({ ...kf, cls: v })}>{nm}</button>)}</div>
    <div className="seg sm" data-g="kind-where" style={{ marginTop: 4 }}>{SHOW_ON.map(([v, nm]) => <button key={v} type="button" data-where={v} aria-pressed={kf.showOn === v} onClick={() => setKf({ ...kf, showOn: v })}>{nm}</button>)}</div>
    {/* (어96) 원장님 2026-09-19 「그냥 칸반 자체에 이 기능이 있고 그걸 내가 쓸지말지 결정해야할듯 · 알림만주거나 어플목록에 띄우거나 둘다 하거나 선택가능하게해야함」 */}
    <div className="wv" style={{ marginTop: 6, gap: 4 }}><span className="fl" style={{ margin: 0 }}>끝내면 아이에게</span>
      <div className="seg sm" data-g="kind-notify">{NOTIFY_WAYS.map(([v, nm]) => <button key={v} type="button" data-way={v} aria-pressed={kf.notifyWay === v} onClick={() => setKf({ ...kf, notifyWay: v })}>{nm}</button>)}</div></div>
    <label className="ckl" style={{ marginTop: 4 }} data-g="kind-confirm"><input type="checkbox" className="ck" checked={Boolean(kf.confirmGot)} onChange={(x) => setKf({ ...kf, confirmGot: x.target.checked })} />아이 확인 받기 · 다 받아 가야 카드가 닫힘</label>
    <div className="wv" style={{ marginTop: 4, gap: 4 }}>
      <button className="btn pri sm" type="button" disabled={pending || !kf.name.trim()} data-act={col ? "kind-save" : "kind-add"} onClick={() => run(() => (col ? editKindAct(col.kind, kf) : addKindAct(kf)), col ? "수정했어요" : `분류 ✓ · ${kf.name.trim()}`, () => setKindOpen(null))}>{col ? "수정" : "넣기"}</button>

      {col && !col.app && col.state === "active" && <button className="btn sm gho" type="button" disabled={pending} data-act="kind-drop" onClick={() => run(() => dropKindAct(col.kind), `삭제 ✓ · ${col.name}`, () => setKindOpen(null))}>삭제</button>}
      {col && col.state === "off" && <button className="btn sm" type="button" disabled={pending} data-act="kind-restore" onClick={() => run(() => restoreKindAct(col.kind), `복구 ✓ · ${col.name}`)}>{ACT.restore} 복구</button>}
      <span className="spacer" /><button className="btn sm gho" type="button" data-act="kind-cancel" onClick={() => setKindOpen(null)}>취소</button>
    </div></div>;
  /** (어88) 카드를 누르면 세부 내용(원장님 2026-09-18 「추가한 업무를 눌러서 세부내용확인 불가능」).
   *  ⚠️ 안의 손은 안 건드린다 — **여는 쪽에서 한 번 거른다**(app/today/row.js:90 rowtop 과 같은 본 · 원칙-1).
   *  손마다 stopPropagation 을 붙이면 손을 더할 때마다 빠뜨릴 자리가 하나 늘고 파수꾼이 못 잡는다(실제로 55줄 첨부 링크가 새고 있었다). */
  const dCard = detail ? (cards.find((x) => x.id === detail) ?? null) : null;   // (어88) 저장해도 그 자리 — id 로 들고 다시 찾는다
  /** (어88) 카드 끌어 옮기기 — 원장님 2026-09-18 「가로배치 카드 드래그로 변경가능하게」.
   *  ⚠️ **목업이 이미 `.nb-card{cursor:grab}` 으로 약속하고 있었는데 내가 안 지었다** — 마우스를 올리면 잡을 수 있다고
   *     손 모양이 뜨는데 끌리지 않았다(CSS 가 없는 기능을 약속하던 자리 · (어88) 에서 넷을 함께 잡았다).
   *  방식은 **pointer 이벤트 한 벌**(app/_shell/cardorder.js 와 같은 손 · 마우스·손가락 같은 길 · `.grip{touch-action:none}`).
   *     HTML5 `draggable` 은 **폰에서 안 되어** check-pref 가 금지한다.
   *  ⚠️ 끌기는 **더하는 길**이지 띠를 대신하지 않는다 — 폰·키보드·여러 장은 띠의 「↔ 분류 옮기기」가 그대로 한다(check-kind).
   *  옮기는 손은 그 띠와 **같은 것**(moveKindAct · 새 손 0 · 원칙-1). */
  const grab = (e, c) => { if (pending || !c.todoId) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(c.id); setOver(c.kind); };
  const follow = (e) => { if (!drag) return; const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-g=col]"); setOver(el?.dataset.kind ?? null); };
  const drop = (c) => { const to = over; setDrag(null); setOver(null);
    if (!to || to === c.kind || !c.todoId) return;   // 제 칸에 놓으면 아무 일도 안 한다
    run(() => moveKindAct([c.todoId], to), (r) => `옮겼습니다 ✓ · ${kindName(to, klist)}`); };
  /** (어88b) 📦 자료 단계 흐름 한 벌 — 원장님 2026-09-18 「이거 그냥 다 모달 가능하게해줘」.
   *  모든 카드가 모달을 열게 되면서, 자료 카드의 세부 내용인 이 흐름도 **모달 안**으로 들어왔다.
   *  누른 자리에서 바로 보이니 화면 아래까지 내려갈 일이 없다 · 두 벌로 그리지 않는다(원칙-1). */
  const Flow = ({ card }) => <div className="mflow">{flowOf(card.material).map((s, i) => <span key={s.step} style={{ display: "contents" }}>{i > 0 && <span className="mar">→</span>}<div className={"mf" + (s.state === "done" ? " done" : s.state === "now" ? " now" : "")} data-step={s.step} data-state={s.state}>{s.name}<i>{s.state === "done" ? "✓" : s.text ?? ""}</i></div></span>)}</div>;
  /** (어88b) 카드를 누르면 세부 내용 — 원장님 2026-09-18 「이거 그냥 다 모달 가능하게해줘」.
   *  처음엔 자료 카드만 빼 두었다(흐름이 아래에 서니 모달이 덮는다고 보았다) — 원장님이 **다 열라** 하셨고,
   *  그러면 흐름을 모달 **안**에 두면 될 일이었다(Flow 한 벌). 누른 자리에서 바로 보여 더 낫다.
   *  ⚠️ 안의 손은 안 건드린다 — **여는 쪽에서 한 번 거른다**(today/row.js:90 rowtop 과 같은 본 · 원칙-1). */
  const openCard = (c) => (e) => { if (e.target.closest("button,a,input,select,textarea,label")) return; setSel(c.id); setDetail(c.id); };
  /** (어92) 원장님 2026-09-18 「고르면 스크롤 튐」 — 까닭은 여기였다.
   *  `Card` 를 **판 함수 안에서** 만들면 상태가 바뀔 때마다 **부품 갈래가 새것**이 되어
   *  React 가 카드를 전부 부수고 다시 만든다 → 눌러 둔 체크박스가 사라졌다 살아나고 **스크롤·포커스가 튄다**.
   *  갈고리를 안 쓰므로 **부품이 아니라 함수로 부른다**(`{Card({ c, k })}`) — 그러면 갈래가 안 바뀌어 안 튄다.
   *  열쇠(key)는 뿌리에 단다 — DOM 은 한 글자도 안 바뀐다(마크업을 보는 검사·목업 화소 그대로). */
  /** (어96) 이 카드가 아이 확인을 받는 칸인가 — 칸마다 켜고 끄신다(0185 todo_kind.confirm_got · 원장님 2026-09-19) */
  const crossOf = (c) => (c.kind === "hand" && c.material && klist.find((x) => x.kind === c.kind)?.confirmGot ? giveCross(c.material) : null);
  const Card = ({ c, k }) => <div key={k} className={"nb-card" + (isOverdue(c, today) ? " nb-hot" : "") + (c.state === "done" ? " nb-done" : "")} data-g="card" data-kind={c.kind} data-state={c.state} data-id={c.id} data-drag={drag === c.id ? "1" : "0"} onClick={openCard(c)} aria-pressed={sel === c.id}>
    {c.todoId ? <span className="grip" data-g="card-grip" aria-hidden="true" onPointerDown={(e) => grab(e, c)} onPointerMove={follow} onPointerUp={() => drop(c)} onPointerCancel={() => drop(c)}>⠿</span> : null}
    {c.todoId ? <PickBox pick={pk} id={c.id} label={`${c.title} 고르기`} /> : null}<span className="nb-title">{c.title}{c.extra ? <span className="tag" style={{ marginLeft: 6 }}>{c.extra}</span> : null}</span>
    <div className={"nb-prop" + (isOverdue(c, today) ? " nb-over" : "")}><span className="nb-pi">📅</span><span className="nb-pv" data-g="due">{c.startOn ? `${monthDay(c.startOn)} 부터 · ` : ""}{dueLine(c, today)}</span></div>
    {c.files?.length > 0 && <div className="nb-prop"><span className="nb-pi">📎</span><span className="nb-pv wv" data-g="card-files" style={{ gap: 4 }}>
      {/* (어88) 원장님 2026-09-18 「업무에서 메모에 추가한 사진은 확인이 안 됨」 — 이름만 그려서 못 봤다.
          사진은 **썸네일 + 누르면 크게**(app/_shell/photo.js · 07·20·아이·학부모가 이미 쓰는 한 벌 · 원칙-1), 그 밖은 이름 링크.
          카드 클릭(세부 내용)과 갈라놓는 것은 카드 쪽 한 곳이 한다(rowtop 본 · today/row.js:90) */}
      {c.files.map((f) => (isImage(f.mime)
        ? <Photo key={f.id} id={f.id} name={f.name} size={56} />
        : <a key={f.id} className="tag" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>))}
    </span></div>}
    {(c.students ?? []).length > 0 && <div className="nb-prop"><span className="nb-pi">🎒</span><span className="nb-pv" data-g="card-who">{c.students.map((s) => <span key={s.id} className="nb-pill">{s.name}</span>)}</span></div>}{/* (어95) 이은 아이 — 「3명」만 적고 누구인지 안 적으면 화면이 덜 말한다(대전제-0) */}
    {(c.school || c.n != null) && <div className="nb-prop"><span className="nb-pi">🏛️</span><span className="nb-pv">{c.school && <span className={"nb-pill " + (c.level === "high" ? "nb-blue" : c.level === "middle" ? "nb-green" : "")}>{schoolTag(c)}</span>}{c.n != null && <span className="nb-pill">{c.kind === "print" ? `${c.pages}장 · ` : ""}{c.n}명</span>}</span></div>}
    {c.checks && <div className="nb-prop"><span className="nb-pi">☑</span><span className="nb-pv" data-g="checks">{c.checks.map((s) => { const tid = stepTodoOf(all, c.material?.id, s.step); return <button key={s.step} type="button" className={"nb-check" + (s.done ? " nb-done" : "")} data-step={s.step} data-done={s.done ? "1" : "0"} disabled={pending || !tid} style={{ border: 0, background: "none", padding: 0, font: "inherit", cursor: tid ? "pointer" : "default" }} onClick={(x) => { x.stopPropagation(); if (!tid) return; run(() => (s.done ? undoAct(tid) : doneAct(tid)), s.done ? `${s.name} 취소 · 카드가 제 칸으로 돌아갑니다` : `${s.name} ✓ · 카드가 다음 칸으로 갑니다`); }}><i>{s.done ? "✓" : "·"}</i>{s.name}{s.text ? ` ${s.text}` : ""}</button>; })}</span></div>}
    {c.kind === "solve" && <div className="nb-prop"><span className="nb-pi">✍️</span><span className="nb-pv" data-g="submit">제출 {c.submitted ?? 0}/{c.n}{c.waiting?.length ? ` · 아직: ${c.waiting.join(", ")}` : " · 다 냈습니다"}</span></div>}
    {c.kind === "grade" && <div className="nb-prop"><span className="nb-pi">✅</span><span className="nb-pv" data-g="grade" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>채점 {c.scored ?? 0}/{c.n}{(c.toGrade ?? []).map((s) => <button key={s.id} type="button" className="btn sm pri" data-act="scored" data-student={s.id} disabled={pending} onClick={() => { run(() => scoredAct(c.material.id, s.id, true), `채점 ✓ · ${s.name}`); }}>{s.name} ✓</button>)}{(c.graded ?? []).map((s) => <button key={s.id} type="button" className="btn sm" data-act="unscored" data-student={s.id} disabled={pending} onClick={() => { run(() => scoredAct(c.material.id, s.id, false), `채점 취소 · ${s.name}`); }}>{s.name} 채점함</button>)}</span></div>}
    {/* (어96) 배부 크로스체크 — 원장님 2026-09-19 「자기가 챙겨서 받아갔다는 체크를 해야 … 생각없이 체크누르면 큰 문제가 돼」.
        아이가 찍은 「받았다」와 원장님 확인 도장이 **두 눈**이다. 손은 ✅ 채점 줄과 같은 꼴(원칙-1 · 새 꼴 0). */}
    {crossOf(c) && <div className="nb-prop"><span className="nb-pi">🤝</span><span className="nb-pv" data-g="cross" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {(() => { const x = crossOf(c); return <>받음 {x.ok}/{x.n}
        {x.left.map((s) => <button key={s.id} type="button" className="btn sm pri" data-act="give-check" data-student={s.id} disabled={pending} onClick={() => { run(() => checkedAct(c.material.id, [s.id], true), `확인 ✓ · ${s.name}`); }}>{s.name} ✓</button>)}
        {x.left.length > 1 && <button type="button" className="btn sm" data-act="give-check-all" disabled={pending} onClick={() => { run(() => checkedAct(c.material.id, x.left.map((s) => s.id), true), `확인 ✓ · ${x.left.length}명`); }}>전체 확인</button>}
        {x.checked.map((s) => <button key={s.id} type="button" className="btn sm" data-act="give-uncheck" data-student={s.id} disabled={pending} onClick={() => { run(() => checkedAct(c.material.id, [s.id], false), `확인 취소 · ${s.name}`); }}>{s.name} 확인함</button>)}</>; })()}
    </span></div>}
    {c.book && <div className="nb-prop"><span className="nb-pi">📚</span><span className="nb-pv">{c.book}</span></div>}
    {c.style && <div className="nb-prop"><span className="nb-pi">🧪</span><span className="nb-pv">{c.style}</span></div>}
    {c.kind === "score" && <div className="nb-prop"><span className="nb-pi">👧</span><span className="nb-pv">아이가 넣습니다</span></div>}
    {c.why && c.kind !== "score" && <div className="nb-prop"><span className="nb-pi">🧾</span><span className="nb-pv">{c.why}</span></div>}
    {c.note && <div className="nb-prop"><span className="nb-pi">✎</span><span className="nb-pv">{c.note}</span></div>}
    <div className="wv" style={{ marginTop: 6, gap: 4 }}>
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm pri" type="button" disabled={pending || Boolean(crossOf(c)?.locked)} data-act="done" onClick={() => { run(() => doneAct(c.todoId), (r) => (r?.state === "doing" ? `배부 ✓ · ${r.handed}명 · 다 받아 가면 닫힘` : `끝냈습니다. ${c.title}`)); }}>✓ 끝냄</button>}
      {crossOf(c)?.locked && <span className="note" data-g="cross-locked" style={{ margin: 0 }}>아직 안 받아 간 아이 {crossOf(c).left.length}명</span>}{/* (어96) 잠긴 까닭을 그 자리에서 말한다(대전제-0) */}
      {c.todoId && !c.material && (c.state === "todo" || c.state === "doing") && <button className="btn sm gho icb" type="button" disabled={pending} data-act="card-edit" {...icon("수정")} onClick={() => { setEditing(editing === c.id ? null : c.id); }}>{ACT.edit}</button>}{/* (어80) 원장님 2026-09-18 「입력한 세부내용자체도 추가수정삭제가 안됨」 */}
      {c.todoId && c.state === "dropped" && <button className="btn sm" type="button" disabled={pending} data-act="restore" onClick={() => { run(() => restoreAct(c.todoId), `복구 ✓ · ${c.title}`); }}>{ACT.restore} 복구</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={() => { run(() => dropAct(c.todoId, "05 에서 삭제"), (r) => (r?.material ? "삭제 ✓ · 자료와 남은 업무도 함께 · 복구 가능" : "삭제 ✓ · 복구 가능")); }}>삭제</button>}
      {c.todoId && (c.state === "done" || c.state === "dropped") && <button className="btn sm" type="button" disabled={pending} data-act="undo" onClick={() => { run(() => undoAct(c.todoId), "되돌렸습니다"); }}>되돌리기</button>}
      {c.todoId && (c.state === "todo" || c.state === "doing") && <DateBox type="date" className="dt" value={c.due ?? ""} aria-label={`${c.title} 마감`} onClick={(x) => x.stopPropagation()} onChange={(x) => run(() => dueAct(c.todoId, x.target.value), "마감을 바꿨습니다")} style={{ width: "auto" }} />}
      {c.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={() => { run(() => unitTestMadeAct(c.unitTestId), "출제했습니다. 오늘 수업 카드에 섭니다"); }}>출제 완료</button>}
      {c.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={() => { run(() => unitTestDueAct(c.dueUnitTest), "출제했습니다. 오늘 수업 카드에 섭니다(같은 것은 다시 안 생깁니다)"); }}>출제 완료</button>}
      {c.quizId && !c.paperAt && <button className="btn sm pri" type="button" disabled={pending} data-act="paper" onClick={() => { run(() => quizPaperAct(c.quizId, true), "종이 ✓ · 다음은 「✓ 끝냄」"); }}>🖨 재시험지 만들었음</button>}
      {c.quizId && c.paperAt && <><span className="tag on" data-g="paper">🖨 종이 ✓</span><button className="btn sm" type="button" disabled={pending} data-act="paper-undo" onClick={() => { run(() => quizPaperAct(c.quizId, false), "취소 ✓"); }}>취소</button></>}
      {/* (어89) 재시험도 **끝난다** — 원장님 2026-09-18 「재시함지는 왜 완료가 없어?」.
          종이는 중간 표시일 뿐이고, 카드를 사라지게 하는 것은 **아이가 그날 남아서 보는 것**이었는데
          그 자리가 01 에만 있어 05 에서는 끝낼 길이 없었다(다른 카드는 다 「✓ 끝냄」이 있다).
          여기서 틀린 개수만 적으면 **01 과 같은 손**(takeQuiz)이 그 아이 그날 일지에 적는다 — 새 손 0 */}
      {c.quizId && c.sheetId && !c.closed && <button className="btn sm pri" type="button" disabled={pending} data-act="retest-done" aria-pressed={taking === c.id} onClick={() => setTaking(taking === c.id ? null : c.id)}>✓ 끝냄</button>}
      {c.quizId && c.closed && <span className="pill" data-g="retest-locked">마감함 · 잠김</span>}{/* 마감한 판은 못 고친다(검사-⑤) — 안 눌리는 단추를 그리지 않는다(원장님 9/18 「눌리지도않음」) */}
      {c.quizId && <Link prefetch={false} className="btn sm goto" href="/today" onClick={(x) => x.stopPropagation()}>오늘 수업</Link>}
      {c.kind === "score" && <Link prefetch={false} className="btn sm goto" href={`/scores?e=${c.examId}`} onClick={(x) => x.stopPropagation()}>📈 성적</Link>}
      {c.exam && c.material && <Link prefetch={false} className="btn sm goto" href={`/schedule/exams/prep?e=${c.exam.id}`} onClick={(x) => x.stopPropagation()}>📄 자료</Link>}
    </div>
    {taking === c.id && <div data-g="retest-take" onClick={(x) => x.stopPropagation()} style={{ marginTop: 6 }} className="wv">
      <label className="fl" style={{ margin: 0 }}>틀린 개수</label>
      <input type="number" min="0" max={c.total ?? undefined} value={wrong} aria-label="틀린 개수" data-g="retest-wrong" onChange={(e) => setWrong(e.target.value)} style={{ width: 80 }} />
      {c.total != null && <span className="note" style={{ margin: 0 }}>/ {c.total}</span>}
      <button className="btn pri sm" type="button" disabled={pending || wrong === ""} data-act="retest-save"
        onClick={() => run(() => retestTakeAct(c.sheetId, c.quizId, Number(wrong)), (r) => (r?.state === "passed" ? "넘김 ✓" : r?.state === "failed" ? "못 넘김 · 재시험이 다시 섭니다" : "적음 ✓"), () => { setTaking(null); setWrong(""); })}>저장</button>
      <button className="btn sm gho" type="button" data-act="retest-cancel" onClick={() => { setTaking(null); setWrong(""); }}>취소</button>
    </div>}
    {editing === c.id && <div data-g="card-edit-form" onClick={(x) => x.stopPropagation()} style={{ marginTop: 6 }}>
      <QuickMemo inline edit={c} students={picks} classes={b.classes ?? []} kinds={kinds} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
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
      <DateBox type="date" className="dt" value={dueTo} aria-label="미룰 마감" onChange={(e) => setDueTo(e.target.value)} style={{ width: "auto" }} />
      <button type="button" className="btn sm" disabled={pending || !dueTo || !pickedCards.length} data-act="due-picked" onClick={() => run(() => manyAct(pickedCards.map((x) => x.todoId), "due", dueTo), (r) => `${r.n}개 마감을 ${dueTo} 로`, () => { pk.clear(); setDueTo(""); })}>📅 미루기</button>
      <button type="button" className="btn sm" disabled={pending || !toRestore.length} data-act="restore-picked" onClick={() => run(() => manyAct(toRestore.map((x) => x.todoId), "restore"), (r) => `복구 ✓ · ${r.n}개`, pk.clear)}>{ACT.restore} 복구 {toRestore.length}</button>
      <select value={moveTo} aria-label="옮길 분류" onChange={(e) => setMoveTo(e.target.value)} style={{ width: "auto" }}><option value="">분류</option>{klist.filter((k) => k.state === "active").map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}</select>
      <button type="button" className="btn sm" disabled={pending || !moveTo || !pickedCards.length} data-act="move-kind" onClick={() => run(() => moveKindAct(pickedCards.map((x) => x.todoId), moveTo), (r) => `옮김 ✓ · ${r.n}개`, () => { pk.clear(); setMoveTo(""); })}>↔ 분류 옮기기</button>{/* (어80) 원장님 「세부내용의 일괄처리 · 분류 옮기기가능하게」 */}
      <button type="button" className="btn sm gho" disabled={pending || !pickedCards.length} data-act="drop-picked" onClick={() => run(() => manyAct(pickedCards.map((x) => x.todoId), "drop"), (r) => `삭제 ✓ · ${r.n}개 · 복구 가능`, pk.clear)}>삭제 {pickedCards.length}</button>
    </PickBar>
    <div className="wv" style={{ margin: "0 0 8px" }}><span className="spacer" /><Sibs here="/schedule/todo" /></div>
    <div className="card" data-g="quick-card" style={{ marginBottom: 8 }}><QuickMemo inline students={picks} classes={b.classes ?? []} kinds={kinds} /></div>{/* (어78) 원장님 2026-09-17 「업무페이지 상단에 바로 내용입력할 수 있게, 현재는 1클릭필요함」 — 상단 띠 📌 와 **같은 부품**이다(원칙-1) */}
    <div className="nb-viewbar" data-g="viewbar">
      <button type="button" className="nb-tab" aria-current={view === "table"} data-act="view-table" onClick={() => setView("table")}><span className="nb-ic">⊞</span>표</button>
      <button type="button" className="nb-tab" aria-current={view === "board"} data-act="view-board" onClick={() => setView("board")}><span className="nb-ic">▦</span>보드</button>
      <div className="nb-tools">
        <button type="button" className="nb-new" data-act="new-open" onClick={() => setNw(nw ? null : "menu")}>새로 만들기 ⌄</button>
      </div>
    </div>
    {nw === "menu" && <div className="card" data-g="new-menu" style={{ marginTop: 8 }}><div className="wv">
      <span className="fl" style={{ margin: 0 }}>새로 만들기</span>
      <button className="btn sm" type="button" data-act="new-material" onClick={() => setNw("material")}>📄 자료</button>
      <button className="btn sm" type="button" data-act="new-unit-test" onClick={() => setNw("unit_test")}>✍️ 단원평가 출제</button>
      <button className="btn sm" type="button" data-act="new-repeat" onClick={() => setNw("repeat")}>⏰ 반복</button>
      <span className="spacer" /><button className="btn sm" type="button" onClick={() => setNw(null)}>닫기</button></div></div>}
    {/* (어94) 「📄 자료」는 **그 자리에서** 세운다 — 04 로 보내던 링크 목록을 걷었다(대전제-22 · 원장님 2026-09-19 「내신을 업무에 통합」).
        양식·손은 04 와 같은 한 벌(app/_shell/materialmodal.js · lib/todo.js addMaterial · 원칙-1) */}
    {nw === "material" && <MaterialModal exams={b.exams_soon ?? []} load={materialFormAct} save={addMaterialAct} onClose={() => setNw(null)}
      onSaved={(r) => { setMsg(`자료를 세웠습니다. 항목 ${r.items} · 배정 ${r.students}명 · 업무 ${r.todos}`); router.refresh(); }} />}
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
      {cols.map((col, i) => <div className={"nb-col" + (drag && over === col.kind ? " nb-drop" : "")} key={col.kind} data-g="col" data-kind={col.kind} data-drop={drag && over === col.kind ? "1" : "0"}>
        <div className="nb-colh"><PickGroup pick={pk} ids={col.cards.filter((x) => x.todoId).map((x) => x.id)} label="" />{/* (어80) 원장님 2026-09-18 「전체선택버튼이 없음」 — 칸마다 그 칸만 집는다(20 올린 기록과 같은 부품) */}
          <span className={"nb-pill " + col.cls}>{col.name}</span><span className="nb-cnt" data-g="col-count">{col.count}</span>
          {col.state === "off" && <span className="tag" data-g="col-off">삭제됨</span>}
          {/* (어90b) 원장님 2026-09-18 「업무 칸반 서로 이동이 안돼 가로 순서변경」 — 칸 순서 손 ◀▶ 이
              **✏️ 수정 양식을 열어야만** 나와서 못 찾으셨다. 칸 머리로 꺼낸다(누르는 자리에 둔다 · 대전제-22). */}
          {kinds && <span className="ord" data-g="kind-order" style={{ marginLeft: 4 }}>
            <button type="button" disabled={pending || i === 0} data-act="kind-up" {...icon(`${col.name} 앞으로`)} onClick={() => run(() => kindOrderAct(col.kind, -1), "앞으로 ✓")}>◀</button>
            <button type="button" disabled={pending || i === cols.length - 1} data-act="kind-down" {...icon(`${col.name} 뒤로`)} onClick={() => run(() => kindOrderAct(col.kind, 1), "뒤로 ✓")}>▶</button>
          </span>}
          {kinds && <button className="btn sm gho icb" type="button" disabled={pending} data-act="kind-edit" aria-pressed={kindOpen === col.kind} {...icon("분류 수정")} onClick={() => openKind(col)}>{ACT.edit}</button>}</div>
        {kindOpen === col.kind && kindForm(col)}
        {col.cards.map((x) => Card({ c: x, k: x.id }))}
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
        {hidden.dropped.length > 0 && <button type="button" className="nb-hg" data-act="show-dropped" aria-pressed={Boolean(show.dropped)} onClick={() => setShow({ ...show, dropped: !show.dropped })}>👁 <span className="nb-pill">삭제한 것</span><span className="nb-cnt">{hidden.dropped.length}</span></button>}
        {hidden.reuse.length > 0 && <div className="nb-hh" style={{ paddingTop: 8 }}>이미 있는 것 {hidden.reuse.length} · {hidden.reuse.map((x) => x.title).join(" · ")}. 「만들기」가 <b>체크된 채로</b> 섰습니다(㊵)</div>}
        {show.done && hidden.done.map((x) => Card({ c: x, k: x.id }))}
        {show.reuse && hidden.reuse.map((x) => Card({ c: x, k: x.id }))}
        {show.dropped && hidden.dropped.map((x) => Card({ c: x, k: x.id }))}
      </div>
    </div>}
    {view === "table" && <div className="tblwrap" data-g="table"><table><thead><tr><th><PickGroup pick={pk} ids={cards.filter((x) => (x.state === "todo" || x.state === "doing") && x.todoId).map((x) => x.id)} label="전체" /></th><th>종류</th><th>업무</th><th>마감</th><th>학교</th><th>인원</th><th>단계</th><th>왜 생겼나</th><th></th></tr></thead><tbody>
      {/* (어92) 원장님 2026-09-18 「모든 목록은 전체, 일부선택 → 선택후 일괄액션」 · 대전제-19·20 —
          보드에서 되는 일(고르기 · ✎ · 삭제 · 마감)이 **표에서는 하나도 안 됐다**. 같은 손을 같은 줄에 단다(새 손 0). */}
      {cards.filter((x) => x.state === "todo" || x.state === "doing").map((x) => <tr key={x.id} className={isOverdue(x, today) ? "hi" : ""} data-g="row" data-kind={x.kind} data-id={x.id}>
        <td>{x.todoId ? <PickBox pick={pk} id={x.id} label={`${x.title} 고르기`} /> : null}</td>
        <td><span className={"nb-pill " + (cols.find((cl) => cl.kind === x.kind)?.cls ?? "")}>{kindName(x.kind, klist)}</span></td><td className="sch">{x.title}{x.extra ? ` · ${x.extra}` : ""}</td><td>{dueLine(x, today)}</td><td>{x.school ? schoolTag(x) : ""}</td><td className="num">{x.n ?? ""}</td>
        <td>{x.checks ? x.checks.filter((s) => ["make", "print", "hand"].includes(s.step)).map((s) => `${s.done ? "✓" : "·"}${s.name}`).join(" ") : ""}</td><td>{x.why ?? ""}</td>
        <td>{x.todoId && <button className="btn sm pri" type="button" disabled={pending} data-act="done" onClick={() => run(() => doneAct(x.todoId), "끝냄 ✓")}>✓ 끝냄</button>}
          {x.todoId && !x.material && <button className="btn sm gho icb" type="button" disabled={pending} data-act="row-edit" {...icon("수정")} onClick={() => { setView("board"); setDetail(x.id); setSel(x.id); }}>{ACT.edit}</button>}
          {x.todoId && <DateBox type="date" className="dt" value={x.due ?? ""} aria-label={`${x.title} 마감`} disabled={pending} onChange={(e) => run(() => dueAct(x.todoId, e.target.value || null), "마감 ✓")} style={{ width: "auto" }} />}
          {x.todoId && <button className="btn sm gho" type="button" disabled={pending} data-act="row-drop" onClick={() => run(() => dropAct(x.todoId, "05 에서 삭제"), (r) => (r?.material ? "삭제 ✓ · 자료와 남은 업무도 함께 · 복구 가능" : "삭제 ✓ · 복구 가능"))}>삭제</button>}{x.unitTestId && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-made" onClick={() => run(() => unitTestMadeAct(x.unitTestId), "출제했습니다")}>출제 완료</button>}{x.dueUnitTest && <button className="btn sm pri" type="button" disabled={pending} data-act="ut-make" onClick={() => run(() => unitTestDueAct(x.dueUnitTest), "출제했습니다")}>출제 완료</button>}</td>
      </tr>)}
      {!cards.filter((x) => x.state === "todo" || x.state === "doing").length && <tr><td colSpan={8} className="note">업무가 없습니다</td></tr>}
    </tbody></table></div>}
    <div className="two" style={{ marginTop: 12 }}>
      <div className="card" style={{ margin: 0 }} data-g="flow">
        <div className="ctitle"><span className="cemo">📦</span>자료 단계{selCard?.material ? ` · ${selCard.material.type} · ${selCard.material.title}` : ""}</div>
        {selCard?.material ? Flow({ card: selCard }) : <p className="note" style={{ margin: 0 }}>자료 카드를 누르면 여기 섭니다</p>}
      </div>
      <div className="card" style={{ margin: 0, borderColor: behind.length ? "var(--miss)" : undefined }} data-g="behind">
        <div className="ctitle"><span className="cemo">🔥</span>{behind.length ? `${behind[0].title}` : "못 따라가는 시험 없음"}</div>
        {!behind.length && <p className="note" style={{ margin: 0 }}>남은 자료가 남은 날 × {b.rules?.["todo.behind_per_day"] ?? 1} 안입니다</p>}
        {behind.map((x) => <div className="lf over" key={x.exam.id} data-g="behind-row"><span className="ln">{x.remaining}</span><div><b>{x.text}</b><small>{x.small}</small></div>
          <button className="btn sm pri" type="button" data-act="behind-open" onClick={() => setBehindOpen(behindOpen === x.exam.id ? null : x.exam.id)}>줄이기</button></div>)}
        {behindOpen && <div className="left" data-g="behind-list">{cards.filter((x) => x.kind === "make" && (x.state === "todo" || x.state === "doing") && x.exam?.id === behindOpen).map((x) => <div className="lf" key={x.id}><span className="ln">·</span><div><b>{x.title}</b><small>{dueLine(x, today)}</small></div><button className="btn sm" type="button" disabled={pending} data-act="behind-drop" onClick={() => run(() => dropMaterialAct(x.material.id, "못 따라가서 줄임(05 🔥)"), `자료 삭제 ✓ · ${x.title} · 남은 업무도 함께`)}>자료 삭제</button></div>)}</div>}
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
    {/* (어88) 세부 내용 — 원장님 2026-09-18 「추가한 업무를 눌러서 세부내용확인 불가능」.
        카드에 접혀 있던 것을 **한 자리에 펴서** 보여 준다: 분류 · 마감 · 첨부(사진은 크게) · 왜 생겼나 · 메모.
        고치기는 **같은 양식 한 벌**(QuickMemo edit · 원칙-1)이고, 상태 손(끝냄·삭제·복구)도 카드의 그 손 그대로다 — 새 손 0 */}
    {dCard && <div className="mdlov" data-g="card-detail" role="dialog" aria-modal="true" aria-label={`${dCard.title} 세부 내용`} onClick={(x) => { if (x.target === x.currentTarget) setDetail(null); }}>
      <div className="mdl" style={{ width: "min(560px,100%)" }}>
        <div className="mdlh"><span className={"nb-pill " + (cols.find((cl) => cl.kind === dCard.kind)?.cls ?? "")}>{kindName(dCard.kind, klist)}</span><b>{dCard.title}</b><span className="spacer" />
          <button type="button" className="x" {...icon("닫기")} onClick={() => setDetail(null)}>✕</button></div>
        <div className="mdlb">
          <div className="left" data-g="detail-props">
            <div className="lf"><span className="ln">{FACE.schedule}</span><div><b>{dueLine(dCard, today)}</b><small>{dCard.startOn ? `${monthDay(dCard.startOn)} 부터` : "시작일 없음"}</small></div></div>
            {dCard.school && <div className="lf"><span className="ln">{FACE.school}</span><div><b>{dCard.school}</b><small>{dCard.n != null ? `${dCard.n}명` : ""}</small></div></div>}
            {dCard.book && <div className="lf"><span className="ln">{FACE.books}</span><div><b>{dCard.book}</b><small>교재</small></div></div>}
            {dCard.note && <div className="lf"><span className="ln">✎</span><div><b style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{dCard.note}</b><small>메모</small></div></div>}
            {dCard.why && <div className="lf"><span className="ln">🧾</span><div><b style={{ fontWeight: 400 }}>{dCard.why}</b><small>왜 생겼나</small></div></div>}
          </div>
          {dCard.material && <div style={{ marginTop: 8 }} data-g="detail-flow"><span className="fl" style={{ margin: "0 0 4px" }}>{FACE.files} {dCard.material.type} · {dCard.material.title}</span>{Flow({ card: dCard })}</div>}
          {dCard.files?.length > 0 && <div className="wv" data-g="detail-files" style={{ gap: 6, marginTop: 8 }}>
            {dCard.files.map((f) => (isImage(f.mime)
              ? <Photo key={f.id} id={f.id} name={f.name} size={110} />
              : <a key={f.id} className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{FACE.files} {f.name}</a>))}
          </div>}
          {dCard.todoId && !dCard.material && (dCard.state === "todo" || dCard.state === "doing")
            && <div style={{ marginTop: 10 }}><QuickMemo inline edit={dCard} students={picks} classes={b.classes ?? []} kinds={kinds} onSaved={() => setDetail(null)} onCancel={() => setDetail(null)} /></div>}
        </div>
        <div className="mdlf">
          {dCard.todoId && (dCard.state === "todo" || dCard.state === "doing") && <button className="btn sm" type="button" disabled={pending} data-act="detail-done" onClick={() => run(() => doneAct(dCard.todoId), "끝냄 ✓", () => setDetail(null))}>✓ 끝냄</button>}
          {dCard.todoId && dCard.state === "dropped" && <button className="btn sm" type="button" disabled={pending} data-act="detail-restore" onClick={() => run(() => restoreAct(dCard.todoId), "복구 ✓", () => setDetail(null))}>복구</button>}
          <span className="spacer" />
          {dCard.todoId && (dCard.state === "todo" || dCard.state === "doing") && <button className="btn sm gho" type="button" disabled={pending} data-act="detail-drop" onClick={() => run(() => dropAct(dCard.todoId, "05 에서 삭제"), (r) => (r?.material ? "삭제 ✓ · 자료와 남은 업무도 함께 · 복구 가능" : "삭제 ✓ · 복구 가능"), () => setDetail(null))}>삭제</button>}
        </div>
      </div>
    </div>}
  </>;
}
