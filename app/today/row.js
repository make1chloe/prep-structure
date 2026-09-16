"use client";
/** 학생 줄 — 목업 01 의 .row 그대로. 자주 누르는 것(출결 · ○△✕)은 낙관적: 화면 먼저, 저장은 뒤에서, 실패하면 되돌리고 그 자리에서 말한다(속도-5).
 *  마감·발송처럼 되돌릴 수 없는 것은 서버 답을 기다린다. 마감된 판은 읽기만 한다 */
import { Fragment, useState, useRef, useEffect, useMemo, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookNextRound, bookMove, itemText, itemRemove, itemRestore, dispose, disposeMany as disposeAll, checkAll, give, ccSkipAct, setAttend, setAttendReason, check, rest, add, move, late, lateSend, stayDoneAct, stayAllDoneAct, stayCarryAct, stampAt, quizStyle, comment, close, openSheet, mode as setMode, stop as setStop, wave as pickWave, memo as saveMemo, quizAdd, quizSet, quizTake, quizRetest, quizSkip, tuneOpen, tuneApply, reflectAs, warnLimit, progressOpen, progressSet, progressSkip, progressSetMany, progressUpTo, planView, planPut, planSend, commentDraft, areaMemo, unitScore, lateLeft, slotView } from "./actions.js";
import { monthGrid, nextYm, markOf, makeupText, LATE_PRESET, KIND as PLAN_KIND } from "@/lib/plan-plan";
import { weekdayName, seoulTime, shutCards, checkText, checkIcons, workText, firstTask, taskDone, ATTEND, ATTEND_REASON, REASON_ON, fromLast, bookLine, splitChecks } from "@/lib/day-plan";
import { prepOf, prepBadge } from "@/lib/todo-plan";
import PrepCard from "./prep.js";
import ProgressModal from "../_shell/progressmodal.js";   // (어41) 진도 체크 모달 한 벌(대시보드와 같은 부품) · 손은 수업 일지 기준
import AssignModal from "../_shell/assignmodal.js";       // (어41) 교재 배정 모달 한 벌(대시보드 · 14 와 같은 부품)
import { ItemTree } from "../_shell/tree.js";
import { useModalErr } from "../_shell/modalerr.js";   // (어49) 모달 안 오류 한 벌              // (어42) 항목 나무 한 벌(영역 › 교재 › 단원 › 활동 · 07 · 09 와 같은 부품)
const progApi = (sheet) => ({ open: (bk) => progressOpen(sheet.id, bk), set: (u, st) => progressSet(sheet.id, u, st), setMany: (ids, st) => progressSetMany(sheet.id, ids, st), upTo: (bk, u) => progressUpTo(sheet.id, bk, u), skip: (bk, c) => progressSkip(sheet.id, bk, c) });
import { hhmm, leftText, repeatBand, askBeforeClose, reasonChips, toggleReason, usualText, stayRows, stayCounts } from "@/lib/late-plan";
import { whoMeta, marks, roundPill, unseenPill, todayUnits, MEMO_AREAS, unitResult } from "@/lib/roster-plan";
import { KIND as CKIND, CAPS, kindName, capName, capOf, pickKind, countChars, attached, preview, sameAsDraft } from "@/lib/comment-plan";
import { examPhase } from "@/lib/exam-plan";
import { TRI } from "@/lib/progress-plan";
import { plannerLine, shortText, SET_TYPE } from "@/lib/cc-plan";
import { DISPOSAL } from "@/lib/warn-plan";
import { slotText } from "@/lib/class-plan";
import { itemTitle, itemSub, pagesText } from "@/lib/item-plan";   // 항목 줄 글 한 벌((어27) · 원장님 9/15 「교재와 진도, 숙제종류 내지 내용이 있어야함」)
import { KIND, SOURCE, S_WAY, scopeText } from "@/lib/quiz-plan";
import { useOpen, usePickCtx } from "./board.js";
import { PickBox, PickGroup, PickBar, usePick } from "../_shell/pick.js";   /* 고르기 한 벌((어28)-② · 대전제-20) · 마감된 줄은 자리만 */
import CardOrder from "../_shell/cardorder.js";
import { orderCards } from "@/lib/pref-plan";
import { isUnchecked, CHECK, CHECK_KEY } from "@/lib/status";
import { STOP, MODE, stopOn, tuneStep, tuneCount, tuneSorted, loadOf, splitPresets, trimCounts, heavyBand, waveLabel, bookOrder } from "@/lib/routine-plan";
import { timerText, arrivalTimes, STAMP_NAME } from "@/lib/arrival-plan";   // (어48) 출결 곁의 도착·하원 시각   // (어35) 학습 줄의 타이머 꼬리표(07 과 같은 글)
const UPTO = ["시작만", "절반", "거의 다"];
const REST = [["class", "오늘 학습으로"], ["home", "다음 숙제로"], ["stay", "남아서"]];
const PLUS = [[20, "+20분"], [40, "+40분"], [60, "+1시간"]];
const plus = (min) => { const t = new Date(Date.now() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
const attendName = (v) => ATTEND.find(([k]) => k === v)?.[1] ?? v;

export default function Row({ student, sheet, classId, classEnd = "", date, minutes, cfg, future = false, pref = null, prep = [] }) {
  const [open, setOpen, nextOf] = useOpen(student.id);   // 한 번에 한 아이((어12) board.js) — PC 는 이름 열 · 판 열
  const pk = usePickCtx();   /* (어28)-② 고르기 · 판(board.js)이 들고 있다 */
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const closed = Boolean(sheet?.closed);
  const fail = (r) => { if (r && !r.ok) setErr(r.msg); return r?.ok; };
  const errRef = useRef(null); useEffect(() => { if (err) errRef.current?.scrollIntoView?.({ block: "center" }); }, [err]);   // (어38) 실패 글은 판 맨 위에 서서 폰에선 안 보였다(원장님 9/15 「이거 버튼 안 먹힘」) · 뜨면 그리로 굴린다
  // 출결 — 낙관적
  const [attend, setAttendLocal] = useState(sheet?.attend ?? (student.plan?.absent ? "absent" : student.plan?.late ? "late" : "present"));
  const [reason, setReasonLocal] = useState(sheet?.attend_reason ?? null);   // (어44) 지각·결석 까닭 · 낙관적 · 다시 누르면 뗀다
  const pickReason = (k) => { if (closed || !sheet?.id) return; const prev = reason, next = reason === k ? null : k; setReasonLocal(next); setErr("");
    start(async () => { const r = await setAttendReason(sheet.id, next); if (!fail(r)) setReasonLocal(prev); }); };
  const [plan, setPlan] = useState(false);
  const [barHost, setBarHost] = useState(null);   // 판 끝 저장줄(목업 01·03) — ✉️ 카드가 단추를 여기로 내보낸다(portal). 판의 직접 자식이라 sticky 가 판 안에서 화면 아래에 붙는다(폰-6 · PC 는 오른쪽 열 안)
  const pickAttend = (v) => { if (closed) return; const prev = attend; setAttendLocal(v); setErr(""); if (!REASON_ON.includes(v)) setReasonLocal(null);
    start(async () => { let id = sheet?.id; if (!id) { const r = await openSheet(student.id, classId, date); if (!fail(r)) { setAttendLocal(prev); return; } id = r.sheetId; } const r = await setAttend(id, v); if (!fail(r)) setAttendLocal(prev); }); };
  const nCheck = sheet?.check.length ?? 0, nLeft = sheet?.check.filter(isUnchecked).length ?? 0;
  const sh = shutCards(sheet, { stay: student.stay, closed });
  // (어21) 3단 — 가운데 업무 목록 · 오른쪽 그 업무 하나. 아이를 열면 흐름에서 처음 안 끝난 업무(firstTask)가 열리고, 그 뒤엔 누른 것만 바뀐다(예측 가능 — 원장님 9/14 「창이 이동해서 화면이 예측불가능해지는게 더 불편」)
  const prepList = prepOf(prep, date, stopOn);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (sheet && sel == null) setSel(firstTask(sheet)); }, [sheet?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cur = sel ?? (sheet ? firstTask(sheet) : null);
  const checkDone = taskDone("check", { sheet }), wasDone = useRef(checkDone);   // (어24) 검사가 끝나는 순간 오늘 학습이 열린다(늘 같은 차례 — 대전제-17)
  useEffect(() => { if (checkDone && !wasDone.current && cur === "check") setSel("work"); wasDone.current = checkDone; }, [checkDone]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [hasNext, setHasNext] = useState(false);
  useEffect(() => { setHasNext(Boolean(nextOf(false))); }, [open, closed]);   // eslint-disable-line react-hooks/exhaustive-deps   // (어9) 지금 쓸 일이 없는 카드는 접어 둔다 — 설정이 아니라 상태로(원장님 2026-09-12 「더 편하고 간단하게 고도화」)
  const status = closed ? "마감됨" : student.plan?.absent && !sheet ? `결석 예정 · ${makeupText(student.plan)}` : attend === "absent" ? "결석 · 보강 안 잡힘" : student.plan?.makeup && !closed ? `보강 ${String(student.plan.at_time ?? "").slice(0, 5)}` : student.plan?.late && !sheet ? `지각 예정${student.plan.minutes ? ` ${student.plan.minutes}분` : ""}` : nLeft ? (unseenPill(sheet.check, date) || `검사 ${nLeft}/${nCheck} 남음`) : null;
  // 카드 차례 · 기본은 생각의 흐름(① 검사 → ② 학습 · ③ 숙제 → 메모 → 하원 지연 → 글 · (어12)) · 바꾸면 그 사람 것((어15) screen_pref today · 확정-⑮ · 원장님 9/14 「차례를 바꾸고 싶으면 드래그로 바꿀 수 있게」). 번호는 선 자리 순
  const cards = sheet ? orderCards([
    { id: "check", name: "숙제 검사", steps: 1, badge: [checkText(sheet), ...checkIcons(student)].join(" · "), node: (no) => <CheckCard no={no} sheet={sheet} student={student} date={date} passPct={cfg?.unitPass} closed={closed} fail={fail} start={start} /> },
    { id: "work", name: "오늘 학습 · 숙제", steps: 2, badge: workText(sheet, student.books ?? [], date), node: (no) => <WorkCard no={no} heavyPages={cfg?.heavyPages ?? 0} sheet={sheet} books={student.books ?? []} next={student.quizzes?.next ?? []} scopes={student.scopes ?? []} date={date} minutes={minutes} closed={closed} fail={fail} start={start} onPrep={() => setSel("prep")} memoNode={<AreaMemoCard sheet={sheet} books={student.books ?? []} shut={null} closed={closed} fail={fail} start={start} />} lateNode={<LateCard sheet={sheet} warn={student.warn} stay={student.stay} books={student.books ?? []} studentId={student.id} date={date} classEnd={classEnd} shut={null} closed={closed} fail={fail} start={start} />} folds={{ late: !sh.late?.shut, memo: !sh.areamemo?.shut, memoText: sh.areamemo?.text ?? "", lateText: sh.late?.text ?? "" }} /> },   // (어24) 🗺 메모·🌙 하원 지연은 오늘 학습 안 접이 · 적힌 것이 있으면 펴진 채(shutCards 한 곳)
    { id: "prep", name: "내신 자료", emo: "📄", steps: 0, badge: prepBadge(prepList), node: () => <PrepCard student={student} prep={prep} date={date} closed={closed} /> },   // (어21) 교재가 멈춘 아이만 — 아래 filter
    { id: "comment", name: "부모님께 나갈 글", emo: "✉️", steps: 0, badge: closed ? "마감됨" : sheet.comment_ai ? "초안 준비됨" : (sh.comment?.text ?? ""), node: () => <CommentCard sheet={sheet} student={student} shut={sh.comment} closed={closed} fail={fail} start={start} cfg={cfg?.comment} phase={cfg?.phase} date={date} barHost={barHost} future={future} onCollapse={() => setOpen(false)} active={cur === "comment"} hasNext={hasNext} onNext={() => nextOf(true)} /> },
  ].filter((c) => c.id !== "prep" || prepList.length > 0), pref) : [];
  const heads = [], bodies = [];
  for (let no = 1, i = 0; i < cards.length; i++) { const c = cards[i], next = cards[i + 1]; heads.push({ id: c.id, name: c.name, no: c.steps ? no : null, emo: c.emo, badge: c.badge, done: taskDone(c.id, { sheet, closed, prepList }) });
    bodies.push(<div key={c.id} className="tbody" data-task={c.id} data-sel={cur === c.id ? "1" : "0"}>{c.node(no)}{next && <div className="tnext"><span className="spacer" /><button type="button" className="btn sm" data-act="task-next" onClick={() => setSel(next.id)}>다음 → {next.name}</button></div>}</div>); no += c.steps; }
  return (
    <div className={"row" + (closed ? " closed" : "")} data-open={open ? "1" : "0"} data-student={student.id}>
      <div className="rowtop" onClick={(e) => { if (open || e.target.closest("button,a,input,select,textarea,label")) return; setOpen(true); }}>
        {pk && <PickBox pick={pk} id={student.id} label={`${student.name} 고르기`} disabled={closed} />}<span className="who">{student.name}</span><span className="meta">{whoMeta(student)}</span>
        <span className="marks">{marks(sheet?.check ?? []).map((m, i) => <i key={i} className={"dot" + (m.cls ? " " + m.cls : "")}>{m.ch}</i>)}</span>
        <div className="seg sm" data-g="att" aria-label={`${student.name} 출결`}>
          {ATTEND.map(([v, name]) => <button key={v} type="button" aria-pressed={attend === v} disabled={closed} onClick={() => pickAttend(v)}>{name}</button>)}
        </div>
        {REASON_ON.includes(attend) && sheet?.id && <div className="seg sm" data-g="att-reason" aria-label={`${student.name} 까닭`}>{ATTEND_REASON.map(([k, name]) => <button key={k} type="button" aria-pressed={reason === k} disabled={closed} onClick={() => pickReason(k)}>{name}</button>)}</div>}{/* (어44) 지각·결석 까닭 넷 · 원장님 9/15 · 진료·학교 일정은 경고에 안 센다(규칙 warn.excused) */}
        {sheet?.id && <AttTimes student={student} date={date} closed={closed} fail={fail} start={start} />}{/* (어48) 도착 · 하원 시각 · 원장님 9/16 */}
        <span className="spacer" />
        {sheet && <span className="pill hw">학원 {sheet.class.length} · 숙제 {sheet.home.length}</span>}
        {roundPill(student.books) && <span className="pill">{roundPill(student.books)}</span>}
        {student.warn?.count > 0 && <span className={"pill" + (student.warn.due || student.warn.today_disposal ? " bad" : "")} data-warn="1" data-why={student.warn.today_why ?? ""}>경고 {student.warn.count}{student.warn.due || student.warn.today_disposal ? " · 반성문" : ""}</span>}
        {status && <span className={"pill" + (closed ? "" : attend === "absent" ? " bad" : " warn")}>{status}</span>}
        <button type="button" className="btn sm" data-act="plan" onClick={() => setPlan(true)}>📅 예정</button>
        <button type="button" className="open" onClick={() => setOpen(!open)}>{open ? "닫기" : "펴기"}</button>
      </div>
      {plan && <PlanModal student={student} date={date} fail={fail} start={start} onClose={() => setPlan(false)} />}
      {open && (
        <div className="panel">
          {err && <div ref={errRef} className="lf warn" role="alert" style={{ margin: "0 0 8px" }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
          {!sheet && <div className="card"><p className="note">수업 일지 없음 · 출결을 누르면 섭니다</p></div>}
          {sheet && <nav className="tasks" data-g="tasks" aria-label="업무">{heads.map((h) => <button key={h.id} type="button" className={"tk" + (h.done ? " done" : "")} data-g="task" data-task={h.id} data-done={h.done ? "1" : "0"} aria-pressed={cur === h.id} onClick={() => setSel(h.id)}><span className="n">{h.done ? "✓" : (h.no ?? h.emo)}</span><b>{h.name}</b><span className="spacer" /><span className="tb" data-g="task-badge">{h.badge}</span></button>)}</nav>}
          {sheet && <div className="tbodies">{bodies}</div>}
          {sheet && <div className="torder"><CardOrder screen="today" cards={cards.map((c) => ({ id: c.id, name: c.name }))} /></div>}
          {sheet && !closed && <div className="savebar rowbar" ref={setBarHost} />}
        </div>
      )}
    </div>
  );
}

/** 1 숙제 검사 — **① 숙제 봤나** 한 카드((어12) · 원장님 2026-09-13 「생각의 흐름에 따라 페이지를 따라가게」): 지난 숙제 ○△✕ → 🃏 클래스카드 → 📝 단원평가 → 🔤 시험(**무조건 맨 끝** — 「차라리 무조건 단어를 숙제검사 마지막에 넣어」).
 *  **제목 줄이 오늘 볼 것을 말한다**(🃏 · 📝 · 🔤) — 없으면 안 적힌다(「단원평가가 해당되는지 아닌지는 어케알아」 → 제목에 📝 가 없으면 안 보는 아이 · 대전제-0). 아이마다 자리가 다르지 않다(대전제-14 — 원장님이 다르게 놓으실 날이 없는 것은 단추가 아니라 기본값) */
function CheckCard({ sheet, student, date, passPct, closed, fail, start, no = 1 }) {
  const left = sheet.check.filter(isUnchecked).length;
  const cc = student.cc ?? [], units = student.unitTests ?? [], quizzes = student.quizzes?.today ?? [];
  const has = checkIcons(student);   // 제목 줄이 오늘 볼 것을 말한다 — 업무 목록 꼬리표와 같은 글(day-plan · 원칙-1)
  // (어47) 원장님 9/16 「숙제검사가 완료된 건 접어서 스크롤줄이고(완료미흡미완료여부는 보이게표시)」 · 「교재보류는 접힌채로 아예 검사에서 맨밑으로」 · 판단은 day-plan splitChecks(순수) · 이 자리에서 검사한 줄과 칩을 눌러 다시 연 줄은 다시 열 때까지 펴 둔다(opened)
  const [opened, setOpened] = useState(() => new Set());
  const [showStopped, setShowStopped] = useState(false);
  const stopped = new Set((student.books ?? []).filter((b) => stopOn(b, date) === "book_off").map((b) => b.book_id));
  const parts = splitChecks(sheet.check, { stopped, opened });
  const glyph = (s) => CHECK.find(([v]) => v === s)?.[1] ?? "";
  const row = (it, i, g) => <CheckItem key={it.id} it={it} closed={closed} fail={fail} start={start} grouped={Boolean(g.unit)} onMarked={(id) => setOpened((s) => new Set(s).add(id))} />;
  return (
    <div className="card" data-card="check">
      <div className="ctitle"><span className="stepno">{no}</span>숙제 검사<span className="auto">{checkText(sheet)}{has.length ? ` · ${has.join(" · ")}` : ""}</span><span className="spacer" />{!closed && left > 0 && <button type="button" className="btn sm pri" data-act="check-all" onClick={() => start(async () => { fail(await checkAll(sheet.id)); })}>다 ○</button>}</div>
      <ItemTree rows={parts.open} all={sheet.check} row={row} fold={false} dense />{/* (어42) 영역 › 📕 교재 › 단원 › 활동 · 나무 한 벌(app/_shell/tree.js · 01 학습·숙제 · 07 · 09 도 같은 것) · (어47) 단원 머리는 안 접힌다 · 촘촘히 */}
      {parts.done.length > 0 && <div className="chkdone" data-g="check-done">{parts.done.map((b) => <div key={b.key} className="cdb" data-g="check-done-book"><span className="cdn">📕 {b.book ?? "그 밖에"}</span>
        {b.rows.map((it) => <button key={it.id} type="button" className="cdc" data-act="unfold" data-id={it.id} data-v={CHECK_KEY[it.status]} onClick={() => setOpened((s) => new Set(s).add(it.id))}>{glyph(it.status)} {itemTitle(it)}{it.done_note ? ` · ${it.done_note}` : ""}</button>)}</div>)}</div>}
      {parts.stopped.length > 0 && <div className="chkstop" data-g="check-stopped"><button type="button" className="btn sm gho" data-act="stopped-open" aria-pressed={showStopped} onClick={() => setShowStopped((v) => !v)}>{showStopped ? "▾" : "▸"} 교재 보류 · 검사 {parts.stopped.length}</button>
        {showStopped && <ItemTree rows={parts.stopped} all={sheet.check} row={row} fold={false} dense />}</div>}
      {cc.length > 0 && <CcPart rows={cc} closed={closed} fail={fail} start={start} />}
      {units.map((t) => <UnitTestPart key={t.id} t={t} passPct={passPct} date={date} closed={closed} fail={fail} start={start} />)}
      {quizzes.length > 0 && <QuizPart sheet={sheet} quizzes={quizzes} closed={closed} fail={fail} start={start} />}
    </div>
  );
}
function CheckItem({ it, closed, fail, start, grouped = false, onMarked = null }) {   // grouped: 단원 머리 아래 줄이라 밑줄에서 단원 글을 뺀다((어32)) · onMarked: (어47) 이 자리에서 검사한 줄은 접지 않는다
  const [st, setSt] = useState(isUnchecked(it) ? null : it.status);
  const [upto, setUpto] = useState(it.done_note ?? "");
  const [restTo, setRestTo] = useState(null);
  const sub = itemSub(it, { unit: !grouped });   // 교재 · 단원 · 쪽 · 문항(단원 머리가 있으면 뺀다) · 이번에 · 메모. 제목은 항목 이름(숙제 종류) · 손 글 차례(lib/item-plan 한 벌)
  const pick = (v) => { if (closed) return; const prev = st; setSt(v); onMarked?.(it.id); start(async () => { const r = await check(it.id, v, v === "weak" ? upto || null : null); if (!fail(r)) setSt(prev); }); };
  const pickUpto = (u) => { setUpto(u); start(async () => { fail(await check(it.id, "weak", u)); }); };
  const pickRest = (w) => { setRestTo(w); start(async () => { fail(await rest(it.id, w)); }); };
  return (
    <div className="hw">
      <div className="hwname"><b>{itemTitle(it)}</b>{sub && <small>{sub}</small>}
        {st && st !== "done" && !closed && (
          <div className="partial">
            {st === "weak" && <div className="wv"><span className="fl" style={{ margin: 0 }}>어디까지</span><div className="seg sm" data-g="upto">{UPTO.map((u) => <button key={u} type="button" aria-pressed={upto === u} onClick={() => pickUpto(u)}>{u}</button>)}</div></div>}
            <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>나머지는</span><div className="seg sm" data-g="rest">{REST.map(([w, name]) => <button key={w} type="button" aria-pressed={restTo === w} onClick={() => pickRest(w)}>{name}</button>)}</div></div>
          </div>
        )}
      </div>
      <div className="chk" aria-label="검사">
        {CHECK.map(([v, g]) => <button key={v} type="button" data-v={CHECK_KEY[v]} aria-pressed={st === v} disabled={closed} onClick={() => pick(v)}>{g}</button>)}
      </div>
    </div>
  );
}
/** 카드 머리의 한 줄 — **깔렸다고만 말하고 0개를 보여 주면 거짓말이다**(대전제-0).
 *  2026-09-11 첫 주 돌려보기: 시험 3주 전에 들어온 아이는 첫 수업부터 교재가 멈춰 있어 0·0 인데
 *  머리는 「검사에서 저절로 배정됨」이라고 했다. 까닭(planBook 의 why)은 이미 sheet_book.waves.why 에 있다 · 그것을 쓴다. */
export function laidText(sheet, laid) {
  if (!laid) return sheet.check.length ? "검사 끝나면 채워집니다" : "깔 교재가 없습니다";
  if (sheet.class.length + sheet.home.length) return "검사에서 저절로 배정됨";
  const 까닭 = [...new Set((sheet.books ?? []).map((x) => x.waves?.why).filter(Boolean))];
  return 까닭.length ? `오늘은 0개 · ${까닭.join(" · ")}` : "오늘은 0개";
}
/** 2 오늘 학습 + 3 오늘 숙제 — 목업 01 의 카드 그대로: 분량 띠(학원·숙제·줄이기) → 교재마다 머리(회독·대단원·상태 세그먼트) + 좌우(폰은 위아래) 학습·숙제(회차·줄·메모) → 교재 없는 줄(손으로 더한 것·나머지) */
function WorkCard({ sheet, books, next, date, minutes, closed, fail, start, heavyPages = 0, scopes = [], no = 2, onPrep, lateNode = null, memoNode = null, folds = {} }) {
  const counts = trimCounts(sheet), heavy = heavyBand(sheet, heavyPages, books);   // 줄이기 숫자 · 📣 많습니다(목업 01)
  const [tuneBook, setTuneBook] = useState(null);   // 📣 띠의 「조절 ↗」 — 02 조절 모달을 그 자리에서
  const [giveSlot, setGiveSlot] = useState(null);
  const [assign, setAssign] = useState(false);   // (어41) 배정한 교재가 없으면 「+ 교재 배정」 → 모달 · 배정하면 오늘 수업 일지에 바로 깔린다(원장님 9/15 「배정이 없으면 … 뭘 설정하라고 하든가」)   // (어13) 숙제 0 이면 「+ 숙제 주기」 → 모달(페이지는 안 늘어난다)
  const nextQuiz = <NextQuiz sheet={sheet} books={books} quizzes={next} scopes={scopes} closed={closed} fail={fail} start={start} />;
  const laid = sheet.books.some((b) => b.laid_at);
  const ordered = bookOrder(books, [...sheet.class, ...sheet.home]);   // (어35) 교재 카드 차례 = 오늘 학습 줄의 차례(sort · 검사 먼저 끝난 교재부터 → 루틴 차례 → 시작한 줄 앞 · 07 과 같은 차례) · 줄 없는 교재는 뒤
  const nOrder = ordered.filter((b) => [...sheet.class, ...sheet.home].some((it) => it.units?.book_id === b.book_id)).length;   // 줄 있는 교재 수 · ▲▼ 는 그 안에서만
  const per = minutes && sheet.class.length ? (minutes / sheet.class.length).toFixed(1) : null;
  const isAuto = (it) => bookLine(it);   // 교재 카드에 서는 줄(루틴이 깐 줄 + 지난 시간에서 넘어온 줄 · lib/day-plan bookLine 한 벌). 손으로 더한 줄·검사 나머지 조각은 단원이 있어도 「그 밖에」
  const unitless = (slot) => sheet[slot].filter((it) => !isAuto(it));
  const offOf = (slot) => (sheet.off ?? []).filter((it) => it.slot === slot && (!isAuto(it) || sheet[slot].some((x) => isAuto(x) && x.unit_id === it.unit_id)));   // 뺀 줄(대전제-19 · 복구) · 루틴 줄은 그 단원이 아직 살아 있을 때만(손으로 건너뛴 것 · (어37)) · 단원째 뺀 것은 줄이기·조절·오늘 단원 몫
  // (어24) 깔린 줄만 보인다 — 「+ 항목」(그 밖에 · 분량 · 줄이기) · 「다음 시간 시험 · 고치기」 · 「🌙 늦게 감」 · 「🗺 메모」는 눌러야 펼친다. 적힌 것이 있으면 펴진 채(shutCards 한 곳)
  const extras = unitless("class").length + unitless("home").length;
  const [more, setMore] = useState(extras > 0);
  const prevExtras = useRef(extras);
  useEffect(() => { if (extras > prevExtras.current) setMore(true); prevExtras.current = extras; }, [extras]);   // 「+ 숙제 주기」로 줄이 생기면 「+ 항목」이 저절로 펴진다(준 것을 바로 본다)
  const [mode, setModeLocal] = useState(sheet.load_mode ?? "all");   // (어49) 줄이기 세그 · 누르면 먼저 바뀐다(속도-5 · 원장님 9/16 「버튼작동이 상당히 느림」)
  useEffect(() => { setModeLocal(sheet.load_mode ?? "all"); }, [sheet.load_mode]);
  const pickMode = (k) => { if (closed) return; const prev = mode; setModeLocal(k); start(async () => { if (!fail(await setMode(sheet.id, k))) setModeLocal(prev); }); };
  const [quizEdit, setQuizEdit] = useState(false);
  const [showLate, setShowLate] = useState(Boolean(folds.late));
  const [showMemo, setShowMemo] = useState(Boolean(folds.memo));
  const quizLine = next.length ? next.map((q) => `${kindOf(q.kind)[1]} · ${scopeText(q)}${q.cut_pct != null ? ` · 통과 ${q.cut_pct}` : ""}`).join(" | ") : "없음";
  return (
    <div className="card" data-card="work">
      <div className="ctitle"><span className="stepno">{no}</span>오늘 학습 · 학원 &nbsp;+&nbsp; <span className="stepno">{no + 1}</span>오늘 숙제 · 집<span className="auto" data-g="laid">{laidText(sheet, laid)}</span></div>
      {heavy && <div className="lf warn" style={{ margin: "0 0 8px" }} data-g="heavy"><span className="ln">📣</span>
        <div><b>{heavy.title}</b><small>{heavy.small}</small>
          {laid && <div className="wv" style={{ margin: "4px 0 0" }}><span className="fl" style={{ margin: 0 }}>줄이기</span><div className="seg sm" data-g="mode">{MODE.map(([k, name]) => <button key={k} type="button" aria-pressed={mode === k} disabled={closed} onClick={() => pickMode(k)}>{name}{counts.all ? ` ${k === "all" ? counts.all : counts.required}` : ""}</button>)}</div></div>}</div>
        {heavy.top && <button type="button" className="btn sm" data-act="heavy-tune" disabled={closed} onClick={() => setTuneBook(books.find((b) => b.book_id === heavy.top.book_id) ?? null)}>조절</button>}</div>}
      {tuneBook && <TuneModal b={tuneBook} sheet={sheet} closed={closed} fail={fail} start={start} onClose={() => setTuneBook(null)} />}
      {giveSlot && <GiveModal sheet={sheet} slot={giveSlot} fail={fail} start={start} onClose={() => setGiveSlot(null)} />}
      {books.length === 0 && <div className="lf" data-g="no-book"><span className="ln">📕</span><div><b>배정한 교재 없음</b></div>{!closed && <button type="button" className="btn sm pri" data-act="assign-book" onClick={() => setAssign(true)}>+ 교재 배정</button>}</div>}
      {assign && <AssignModal studentId={sheet.student_id} date={date} sheetId={sheet.id} onClose={() => setAssign(false)} />}
      {ordered.map((b, i) => <BookBlock key={b.id} b={b} sheet={sheet} date={date} closed={closed} fail={fail} start={start} onPrep={onPrep} pos={i} nOrder={nOrder} />)}
      <div className="lf" style={{ marginTop: 8 }} data-g="quiz-line"><span className="ln">📝</span><div><b>다음 시간 시험</b><small>{quizLine}</small></div><button type="button" className="btn sm gho" data-act="quiz-edit" aria-pressed={quizEdit} onClick={() => setQuizEdit((v) => !v)}>고치기</button></div>
      {quizEdit && nextQuiz}
      <div className="folds wv" style={{ margin: "10px 0 0" }} data-g="folds">
        <button type="button" className="btn sm gho" data-act="fold-more" aria-pressed={more} onClick={() => setMore((v) => !v)}>+ 항목{extras ? ` ${extras}` : ""}</button>
        {lateNode && <button type="button" className="btn sm gho" data-act="fold-late" aria-pressed={showLate} onClick={() => setShowLate((v) => !v)}>🌙 늦게 감{!showLate && folds.lateText && folds.lateText !== "늦게 가는 아이 아님" ? ` · ${folds.lateText}` : ""}</button>}
        {memoNode && <button type="button" className="btn sm gho" data-act="fold-memo" aria-pressed={showMemo} onClick={() => setShowMemo((v) => !v)}>🗺 메모{folds.memoText && folds.memoText !== "메모 없음" ? ` · ${folds.memoText}` : ""}</button>}
        {!closed && sheet.home.length === 0 && <button type="button" className="btn sm" data-act="give" onClick={() => setGiveSlot("home")}>+ 숙제 주기</button>}
      </div>
      {more && <>
      <div className="load">
        <div className="ldn"><span>학원</span><b>{sheet.class.length}</b>{per && <small>한 항목 <b>{per}분</b></small>}</div>
        <div className="ldn"><span>숙제</span><b>{sheet.home.length}</b></div>
        {laid && <div className="ldw"><b>교재 {books.length}권 · 항목 {sheet.class.length + sheet.home.length}개</b></div>}
      </div>
      <div className="two">
        {[["class", "그 밖에 · 학원", "home", "⏭ 숙제로 미루기"], ["home", "그 밖에 · 집", "class", "↩ 학원에서"]].map(([slot, title, other, moveLabel]) => (
          <div className="half" key={slot}>
            <div className="hh">{title}<span className="cnt">{unitless(slot).length}개</span></div>
            {unitless(slot).map((it, i) => <FreeLine key={it.id} it={it} no={i + 1} closed={closed} fail={fail} start={start} moveLabel={moveLabel} other={other} />)}
            {offOf(slot).length > 0 && <div className="lf" data-g="off-lines"><span className="ln">🚫</span><div><b>뺀 줄 {offOf(slot).length}</b><small>{offOf(slot).map(itemTitle).join(" · ")}</small></div>
              {!closed && offOf(slot).map((it) => <button key={it.id} type="button" className="btn sm gho" data-act="item-restore" data-id={it.id} onClick={() => start(async () => { fail(await itemRestore(it.id)); })}>복구</button>)}</div>}
            {!closed && <form className="wv" action={async (f) => { fail(await add(f)); }}><input type="hidden" name="sheetId" value={sheet.id} /><input type="hidden" name="slot" value={slot} /><input type="text" name="text" placeholder="예: 워크북 p.10 1-18" style={{ flex: "1 1 160px", minWidth: 0 }} /><button className="btn sm" type="submit">항목 더하기</button></form>}
          </div>
        ))}
      </div>
      </>}
      {(sheet.next ?? []).length > 0 && <div className="lf" data-g="next-lines"><span className="ln">⏭</span><div><b>다음 시간에 {sheet.next.length}</b><small>{sheet.next.map((it) => [itemTitle(it), it.units?.short].filter(Boolean).join(" · ")).join(" · ")}</small></div>
        {!closed && sheet.next.map((it) => <button key={it.id} type="button" className="btn sm gho" data-act="next-back" data-id={it.id} onClick={() => start(async () => { fail(await dispose(it.id, "class")); })}>되돌리기</button>)}</div>}
      {showLate && lateNode}
      {showMemo && memoNode}
    </div>
  );
}
/** 교재 하나 · 머리(이름 · N회독 · 대단원 · 진행중/숙제 보류/교재 보류) + 학습·숙제 좌우. 줄은 루틴 항목마다 하나, 소단원이 둘이면 이름을 잇는다 */
function BookBlock({ b, sheet, date, closed, fail, start, extra = null, onPrep, pos = 0, nOrder = 0 }) {
  const router = useRouter();
  const [stop, setStopLocal] = useState(stopOn(b, date));
  useEffect(() => { setStopLocal(stopOn(b, date)); }, [b.stop_mode, b.stop_until, b.stop_exam_id, date]);
  const mark = sheet.books.find((x) => x.book_id === b.book_id);
  const [tune, setTune] = useState(false);
  const [prog, setProg] = useState(false);
  const rows = (slot) => sheet[slot].filter((it) => it.units?.book_id === b.book_id && bookLine(it));   // 루틴이 깐 줄 + 지난 시간에서 넘어온 줄(fromLast) · 검사 나머지 조각(carry_of)은 「그 밖에」
  const chapter = rows("class")[0]?.units?.chapter ?? rows("home")[0]?.units?.chapter ?? null;
  const pickStop = (m) => { if (closed) return; const prev = stop; setStopLocal(m); start(async () => { if (!fail(await setStop(sheet.id, b.id, m))) setStopLocal(prev); }); };   // (어49) 누르면 먼저 바뀐다 · 실패면 되돌린다(원장님 9/16 「교재 진행중/ 숙제보류/ 교재보류도 버튼작동이 상당히 느림」)
  return (
    <div className={"bk" + (stop === "book_off" ? " stopped" : "")} data-book={b.book_id} data-area={b.books?.area ?? ""}>
      <div className="bkh">
        <b>{b.books.name}</b>
        <span className="tag type">{b.round}회독</span>
        {chapter && <span className="tag">{chapter}</span>}
        <span className="spacer" />
        <div className="seg sm stopseg" data-g="stop">{STOP.map(([k, name]) => <button key={k} type="button" aria-pressed={stop === k} disabled={closed} onClick={() => pickStop(k)}>{name}</button>)}</div>
        <button type="button" className="btn sm" data-act="tune" disabled={closed || !mark?.laid_at || stop === "book_off"} onClick={() => setTune(true)}>조절</button>
        <button type="button" className="btn sm" data-act="progress" onClick={() => setProg(true)}>진도 체크</button>
        {!closed && pos < nOrder && <span className="wv" data-g="book-order" style={{ margin: 0, gap: 2 }}>{/* (어35) 교재 차례 ▲▼ · 선생님이 고친다(원장님 9/15 「배정 선생님이 고칠 수 있음」) · 줄 있는 교재끼리만 · 시작한 줄은 그대로 앞 */}
          <button type="button" className="btn sm gho" data-act="book-up" aria-label="앞으로" disabled={pos === 0} onClick={() => start(async () => { fail(await bookMove(sheet.id, b.book_id, "up")); })}>▲</button>
          <button type="button" className="btn sm gho" data-act="book-down" aria-label="뒤로" disabled={pos >= nOrder - 1} onClick={() => start(async () => { fail(await bookMove(sheet.id, b.book_id, "down")); })}>▼</button></span>}
      </div>
      {tune && <TuneModal b={b} sheet={sheet} closed={closed} fail={fail} start={start} onClose={() => setTune(false)} />}
      {prog && <ProgressModal b={b} api={progApi(sheet)} closed={closed} fail={fail} start={start} onClose={() => { setProg(false); router.refresh(); }} />}
      {stop === "book_off" ? <div className="stopnote big"><b>교재 보류</b>{b.stop_until ? ` · ${b.stop_until} 에 저절로 풀립니다` : ""}{" "}<button type="button" className="btn sm pconly" data-act="to-prep" onClick={() => onPrep?.()}>📄 내신 자료</button></div>
      : !mark?.laid_at ? <div className="stopnote">검사 끝나면 채워집니다</div>
      : mark.waves?.why ? <div className="stopnote"><b>{mark.waves.why}</b>{!closed && mark.waves.why === "안 한 소단원이 없다" && <button type="button" className="btn sm pri" data-act="next-round" style={{ marginLeft: 8 }} onClick={() => start(async () => { fail(await bookNextRound(sheet.id, b.id, b.book_id)); })}>다음 회독 시작</button>}</div>
      : <div className="two">
          <Half slot="class" title="오늘 학습 · 학원" b={b} sheet={sheet} mark={mark} rows={rows("class")} closed={closed} fail={fail} start={start} />
          {stop === "hw_off" ? <div className="half muted"><div className="hh">오늘 숙제 · 집<span className="cnt">숙제 보류</span></div><div className="stopnote"><b>숙제 없음</b> · 수업에서만 씁니다</div></div>
          : <Half slot="home" title="오늘 숙제 · 집" b={b} sheet={sheet} mark={mark} rows={rows("home")} closed={closed} fail={fail} start={start} />}
        </div>}
      {extra}{/* 📝 다음 시간 시험 · **어느 유형에서도 보인다 · 한 번만**((어12) 2026-09-14 캡처에서 교재 보류이면 둘이 서던 것을 잡음 · 아래 「stop !== running && extra」 가 한 번 더 그리고 있었다). 2026-09-11 첫 주 돌려보기에서 잡힘: 교재가 멈추거나
                   할 것이 없으면 이 카드가 통째로 사라져, 정작 시험이 제일 중요한 내신 기간에 시험을 낼 자리가 없었다 */}
    </div>
  );
}
/** 손으로 더한 줄 하나(그 밖에 · 나머지 조각) · ✎ 글 고치기 · 미루기 · ✕ 빼기(대전제-19 · 원장님 2026-09-15 「모든 항목을 추가/수정/삭제가 가능한게 기본」) */
function FreeLine({ it, no, closed, fail, start, moveLabel, other }) {
  const [edit, setEdit] = useState(false); const box = useRef(null);
  useEffect(() => { if (edit) box.current?.focus(); }, [edit]);   // 폰-2: autoFocus 는 안 건다 · ✎ 를 누른 뒤에만 칸으로(사람이 시킨 것)
  const name = itemTitle(it), sub = [itemSub(it), fromLast(it) ? lastFrom(it) : it.carry_of ? "지난 숙제의 나머지" : null].filter(Boolean).join(" · ");
  const save = (v) => { const t = String(v ?? "").trim(); setEdit(false); if (!t || t === name) return; start(async () => { fail(await itemText(it.id, t)); }); };
  return <div className="li" data-g="free-line"><span className="n">{no}</span>
    {edit ? <input ref={box} type="text" defaultValue={it.range_note ?? name} aria-label="줄 고치기" onBlur={(e) => save(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(e.currentTarget.value); } if (e.key === "Escape") setEdit(false); }} style={{ flex: "1 1 120px", minWidth: 0 }} />
      : <div><b>{name}</b>{sub && <small>{sub}</small>}</div>}
    {!closed && !edit && <><button type="button" className="btn sm gho" data-act="item-edit" aria-label="고치기" onClick={() => setEdit(true)}>✎</button>
      <button type="button" className="btn sm" data-act="item-move" onClick={() => start(async () => { fail(await move(it.id, other)); })}>{moveLabel}</button>
      {other === "home" && <button type="button" className="btn sm gho" data-act="item-next" onClick={() => start(async () => { fail(await dispose(it.id, "next")); })}>다음 시간으로</button>}
      <button type="button" className="btn sm gho" data-act="item-del" aria-label="빼기" onClick={() => start(async () => { fail(await itemRemove(it.id)); })}>✕</button></>}
  </div>;
}
function Half({ slot, title, b, sheet, mark, rows, closed, fail, start, extra = null }) {
  const nUnits = new Set(rows.map((it) => it.unit_id ?? null)).size;   // (어32) 단원 먼저 · 그 단원의 활동을 루틴 차례로 · 쪽·문항은 단원마다(원장님 9/15 「단원을 먼저 제시하고 그에 대한 활동을 순서대로」 · 「페이지 번호는 … 저 두개 각각에 대한건지」) · 교재 카드 안이라 교재 이름은 뺀다
  const cur = new Set(rows.map((it) => it.unit_id));
  const opts = mark.waves?.[slot] ?? [];
  const same = (o) => o.units.length === cur.size && o.units.every((u) => cur.has(u.unit_id));
  const [wave, setWave] = useState(null);   // (어49) 오늘 단원 세그 · 누르면 먼저 눌린다(속도-5 · 원장님 9/16 「버튼작동이 상당히 느림」)
  useEffect(() => { setWave(null); }, [rows.length]);
  const pickUnits = (o) => { if (closed) return; const prev = wave; setWave(o.key); start(async () => { if (!fail(await pickWave(sheet.id, b.book_id, slot, o.units.map((u) => u.unit_id)))) setWave(prev); }); };
  const memoText = slot === "class" ? mark.class_memo : mark.home_memo;
  return (
    <div className="half">
      <div className="hh">{title}<span className="cnt">{rows.length}개</span></div>
      {opts.length > 0 && <div className="wv"><span className="fl" style={{ margin: 0 }}>오늘 단원</span>
        <div className="seg sm" data-g={`wave-${slot}`}>{opts.map((o) => <button key={o.key} type="button" aria-pressed={wave ? wave === o.key : same(o)} disabled={closed} onClick={() => pickUnits(o)}>{waveLabel(o)}</button>)}</div></div>}
      <ItemTree rows={rows} book={false} bySort fold={false} dense unitHead={(g) => <>{/* (어42) 나무 한 벌 · (어47) 단원 머리는 안 접힌다(div) · 손은 아이콘(원장님 9/16 「건너뛰기(엑스) 다음시간으로(화살표) 숙제로(집) 이거를 아이콘화해버려」) · 이름은 aria-label(명사 하나) */}
            {!closed && slot === "class" && g.rows.length > 0 && <span className="wv acts" data-g="unit-acts"><button type="button" className="btn sm gho icb" data-act="unit-skip" aria-label="건너뛰기" onClick={() => start(async () => { fail(nUnits > 1 && g.id ? await pickWave(sheet.id, b.book_id, slot, [...cur].filter((u) => u !== g.id)) : await disposeAll(g.rows.map((r) => r.id), "skip")); })}>✕</button><button type="button" className="btn sm gho icb" data-act="unit-next" aria-label="다음 시간" onClick={() => start(async () => { fail(await disposeAll(g.rows.map((r) => r.id), "next")); })}>→</button><button type="button" className="btn sm gho icb" data-act="unit-home" aria-label="숙제" onClick={() => start(async () => { fail(await disposeAll(g.rows.map((r) => r.id), "home")); })}>🏠</button></span>}
            {!closed && slot !== "class" && nUnits > 1 && g.id && <button type="button" className="btn sm gho icb" data-act="item-del" aria-label="오늘은 뺌" onClick={() => start(async () => { fail(await pickWave(sheet.id, b.book_id, slot, [...cur].filter((u) => u !== g.id))); })}>✕</button>}
          </>}
        row={(it, i) => { const note = it.range_note && it.range_note !== itemTitle(it) ? `이번에 ${it.range_note}` : null; return <div className="li" key={it.id} data-id={it.id}><span className="n">{i + 1}</span><div><b>{itemTitle(it)}</b>{it.gate_prev && <span className="tag" data-g="gate" style={{ marginLeft: 4 }}>🔒</span>}{it.started_at && <TimerTag it={it} />}{(note || it.carry_of) && <small>{[note, fromLast(it) ? lastFrom(it) : it.carry_of ? "지난 숙제의 나머지" : null].filter(Boolean).join(" · ")}</small>}</div>
            {!closed && slot === "class" && <span className="wv acts" data-g="line-acts"><button type="button" className="btn sm gho icb" data-act="line-skip" aria-label="건너뛰기" onClick={() => start(async () => { fail(await dispose(it.id, "skip")); })}>✕</button><button type="button" className="btn sm gho icb" data-act="line-next" aria-label="다음 시간" onClick={() => start(async () => { fail(await dispose(it.id, "next")); })}>→</button><button type="button" className="btn sm gho icb" data-act="line-home" aria-label="숙제" onClick={() => start(async () => { fail(await dispose(it.id, "home")); })}>🏠</button></span>}
            {!closed && slot === "home" && <button type="button" className="btn sm gho icb" data-act="line-class" aria-label="학습" style={{ flex: "0 0 auto" }} onClick={() => start(async () => { fail(await dispose(it.id, "class")); })}>🏫</button>}</div>; }} />
      <form className="memoline" action={async (f) => { fail(await saveMemo(f)); }}>
        <span className="mi">✎</span><input type="hidden" name="sheetId" value={sheet.id} /><input type="hidden" name="bookId" value={b.book_id} /><input type="hidden" name="slot" value={slot} />
        <input type="text" name="text" defaultValue={memoText ?? ""} placeholder={slot === "class" ? "학습 메모" : "숙제 메모"} disabled={closed} onBlur={(e) => { if ((e.target.value ?? "") !== (memoText ?? "")) e.target.form.requestSubmit(); }} />
      </form>
      {extra}
    </div>
  );
}
/** (어35) 학습 줄의 타이머 꼬리표 · 끝났으면 「⏱ N분」 · 하는 중이면 붙은 뒤에 「▶ m:ss」(처음 그릴 땐 「▶ 하는 중」 · 서버·브라우저 첫 글이 같아야 hydration 이 안 어긋난다) · 글은 07 과 같은 timerText 한 벌 */
function TimerTag({ it }) {
  const [now, setNow] = useState(null); useEffect(() => { setNow(Date.now()); }, []);
  const over = Boolean(it.ended_at || it.said_done_at);
  return <span className={"tag" + (over ? " on" : " act")} data-g="timer" style={{ marginLeft: 4 }}>{over ? timerText(it) : now ? timerText(it, now) : "▶ 하는 중"}</span>;
}
const lastFrom = (it) => { const d = String(it?.carry?.day_sheet?.date ?? ""); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))} 에서 넘어옴` : "지난 시간에서 넘어옴"; };   // (어37) 넘어온 줄의 꼬리
const kindOf = (k) => KIND.find(([x]) => x === k) ?? ["", k, "?"];
const numOr = (v) => (v === null || v === undefined ? "" : String(v));
/** 🔤 시험 · 숙제 검사 카드 안 **맨 끝**(무조건 · (어12)). 지난 시간에 낸 범위 그대로. 틀린 개수(·전체)만 적으면 맞은 개수·%·통과는 세어 나온다(SQL). 미통과면 재시험 줄 + 하원 지연 사유가 저절로 */
function QuizPart({ sheet, quizzes, closed, fail, start }) {
  const failed = quizzes.filter((q) => q.passed === false && !q.retry_of);
  const retryOf = (q) => quizzes.find((r) => r.retry_of === q.id);
  const taken = quizzes.filter((q) => q.passed !== null && q.passed !== undefined && !q.retry_of);
  const save = (q, form) => start(async () => { fail(await quizTake(sheet.id, q.id, form.wrong.value, form.total.value)); });
  const [skips, setSkips] = useState({});   // (어49) 재시험 건너뜀 · 누르면 먼저 눌린다
  const pickSkip = (q, r) => { const now = skips[q.id] ?? r?.state === "skipped"; setSkips((o) => ({ ...o, [q.id]: !now })); start(async () => { if (!fail(await quizSkip(sheet.id, q.id, !now))) setSkips((o) => ({ ...o, [q.id]: now })); }); };
  return (
    <div className="part" data-card="quiz">
      <div className="hh">🔤 시험<span className="cnt">{quizzes.length}</span></div>
      {quizzes.map((q) => { const [, kname, icon] = kindOf(q.kind); const res = q.passed === true ? "ok" : q.passed === false ? "warn" : ""; return (
        <form key={q.id} className={"lf" + (res ? " " + res : "")} style={{ marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); save(q, e.currentTarget); }}>
          <span className="ln">{icon}</span>
          <div><b>{q.retry_of ? "재시험 · " : ""}{kname} · {scopeText(q)}</b>
            <small>{q.quiz_style?.round && <span className="tag type">{q.quiz_style.round}회독</span>} {q.quiz_style?.text ?? ""}{q.harder ? " · 더 어렵게" : ""} · 통과 {q.cut_pct}%{q.state === "skipped" ? " · 오늘 건너뜀" : ""}</small></div>
          <span className="qlab">틀린 개수</span><input className="scr" name="wrong" type="text" inputMode="numeric" defaultValue={numOr(q.wrong)} placeholder="" disabled={closed || q.state === "skipped"} onBlur={(e) => { if (e.target.value !== numOr(q.wrong)) e.target.form.requestSubmit(); }} />
          <span className="qlab">전체</span><input className="scr" name="total" type="text" inputMode="numeric" defaultValue={numOr(q.total)} placeholder="" disabled={closed || q.state === "skipped"} onBlur={(e) => { if (e.target.value !== numOr(q.total)) e.target.form.requestSubmit(); }} />
          <span className="lm" style={q.passed === true ? { color: "var(--ok)" } : q.passed === false ? { color: "var(--miss)" } : undefined}>{q.passed === null || q.passed === undefined ? "아직 안 적음" : `${q.total - q.wrong}/${q.total} · ${q.pct}% · ${q.passed ? "통과" : "못 넘음"}`}</span>
        </form>); })}
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
        {failed.length ? <span className="pill warn">⚠️ 미통과 {failed.length}</span> : taken.length ? <span className="pill ok">✅ 통과 · 재시험 없음</span> : null}
        {failed.map((q) => { const r = retryOf(q); return (<span key={q.id} className="wv" style={{ margin: 0 }}>
          <button type="button" className="btn sm" disabled={closed || Boolean(r)} onClick={() => start(async () => { fail(await quizRetest(sheet.id, q.id)); })}>{r ? "📄 재시험 대상 ✓" : "📄 재시험지 만들기"}</button>
          <button type="button" className="btn sm" aria-pressed={skips[q.id] ?? r?.state === "skipped"} disabled={closed || !r} onClick={() => pickSkip(q, r)}>⏭ 오늘은 재시험 건너뜀</button>
        </span>); })}
        <span className="spacer" />
      </div>
    </div>
  );
}
/** 🃏 클래스카드 플래너(목업 01 · (뎌-4)) — **확장이 받아 적은 것을 그대로 보인다.**
 *  확정-⑱ 목표·실제는 확장이 보낸 값이고 **앱이 다시 셈하지 않는다** · 미달이어도 **앱이 안 넘긴다**(원장님이 「⏭」를 누르신다).
 *  확정-⑩ 3초훈련은 짐에서 이미 버려져 여기 안 온다. 판단(줄 글·모드 줄·못 넘긴 것)은 lib/cc-plan.js 한 벌 */
function CcPart({ rows = [], closed, fail, start }) {   // 확장이 아직 안 보냈으면 숙제 검사 카드가 안 부른다(빈 칸을 먹지 않는다)
  const got = rows.reduce((t, r) => (r.fetched_at > t ? r.fetched_at : t), "");
  const [ccSkips, setCcSkips] = useState({});   // (어49) 넘기기 · 누르면 먼저 눌린다
  const pickCcSkip = (r, now) => { setCcSkips((o) => ({ ...o, [r.id]: !now })); start(async () => { if (!fail(await ccSkipAct(r.id, !now))) setCcSkips((o) => ({ ...o, [r.id]: now })); }); };
  return (
    <div className="part" data-card="cc">
      <div className="hh">🃏 클래스카드{got && <span className="cnt" data-g="cc-got">{seoulTime(got)} 받음</span>}</div>
      {rows.map((r) => { const p = plannerLine(r), skipped = ccSkips[r.id] ?? Boolean(r.skipped_at), out = shortText(p.lines); return (
        <div key={r.id} data-g="cc-set" data-id={r.id} data-skipped={skipped ? "1" : "0"}>
          <div className="hw">
            <div className="hwname"><b>{r.set_name}</b>
              <div className="tags">
                <span className={"tag" + (r.complete === true ? " on" : "")}>{r.complete === true ? "완료" : r.complete === false ? "아직" : "모름"}</span>
                {r.set_type && SET_TYPE[r.set_type] && <span className="tag type">{SET_TYPE[r.set_type]} 세트</span>}
                {Number(r.cards) > 0 && <span className="tag">{Number(r.cards).toLocaleString("ko-KR")}장</span>}
                {p.lines.length > 0 && <span className="tag">필수 모드 {p.lines.length}개</span>}
              </div></div>
          </div>
          {p.lines.length > 0 && <div className="ccg" data-g="cc-modes">
            {p.lines.map((l) => <div key={l.key} className={"ccm" + (l.ok === false && !skipped ? " bad" : "")} data-g="cc-mode" data-mode={l.key}>
              <span>{l.name}</span><b>{l.actualText}</b>{l.goalText && <i className={l.ok === true ? "ok" : l.ok === false ? "no" : ""}>{l.goalText}</i>}</div>)}
          </div>}
          <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
            {p.short.length > 0 && <button type="button" className="btn sm" data-act="cc-skip" aria-pressed={skipped} disabled={closed}
              onClick={() => pickCcSkip(r, skipped)}>{skipped ? "⏭ 넘긴 것 되돌리기" : "⏭ 목표 미달 넘기기"}</button>}
            {out && <span className={"pill" + (skipped ? "" : p.short.length ? " warn" : " ok")} data-g="cc-out">{skipped ? "넘겼습니다. 오늘은 안 셉니다" : out}</span>}
          </div>
        </div>); })}
    </div>
  );
}
/** 📝 다음 시간 시험 — 숙제와 같이 나간다. 범위는 교재(오늘 학습 소단원)거나 직접 · 전체 개수를 적어야 리포트에 나간다(원장님 9/2) · 방식·통과선은 학생×교재×회독 한 곳(style_for) */
function NextQuiz({ sheet, books, quizzes, scopes = [], closed, fail, start }) {
  const [styleQ, setStyleQ] = useState(null);   // 방식 고치기 모달(5단계-③)
  const unitOf = (bookId) => sheet.class.find((it) => it.units?.book_id === bookId)?.unit_id ?? sheet.home.find((it) => it.units?.book_id === bookId)?.unit_id ?? null;
  const patch = (q, p) => start(async () => { fail(await quizSet(sheet.id, q.id, p)); });
  return (
    <div data-card="next-quiz">
      <div className="ctitle" style={{ marginTop: 12, fontSize: "var(--fs-3)" }}><span className="cemo">📝</span>다음 시간 시험</div>
      {quizzes.map((q) => { const [, kname, icon] = kindOf(q.kind); return (
        <div key={q.id}>
          <div className="lf" style={{ marginTop: 4 }}><span className="ln">{icon}</span>
            <div><b>{kname}</b><small>{scopeText(q)}</small></div>
            <div className="seg sm" data-g="source">{SOURCE.map(([k, name]) => <button key={k} type="button" aria-pressed={q.source === k} disabled={closed || (k === "prep" && !scopes.length) || (k === "book" && !q.book_id)} onClick={() => k !== q.source && (k === "prep" ? patch(q, { scopeId: scopes[0].id }) : patch(q, { source: k, freeNote: q.free_note ?? "" }))}>{name}</button>)}</div>
            {q.source === "prep" && scopes.length > 0 && <select data-g="scope" value={q.scope_id ?? ""} aria-label="내신 범위" style={{ width: "auto", maxWidth: 260 }} disabled={closed} onChange={(e) => patch(q, { scopeId: e.target.value })}>{scopes.map((sc) => <option key={sc.id} value={sc.id}>{sc.text}</option>)}</select>}
            <span className="qlab">전체 개수</span><input className="scr" name="total" type="text" inputMode="numeric" defaultValue={numOr(q.total)} placeholder="" disabled={closed} onBlur={(e) => { if (e.target.value !== numOr(q.total)) patch(q, { total: e.target.value }); }} />
            <span className="qlab">통과선</span><input className="scr" name="cut_pct" type="text" inputMode="numeric" defaultValue={numOr(q.cut_pct)} style={{ maxWidth: 52 }} disabled={closed} onBlur={(e) => { if (e.target.value !== numOr(q.cut_pct)) patch(q, { cutPct: e.target.value }); }} /><b className="qof">%</b></div>
          {q.source === "manual" && <div className="lf" style={{ marginTop: 4 }}><span className="ln">✎</span><input type="text" defaultValue={q.free_note ?? ""} placeholder="예: 2409 학평 22-24번" disabled={closed} style={{ flex: 1, minWidth: 0 }} onBlur={(e) => { if (e.target.value !== (q.free_note ?? "")) patch(q, { freeNote: e.target.value }); }} /></div>}
          {q.total == null && <div className="lf warn" style={{ marginTop: 4 }}><span className="ln">!</span><div><b>전체 개수가 없어 리포트에 안 나갑니다</b></div></div>}
          <div className="lf" style={{ marginTop: 4, background: "var(--sunk)" }}><span className="ln">⚙️</span><div><b>{q.quiz_style?.round ?? 1}회독 · {q.quiz_style?.student_id ? <span className="tag act" data-g="style-mine">이 아이만</span> : q.quiz_style?.book_id ? "교재 기본값" : "학원 기본값"}</b><small data-g="style-text">{q.quiz_style?.text ?? "방식 줄 없음"}{q.quiz_style?.units_per ? ` · ${q.quiz_style.units_per}단원씩` : ""}</small></div>{!closed && <button type="button" className="btn sm" data-act="style-open" onClick={() => setStyleQ(q)}>방식 고치기</button>}</div>
        </div>); })}
      {!closed && <form className="wv" style={{ marginTop: 8 }} action={async (f) => { fail(await quizAdd(f)); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <select name="kind" style={{ width: "auto" }} aria-label="시험 유형">{KIND.map(([k, name]) => <option key={k} value={k}>{name}</option>)}</select>
        <select name="bookId" style={{ width: "auto" }} aria-label="범위 교재" onChange={(e) => { const f = e.target.form; f.unitId.value = unitOf(e.target.value) ?? ""; f.round.value = books.find((b) => b.book_id === e.target.value)?.round ?? 1; }}>
          {books.map((b) => <option key={b.id} value={b.book_id}>{b.books.name}</option>)}<option value="">직접 적기</option></select>
        <input type="hidden" name="unitId" defaultValue={books[0] ? unitOf(books[0].book_id) ?? "" : ""} /><input type="hidden" name="round" defaultValue={books[0]?.round ?? 1} />
        <input type="text" name="freeNote" placeholder="범위" style={{ flex: "1 1 120px", minWidth: 0 }} />
        <button className="btn sm" type="submit">+ 시험 더하기</button>
      </form>}
      {styleQ && <StyleModal q={styleQ} sheet={sheet} fail={fail} start={start} onClose={() => setStyleQ(null)} />}
    </div>
  );
}
/** 방식 고치기(5단계-③ · 목업 01 「이 아이만 다르게도 됩니다 · 방식 고치기」) · 학생 × 교재 × 회독 × 유형 한 줄: 단어는 네 비율(합 100) · 첫글자 힌트 · 몇 단원씩, 문장은 방식(구두·받아쓰기·녹음) · 통과선. 저장하면 아직 안 본 같은 짝의 시험이 따라온다 */
function StyleModal({ q, sheet, fail, start, onClose }) {
  const [failM, errNode] = useModalErr();   // (어49) 모달 안 손의 실패는 모달 안에 선다 · 덮개 뒤 판에 뜨면 「단추가 안 먹힌다」로 보인다(원장님 9/16)
  const st = q.quiz_style ?? {}, [f, setF] = useState({ mc_meaning: st.mc_meaning ?? 0, sa_meaning: st.sa_meaning ?? 0, mc_word: st.mc_word ?? 0, sa_word: st.sa_word ?? 0, first_hint: Boolean(st.first_hint), units_per: st.units_per ?? "", s_way: st.s_way ?? "dictation", cut_pct: st.cut_pct ?? q.cut_pct ?? 90 });
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const sum = Number(f.mc_meaning || 0) + Number(f.sa_meaning || 0) + Number(f.mc_word || 0) + Number(f.sa_word || 0);
  const N = ({ k, label }) => <label className="wv" style={{ gap: 4, margin: 0 }}><span className="fl" style={{ margin: 0, width: "auto" }}>{label}</span><input className="scr" name={k} type="text" inputMode="numeric" value={f[k]} onChange={(e) => set(k, e.target.value)} style={{ maxWidth: 56 }} /></label>;
  return <div className="mdlov" role="dialog" aria-modal="true" aria-label="방식 고치기" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="mdl" style={{ width: "min(520px,100%)" }} data-g="style-modal">
    <div className="mdlh"><b>방식 고치기 · 이 아이만</b><span className="pill">{q.books?.name ?? "교재 없음"} · {st.round ?? 1}회독 · {KIND.find(([k]) => k === q.kind)?.[1] ?? q.kind}</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
    <div className="mdlb">{errNode}
      {q.kind === "word" ? <>
        <div className="wv" style={{ gap: 10 }}><N k="mc_meaning" label="객관식 뜻 %" /><N k="sa_meaning" label="주관식 뜻 %" /><N k="mc_word" label="객관식 영어 %" /><N k="sa_word" label="주관식 영어 %" /><span className={"pill" + (sum === 100 ? " ok" : " warn")} data-g="style-sum">합 {sum}</span></div>
        <div className="wv" style={{ gap: 10, marginTop: 6 }}><label className="wv" style={{ gap: 4, margin: 0 }}><input type="checkbox" name="first_hint" checked={f.first_hint} onChange={(e) => set("first_hint", e.target.checked)} /> 첫글자 힌트</label><N k="units_per" label="몇 단원씩(비면 안 씀)" /></div>
      </> : <div className="seg sm" data-g="s-way">{S_WAY.map(([k, name]) => <button key={k} type="button" aria-pressed={f.s_way === k} onClick={() => set("s_way", k)}>{name}</button>)}</div>}
      <div className="wv" style={{ gap: 10, marginTop: 6 }}><N k="cut_pct" label="통과선 %" /></div>
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}><span className="spacer" />
        <button type="button" className="btn sm pri" data-act="style-save" disabled={q.kind === "word" && sum !== 100} onClick={() => start(async () => { if (failM(await quizStyle(sheet.id, q.id, { ...f, first_hint: f.first_hint ? "on" : "" }))) onClose(); })}>저장</button></div>
    </div></div></div>;
}

/** (어48) 출결 곁의 도착·하원(원장님 2026-09-16 「학생들이 어플에서 하원처리를 안했을 경우를 대비해서 출석체크 근처에 하원도 넣고 출석, 지각, 하원은 시간이 기록되게해 1차적으로 학생어플에서 눌렀으면 그걸 기준으로 삼고, 내가 다시 눌렀으면 내가 누른걸로 정정 그리고 시간 정정가능하게」).
 *  아이 앱이 찍은 시각이 1차 · 출결을 눌러도 안 덮는다 · 「하원」과 ✎ 는 원장님이 찍고 고친다(등원 표 걸음 2·4 한 곳 · lib/arrival.js staffStamp). 누르면 먼저 바뀐다(속도-5) */
function AttTimes({ student, date, closed, fail, start }) {
  const [t, setT] = useState(() => arrivalTimes(student.arrival ?? []));
  useEffect(() => { setT(arrivalTimes(student.arrival ?? [])); }, [student.arrival]);
  const [edit, setEdit] = useState(false);
  const [which, setWhich] = useState("out");
  const [val, setVal] = useState("");
  const nowHHMM = () => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/^24/, "00");
  const put = (step, hhmm) => { const prev = t, key = step === 4 ? "out" : "in";
    setT({ ...t, [key]: { at: hhmm ?? nowHHMM(), by: "staff", name: STAMP_NAME.staff } }); setEdit(false);
    start(async () => { const r = await stampAt(student.id, date, step, hhmm); if (!fail(r)) { setT(prev); return; } setT((o) => ({ ...o, [key]: { at: r.at, by: "staff", name: STAMP_NAME.staff } })); }); };
  return (
    <span className="wv" data-g="att-times" style={{ margin: 0, gap: 4 }}>
      {t.in && <span className="pill" data-g="arr-in" data-by={t.in.by}>도착 {t.in.at} · {t.in.name}</span>}
      {t.out ? <span className="pill" data-g="arr-out" data-by={t.out.by}>하원 {t.out.at} · {t.out.name}</span>
        : !closed && <button type="button" className="btn sm" data-act="leave-now" onClick={() => put(4, null)}>하원</button>}
      {!closed && (t.in || t.out) && <button type="button" className="btn sm gho icb" data-act="time-edit" aria-label="시각" aria-pressed={edit} onClick={() => { setEdit(!edit); setWhich(t.out ? "out" : "in"); setVal((t.out ?? t.in)?.at ?? ""); }}>✎</button>}
      {edit && !closed && <>
        <span className="seg sm" data-g="time-which">{[["in", "도착"], ["out", "하원"]].map(([k, name]) => <button key={k} type="button" aria-pressed={which === k} onClick={() => { setWhich(k); setVal((k === "out" ? t.out : t.in)?.at ?? ""); }}>{name}</button>)}</span>
        <input type="text" value={val} onChange={(e) => setVal(e.target.value)} placeholder="예: 21:05" inputMode="numeric" aria-label="시각" style={{ maxWidth: 88 }} />
        <button type="button" className="btn sm pri" data-act="time-save" disabled={!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)} onClick={() => put(which === "out" ? 4 : 2, val)}>저장</button>
      </>}
    </span>
  );
}
/** 3b 하원 지연(목업 01) · 사유 한 줄이 원본(확정-㊿) · 예상 귀가 = 약속 · 📨 지금 보내기(큐 + 보냄 때) · 실제 하원은 등원 걸음 4 와 같은 줄(0083 · 차이는 세어 나온다) · 반복(3주 안 3번)면 앱이 먼저 「숙제량을 볼까요」(확정-⑭) · 경고 3회째면 처분 셋(확정-㊼) */
function LateCard({ sheet, warn, stay, books, studentId, date, classEnd = "", shut = null, closed, fail, start }) {
  const [off, setOff] = useState(Boolean(shut?.shut));
  const ask = warn && (warn.due || warn.today_disposal);
  const rows = stayRows(sheet.stay ?? []), sc = stayCounts(rows), usual = usualText(classEnd);   // 3b 「남」 줄(0141 · 5단계-②) · 「평소 21:40」
  const [stayText, setStayText] = useState("");
  const l = sheet.late;
  const [until, setUntil] = useState(l?.until_at ? String(l.until_at).slice(0, 5) : "");
  const [reason, setReason] = useState(l?.reason ?? "");   // 사유 한 줄이 원본(확정-㊿) — 칩은 조각을 넣고 뺀다
  useEffect(() => { setReason(l?.reason ?? ""); }, [l?.reason]);   // 처분·재시험이 사유를 적으면(SQL) 화면이 따라온다
  const chips = reasonChips({ checks: sheet.check, warn, reason });
  const [left, setLeft] = useState(stay?.left_at ? hhmm(stay.left_at) : "");
  const [tuneBook, setTuneBook] = useState(null);   // 반복 띠의 「조절 ↗」 · 02 조절 모달을 그 자리에서
  const [disp, setDisp] = useState(warn?.today_disposal ?? null);   // (어49) 처분 세그 · 누르면 먼저 눌린다
  useEffect(() => { setDisp(warn?.today_disposal ?? null); }, [warn?.today_disposal]);
  const pickDisp = (k) => { if (closed) return; const prev = disp; setDisp(k); start(async () => { if (!fail(await reflectAs(sheet.id, k))) setDisp(prev); }); };
  const band = repeatBand(stay);
  const laid = (b) => Boolean(sheet.books.find((x) => x.book_id === b.book_id)?.laid_at);
  const leftLine = leftText(l, stay?.left_at);
  return (
    <div className="card" data-card="late" data-folded={off ? "1" : "0"}>
      <div className="ctitle"><span className="cemo">🌙</span>하원 지연{l?.until_at && <span className="auto">예상 귀가 {String(l.until_at).slice(0, 5)}{usual ? ` · ${usual}` : ""}</span>}<Shut on={off} set={setOff} text={shut?.text} /></div>
      <div data-g="stay" style={{ marginTop: 8 }}>
        {rows.map((r) => <div key={r.id} className="dayrow" data-g="stay-row" data-state={r.state}><span className="tag on">남</span>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}><b style={{ textDecoration: r.state === "done" ? "line-through" : "none" }}>{r.text}</b><small>{[r.sub, r.from].filter(Boolean).join(" · ")}{r.state === "done" ? " · 다 함" : r.state === "missing" ? " · ⏭ 다음 숙제로 넘김" : ""}</small></div>
          {r.state === "open" && <button type="button" className="btn sm" data-act="stay-done" disabled={closed} onClick={() => start(async () => { fail(await stayDoneAct(r.id)); })}>다 함</button>}
          {r.state === "open" && !closed && <button type="button" className="btn sm gho" data-act="item-del" aria-label="빼기" onClick={() => start(async () => { fail(await itemRemove(r.id)); })}>✕</button>}</div>)}
        {!closed && <div className="wv" style={{ marginTop: 4 }} data-g="stay-add"><input type="text" value={stayText} onChange={(e) => setStayText(e.target.value)} placeholder="예: 워크북 복습" aria-label="남아서 할 항목" style={{ flex: "1 1 200px" }} />
          <button type="button" className="btn sm" data-act="stay-add" disabled={!stayText.trim()} onClick={() => start(async () => { const f = new FormData(); f.set("sheetId", sheet.id); f.set("slot", "stay"); f.set("text", stayText); if (fail(await add(f))) setStayText(""); })}>항목 더하기</button>
          {sc.open > 0 && <button type="button" className="btn sm" data-act="stay-carry" onClick={() => start(async () => { fail(await stayCarryAct(sheet.id)); })}>⏭ 다음 숙제로</button>}
          {sc.open > 0 && <button type="button" className="btn sm pri" data-act="stay-all-done" onClick={() => start(async () => { fail(await stayAllDoneAct(sheet.id)); })}>모두 다 함</button>}</div>}
        <p className="note" style={{ margin: "4px 0 0" }} data-g="stay-note">{rows.length ? `남 ${sc.total} · 다 함 ${sc.done} · 넘김 ${sc.missing}` : "남을 것 없음"}{!l?.until_at && usual ? ` · ${usual}` : ""}</p>
      </div>
      {band && <div className="lf warn" style={{ margin: "8px 0 0" }} data-g="repeat"><span className="ln">🌙</span>
        <div><b>{band.title}</b><small>{band.days}</small></div>
        {books.filter(laid).map((b) => <button key={b.book_id} type="button" className="btn sm" data-act="repeat-tune" disabled={closed} onClick={() => setTuneBook(b)}>{b.books.name} 조절</button>)}
        {!books.some(laid) && <span className="lm">검사 끝나면 조절할 수 있습니다</span>}</div>}
      {tuneBook && <TuneModal b={tuneBook} sheet={sheet} closed={closed} fail={fail} start={start} onClose={() => setTuneBook(null)} />}
      {ask && <div className="lf warn" style={{ margin: "8px 0 0" }} data-reflect="1"><span className="ln">⚠️</span>
        <div><b>경고 {warn.count}회째 · 반성문{warn.pending && !warn.today_disposal ? " (유예했던 것을 다시 묻습니다)" : ""}</b>
          <small>{warn.days} · 지난 반성문 뒤 {warn.since_written}회째</small></div></div>}
      {warn?.count > 0 && <div className="lenrow" style={{ marginTop: 8 }} data-limit="1"><span className="fl" style={{ margin: 0, width: "auto" }}>반성문 기준</span>
        <div className="stepper" data-g="limit"><button type="button" data-s="-" disabled={closed || warn.report_at <= 1} onClick={() => start(async () => { fail(await warnLimit(studentId, warn.report_at - 1)); })}>−</button><input type="text" inputMode="numeric" aria-label="반성문 기준 횟수" value={warn.report_at} readOnly /><button type="button" data-s="+" disabled={closed} onClick={() => start(async () => { fail(await warnLimit(studentId, warn.report_at + 1)); })}>+</button></div>
        <span className="note" style={{ margin: 0 }}>{warn.own_limit ? "이 아이만" : "학원 기본"} · 지금 {warn.since_written}회째</span></div>}
      {ask && <div className="lenrow" style={{ marginTop: 8 }}><span className="fl" style={{ margin: 0, width: "auto" }}>처분</span>
        <div className="seg sm" data-g="refl">{DISPOSAL.map(([k, name]) => <button key={k} type="button" aria-pressed={disp === k} disabled={closed} onClick={() => pickDisp(k)}>{name}</button>)}</div></div>}
      <form className="lategrid" action={async (f) => { fail(await late(f)); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <div><label className="fl">사유</label>
          {chips.length > 0 && <div className="tags" style={{ margin: "0 0 4px" }} data-g="reason-chips">{chips.map((c) => c.fixed ? <span key={c.key} className="tag on" data-g="reason-fixed">✓ {c.text}</span> : <button key={c.key} type="button" className={"tag" + (c.on ? " on" : "")} aria-pressed={c.on} data-act="reason-chip" disabled={closed} onClick={() => setReason(toggleReason(reason, c.text))}>{c.on ? "✓ " : "＋ "}{c.text}</button>)}</div>}
          <input type="text" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 워크북 나머지 10-18번" disabled={closed} /></div>
        <div><label className="fl">예상 귀가 시각</label><input type="text" name="untilAt" value={until} onChange={(e) => setUntil(e.target.value)} placeholder="예: 18:40" inputMode="numeric" disabled={closed} />
          <div className="seg sm" style={{ marginTop: 4 }}>{PLUS.map(([m, name]) => <button key={m} type="button" disabled={closed} onClick={() => setUntil(plus(m))}>{name}</button>)}</div></div>
        <div className="wv" style={{ marginBottom: 0 }}>
          <button className="btn sm" type="submit" disabled={closed}>적어 두기</button>
          <button className="btn sm pri" type="button" disabled={closed || !l?.until_at} onClick={() => start(async () => { fail(await lateSend(sheet.id)); })}>📨 지금 보내기</button>
          {l?.sent_at ? <span className="pill">보냄 {seoulTime(l.sent_at)}</span> : l?.until_at ? <span className="pill warn">보내야 함</span> : null}
        </div>
      </form>
      <div className="wv" style={{ marginTop: 8 }} data-g="left">
        <span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>실제 하원</span>
        <input type="text" value={left} onChange={(e) => setLeft(e.target.value)} placeholder="예: 22:05" inputMode="numeric" aria-label="실제 하원 시각" style={{ maxWidth: 110 }} />
        <button type="button" className="btn sm" data-act="left" disabled={!/^\d{2}:\d{2}$/.test(left)} onClick={() => start(async () => { fail(await lateLeft(studentId, date, left)); })}>찍기</button>
        {leftLine && <span className="lateout" data-g="left-out" style={{ margin: 0 }}>{leftLine}</span>}
      </div>
    </div>
  );
}
/** 🗺 진도 · 영역별 메모(목업 01) — 오늘 한 단원(검사 결과대로 ○◐✕ · 오늘 학습 ◐) · 영역 넷 한 마디(칸을 떠나면 저장 · 아이에게 그대로 나가고 브리핑 재료). 표 v2.day_area_memo(0079) */
/** ▾ 지금 쓸 일이 없는 카드는 접어 둔다(어9 · 원장님 2026-09-12 「더 편하고 간단하게 고도화시키라는 뜻」).
 *  **저장하지 않는다** — 설정이 아니라 그 날 상태로 정한다(적힌 것이 있는 아이는 저절로 펴져 있다 · 조회 0 · 속도-1).
 *  접혀도 **무엇이 들었는지는 제목 줄이 말한다**(대전제-0 — 「메모 없음」·「늦게 가는 아이 아님」) */
function Shut({ on, set, text = "" }) {
  return <>{on && text && <span className="pill dim" data-g="shut-note" style={{ order: 9 }}>{text}</span>}
    <button type="button" className="btn sm" data-act="shut" aria-pressed={on} aria-label={on ? "펴기" : "접기"} style={{ order: 10, padding: "0 6px" }} onClick={() => set(!on)}>{on ? "▸" : "▾"}</button></>;
}
function AreaMemoCard({ sheet, books, shut = null, closed, fail, start }) {
  const [off, setOff] = useState(Boolean(shut?.shut));
  const units = todayUnits(sheet, books);
  const init = Object.fromEntries(MEMO_AREAS.map((a) => [a, sheet.memos?.find((m) => m.area === a)?.memo ?? ""]));
  const [vals, setVals] = useState(init);
  const last = useRef(init);
  const save = (a) => { if ((vals[a] ?? "") === (last.current[a] ?? "")) return; last.current = { ...last.current, [a]: vals[a] }; start(async () => { fail(await areaMemo(sheet.id, a, vals[a])); }); };
  return (
    <div className="card" data-card="areamemo" data-folded={off ? "1" : "0"}>
      <div className="ctitle"><span className="cemo">🗺</span>진도 · 영역별 메모<Shut on={off} set={setOff} text={shut?.text} /></div>
      <label className="fl">오늘 한 단원</label>
      <div className="tags" style={{ marginBottom: 12 }} data-g="today-units">{units.length ? units.map((u) => <span key={u.id} className={"tag" + (u.on ? " on" : "")}>{u.label} {u.mark}</span>) : <span className="note" style={{ margin: 0 }}>아직 없음</span>}</div>
      <div className="areas">{MEMO_AREAS.map((a) => <div key={a}><label className="fl">{a}</label><input type="text" name={`memo-${a}`} value={vals[a]} disabled={closed} placeholder="(오늘 안 함)" onChange={(e) => setVals({ ...vals, [a]: e.target.value })} onBlur={() => save(a)} /></div>)}</div>
    </div>
  );
}
/** 📝 단원평가 · 숙제 검사 카드 안(🔤 바로 앞 · (어12)). 원장님이 05 에서 「출제 완료」를 누른 아이에게만 선다(출제는 원장님 업무 · 원장님 2026-09-14). 맞은 개수만 적는다 → 통과선(규칙 unit_test.pass_pct)으로 통과/미달 */
function UnitTestPart({ t, passPct, date, closed, fail, start }) {
  const [n, setN] = useState(t.correct ?? "");
  const res = unitResult(n, t.q_count, passPct);
  const put = (v) => { const x = Math.max(0, Math.min(Number(t.q_count ?? 0), Number(v) || 0)); setN(x); start(async () => { fail(await unitScore(t.id, x, date)); }); };
  const state = { todo: "낼 것", made: "출제 완료", taken: "봤음", scored: "채점함" }[t.state] ?? t.state;
  return (
    <div className="part" data-card="unit-test">
      <div className="hh">📝 단원평가 · {t.grammar_topics?.name ?? "분류 없음"}<span className="cnt">{state}</span></div>
      <div className="wtrow">
        <div className="wtset"><b>{t.q_count}문항</b><div className="tags">{t.books?.name && <span className="tag" data-g="ut-from">📚 {t.books.name} · {t.covers ?? t.chapter ?? `${t.seq}번째 세트`}</span>}{t.assigned_on && <span className="tag">낸 날 {String(t.assigned_on).slice(5).replace("-", "/")}</span>}<span className="tag">통과선 {passPct}%</span></div></div>
        <div className="wtscore"><label className="fl">맞은 개수</label>
          <div className="stepper" data-g="unit"><button type="button" data-s="-" disabled={closed} onClick={() => put((Number(n) || 0) - 1)}>−</button><input type="text" inputMode="numeric" value={n} aria-label="직접 입력" disabled={closed} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} onBlur={() => { if (n !== "") put(n); }} /><button type="button" data-s="+" disabled={closed} onClick={() => put((Number(n) || 0) + 1)}>+</button></div>
          {res && <div className={"wtres " + (res.pass ? "pass" : "fail")} data-g="unit-res"><b>{n} / {t.q_count}</b><span>{res.pct}% {res.pass ? "통과" : "미달"}</span></div>}
        </div>
      </div>
    </div>
  );
}
/** ✉️ 부모님께 나갈 글(목업 01 · 03 폰) · 키워드 → 상황(유형 다섯, 그날 상태에서 저절로) → 길이(상황이 먼저 고른다) → ✨ 브리핑(AI 초안 · 넘으면 문장 끝에서 자름 · 원장님 글은 덮지 않는다) → 글.
 *  글 밑에 저절로 붙는 줄과 👁 학부모 화면 미리보기(09·10 과 같은 판단). AI 초안을 안 고치고 마감하면 「그대로 보낼까요?」를 한 번 묻는다 — 막지 않는다(목업 9/5 ⑥) */
function CommentCard({ sheet, student, shut = null, closed, fail, start, cfg, phase, date, barHost, future = false, onCollapse, active = false, hasNext = false, onNext = null }) {
  const [off, setOff] = useState(Boolean(shut?.shut));
  const lines = attached({ next: student.quizzes?.next ?? [], late: sheet.late, warn: student.warn });
  const autoKind = pickKind({ hour: cfg?.hour, lateFrom: cfg?.lateFrom, checks: sheet.check, exam: examPhase(student.exams ?? [], date, phase) });   // 시험전·시험후는 이 아이의 시험에서(06b)
  const [kind, setKind] = useState(sheet.comment_kind ?? autoKind);
  const [cap, setCap] = useState(sheet.comment_cap ?? capOf(sheet.comment_kind ?? autoKind, cfg?.caps));
  const [keys, setKeys] = useState(sheet.comment_keys ?? "");
  const [text, setText] = useState(sheet.comment ?? "");
  const [draft, setDraft] = useState(sheet.comment_ai ?? "");
  const [offer, setOffer] = useState("");   // 초안이 나왔지만 지금 글이 있어 안 덮은 것
  const [ask, setAsk] = useState(null);      // 마감 전에 한 번 묻는 것 · ["same"(AI 초안 그대로, 확정-64), "late"(안 보낸 하원 지연, 확정-⑭)]. 막지 않는다
  const [show, setShow] = useState(false);   // 👁 미리보기
  const [made, setMade] = useState(null);
  const [edit, setEdit] = useState(false);   // (어24) 키워드·상황·길이는 「고치기」를 눌러야 — 상황·길이는 저절로
  const autoRan = useRef(false);    // 방금 만든 초안의 사정(다시 시킴 · 잘림)
  const askRef = useRef(null);
  useEffect(() => { if (ask) askRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [ask]);   // 저장줄이 화면 아래에 붙어 있을 때 묻는 상자가 눈 밖이면 데려온다
  const n = countChars(text), over = n > cap;
  const payload = () => ({ comment: text, kind, cap, keys });
  const pick = (k) => { setKind(k); setCap(capOf(k, cfg?.caps)); };
  const brief = (opts) => start(async () => {
    const auto = opts === true;   // 저절로 부른 것(✉️ 업무를 처음 볼 때)은 못 만들어도 조용히 · 요약 줄 「초안 없음」이 그대로고 ✨ 를 누르면 까닭을 말한다(키 없음 등)
    const r = await commentDraft(sheet.id, { kind, cap, keys });
    if (auto && r && !r.ok) return;
    if (fail(r)) { setDraft(r.draft.text); setMade(r.draft); if (r.draft.replaced) { setText(r.draft.text); setOffer(""); } else setOffer(r.draft.text); }   // fail() 은 ok 를 돌려준다(이름과 반대) — 실패면 그 자리에 말하고 끝
  });
  useEffect(() => { if (active && off) setOff(false); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  // (어24) ✉️ 업무를 고르면 카드가 펴진다(3단에서 접힌 채면 오른쪽이 비어 보인다 · 접기 상태는 화면 것이라 저장 안 함)
  useEffect(() => { if (active && !closed && !autoRan.current && !String(text).trim() && !draft) { autoRan.current = true; brief(true); } }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => start(async () => { fail(await comment(sheet.id, payload())); });
  const finish = (force) => { if (!force) { const a = askBeforeClose({ same: sameAsDraft(text, draft), late: sheet.late }); if (a.length) { setAsk(a); return; } } setAsk(null); start(async () => { (fail(await close(sheet.id, payload())) && onNext?.()); }); };
  const sendAndFinish = () => { setAsk(null); start(async () => { if (!fail(await lateSend(sheet.id))) return; (fail(await close(sheet.id, payload())) && onNext?.()); }); };   // 📨 보내고 마감 — 보내기가 실패하면 마감하지 않고 그 자리에서 말한다
  return (
    <div className="card" data-card="comment" data-folded={off ? "1" : "0"}>
      <div className="ctitle"><span className="cemo">✉️</span>부모님께 나갈 글{closed && <span className="auto">마감됨</span>}<Shut on={off} set={setOff} text={shut?.text} /></div>
      {lines.length > 0 && <div className="lf ok" style={{ marginBottom: 8 }} data-g="attached"><span className="ln">📝</span>
        <div><b>글 밑에 붙는 줄</b><small>{lines.map((l, i) => <span key={l.key} style={l.on ? undefined : { color: "var(--mute)" }}>{i ? " | " : ""}{l.text}</span>)}</small></div></div>}
      {closed && <div className="tags" style={{ marginBottom: 8 }}><span className="tag">{capName(cap)}</span><span className="tag type">{kindName(kind)}</span>{draft && sameAsDraft(text, draft) && <span className="tag">AI 초안 그대로</span>}</div>}
      {!closed && <div className="lf" data-g="comment-line"><span className="ln">✉️</span><div><b>{kindName(kind)} · {capName(cap)}</b><small>{draft ? "초안 준비됨" : "초안 없음"}{kind === autoKind ? " · 오늘 상태에서 저절로" : ""}</small></div>
        <button type="button" className="btn sm gho" data-act="comment-edit" aria-pressed={edit} onClick={() => setEdit((v) => !v)}>고치기</button><button type="button" className="btn sm" data-act="brief" onClick={brief}>✨ 브리핑</button></div>}
      {!closed && edit && <>
        <label className="fl">키워드</label>
        <input type="text" name="keys" value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="예: 간접의문문, 어순 스스로 설명" style={{ width: "100%" }} />
        <div className="lenrow"><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>상황</span>
          <div className="seg sm" data-g="kind">{CKIND.map(([k, name]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)}>{name}</button>)}</div>
          {kind === autoKind && <span className="note" style={{ margin: 0 }}>오늘 상태에서 저절로</span>}</div>
        <div className="lenrow"><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>길이</span>
          <div className="seg sm" data-g="cap">{CAPS.map((c) => <button key={c} type="button" aria-pressed={cap === c} onClick={() => setCap(c)}>{capName(c)}</button>)}</div>
          <span className={"cap" + (over ? " over" : "")} data-g="count">{n} / {capName(cap)}</span></div>
      </>}
      <textarea name="comment" value={text} onChange={(e) => { setText(e.target.value); setAsk(null); }} rows={3} placeholder="오늘 한 것 · 잘한 것 · 다음 시간에 할 것" disabled={closed} style={{ width: "100%", marginTop: 8 }} />
      {made && !closed && <p className="note" style={{ margin: "4px 0 0" }}>✨ 초안 {made.chars}자{made.retried ? ` · ${made.retried}번 다시 시킴` : ""}{made.cut ? " · 잘림" : ""}</p>}
      {offer && <div className="lf" data-g="offer"><span className="ln">✨</span><div><b>새 초안 · 지금 글은 그대로</b><small style={{ whiteSpace: "pre-wrap" }}>{offer}</small></div><button type="button" className="btn sm" onClick={() => { setText(offer); setOffer(""); }}>이 초안으로</button></div>}
      {show && <div className="lf" data-g="preview"><span className="ln">👁</span><div><b>학부모 화면</b><small style={{ whiteSpace: "pre-wrap" }}>{preview(text, lines) || "(아직 글이 없습니다)"}</small></div></div>}
      {ask && <div className="lf warn" data-g="ask" ref={askRef}><span className="ln">?</span><div>
        {ask.includes("same") && <b>AI 초안을 안 고치셨습니다. 그대로 보낼까요?</b>}
        {ask.includes("late") && <b>하원 지연 안내를 아직 안 보냈습니다</b>}</div>
        {ask.includes("late") && <button type="button" className="btn sm pri" data-act="send-close" onClick={sendAndFinish}>📨 보내고 마감</button>}
        <button type="button" className={"btn sm" + (ask.includes("late") ? "" : " pri")} data-act="close-anyway" onClick={() => finish(true)}>그대로 마감</button>
        <button type="button" className="btn sm" onClick={() => setAsk(null)}>{ask.includes("same") ? "고치기" : "돌아가기"}</button></div>}
      {!closed && <div className="wv" style={{ marginTop: 8 }}>
        <button className="btn sm gho" type="button" data-act="preview" aria-pressed={show} onClick={() => setShow((v) => !v)}>👁 미리보기</button></div>}
      {!closed && barHost && createPortal(<>
        <button className="btn sm pri" type="button" data-act="close" disabled={future} onClick={() => finish(false)}>{hasNext ? "저장하고 마감 → 다음 아이" : "저장하고 마감"}</button>
        <button className="btn sm" type="button" data-act="save" onClick={save}>임시 저장</button>
        <button className="btn sm gho" type="button" data-act="collapse" onClick={onCollapse}>닫기</button>
        <span className="note" style={{ margin: 0 }} data-g="close-note">{future ? "앞으로 올 날 · 마감이 잠겨 있습니다(임시 저장은 됩니다)" : "마감하면 학부모에게 보입니다"}</span>
      </>, barHost)}
    </div>
  );
}
/** (어13) 숙제 주기 — 원장님 2026-09-14 「오늘 화면에 숙제가 없었을때 부여하는 버튼 필요해. 모달로 따로 뜨게.(기존 페이지에서 더 늘어나지않게)」.
 *  루틴이 안 깔린 날(교재 보류 · 루틴 없음)에 원장님이 직접 주시는 것 · 한 줄에 하나 · 집/학원 · 여러 줄 한 번에(lib/homework addItems). 페이지엔 단추 하나만 선다 */
function GiveModal({ sheet, slot: at, fail, start, onClose }) {
  const [failM, errNode] = useModalErr();   // (어49) 모달 안 손의 실패는 모달 안에 선다 · 덮개 뒤 판에 뜨면 「단추가 안 먹힌다」로 보인다(원장님 9/16)
  const [slot, setSlot] = useState(at ?? "home");
  const [text, setText] = useState("");
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = () => start(async () => { if (failM(await give(sheet.id, slot, text))) onClose(); });
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="숙제 주기" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(480px,100%)" }} data-g="give-modal">
        <div className="mdlh"><b>숙제 주기</b>
          <div className="seg sm" data-g="give-slot">{[["home", "집"], ["class", "학원"]].map(([k, name]) => <button key={k} type="button" aria-pressed={slot === k} onClick={() => setSlot(k)}>{name}</button>)}</div>
          <span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">{errNode}<textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"한 줄에 하나\n예: 워크북 p.10 1-18"} aria-label="줄 항목" style={{ width: "100%" }} /></div>
        <div className="mdlf"><button type="button" className="btn pri" data-act="give-save" disabled={!lines.length} onClick={save}>{lines.length ? `${lines.length}개 주기` : "주기"}</button><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
/** 02 조절 · 교재마다 오늘 나갈 소단원(칩이 곧 고른 것 · + 는 도는 차례의 다음 하나 · 다음 대단원까지, (어33)) · 긴 줄의 「이번에」 · 나가는 차례(읽기만) · 메모 둘. 기본값대로 나가는 날은 안 연다(클릭 0). 화면엔 개수가 아니라 문항·쪽 합계(확정-㉓) */
function TuneModal({ b, sheet, closed, fail, start, onClose }) {
  const [failM, errNode] = useModalErr();   // (어49) 모달 안 손의 실패는 모달 안에 선다 · 덮개 뒤 판에 뜨면 「단추가 안 먹힌다」로 보인다(원장님 9/16)
  const [pool, setPool] = useState(null);
  const [sel, setSel] = useState([]);
  const [ranges, setRanges] = useState({});
  const [memo, setMemo] = useState({ class: "", home: "" });
  useEffect(() => { let alive = true; (async () => { const r = await tuneOpen(sheet.id, b.book_id); if (!alive) return; if (!fail(r)) { onClose(); return; }
    // 지금 나가는 소단원이 고른 채로 열린다(학습 줄 · 없으면 숙제 줄) · 판에 없으면 도는 차례의 첫 것
    const cur = r.pool.current.class.length ? r.pool.current.class : r.pool.current.home, ids = r.pool.pool.map((u) => u.unit_id), now = ids.filter((id) => cur.includes(id));
    setPool(r.pool); setSel(now.length ? now : ids.slice(0, 1)); setRanges(r.pool.ranges ?? {}); setMemo(r.pool.memos); })(); return () => { alive = false; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!pool) return <div className="mdlov" role="dialog" aria-modal="true"><div className="mdl" style={{ width: "min(520px,100%)" }}><div className="mdlb">{errNode}<p className="note">읽는 중…</p></div></div></div>;
  const selected = tuneSorted(pool.pool, sel), picked = new Set(sel);
  const sum = loadOf(selected), empty = !sum.questions && !sum.pages, next = pool.chapters?.[1] ?? null;
  const toggle = (u) => setSel(picked.has(u.unit_id) ? sel.filter((x) => x !== u.unit_id) : [...sel, u.unit_id]);
  const apply = () => start(async () => { const r = await tuneApply(sheet.id, b.book_id, { unitIds: selected.map((u) => u.unit_id), ranges: Object.fromEntries(selected.filter((u) => ranges[u.unit_id]).map((u) => [u.unit_id, ranges[u.unit_id]])), classMemo: memo.class, homeMemo: memo.home }); if (failM(r)) onClose(); });
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="조절" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(520px,100%)" }}>
        <div className="mdlh"><b>{b.books.name} · {pool.chapter ?? "남은 대단원 없음"}</b><span className="tag type">{pool.round}회독</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">
          <div className="hw">
            <div className="hwname"><b>오늘 나갈 소단원</b><small data-g="tune-left">{pool.chapter ? `${pool.chapter} 에서 아직 안 나간 소단원 ${pool.inChapter}개` : `아직 안 나간 소단원 ${pool.pool.length}개`}{next ? ` · 다음 대단원 ${next} 도 고를 수 있음` : ""}</small>
              <div className="units unitcol">{pool.pool.map((u, i) => <Fragment key={u.unit_id}>{(pool.chapters?.length ?? 0) > 1 && u.chapter && u.chapter !== pool.pool[i - 1]?.chapter && <span className="note" data-g="tune-chapter" style={{ margin: "4px 0 0", fontWeight: 700 }}>{u.chapter}</span>}<button type="button" className="unit" aria-pressed={picked.has(u.unit_id)} disabled={closed} onClick={() => toggle(u)}>{u.short}<i>{pagesText(u) ?? ""}{u.q_count ? ` · ${u.q_count}문항` : ""}</i></button></Fragment>)}</div>
            </div>
            <div className="stepper"><button type="button" data-s="-" disabled={closed} onClick={() => setSel(tuneStep(pool.pool, sel, -1))}>−</button><input type="text" inputMode="numeric" value={selected.length} aria-label="직접 입력" disabled={closed} onChange={(e) => setSel(tuneCount(pool.pool, Math.max(1, Number(e.target.value) || 1)))} /><button type="button" data-s="+" disabled={closed} onClick={() => setSel(tuneStep(pool.pool, sel, 1))}>+</button></div>
          </div>
          <div className="lf warn" style={{ margin: "2px 0 8px" }}><span className="ln">📐</span>
            <div><b>고른 소단원 {selected.length}개 = 오늘 <span style={{ color: "var(--navy)" }}>{empty ? "문항·쪽 수가 교재에 없음" : `${sum.questions}문항 · ${sum.pages}쪽`}</span></b>
              <small>{selected.map((u) => `${u.short} ${u.q_count ?? 0}문항`).join(" · ") || "고른 소단원 없음"} · 오늘 교재 {pool.books}권 다 합치면 <b>{pool.load.questions}문항 · {pool.load.pages}쪽</b>(지금 배정된 대로)</small></div></div>
          <div className="lf ok" style={{ margin: "2px 0 8px" }}><span className="ln">🔀</span>
            <div><b>나가는 차례 · <span style={{ color: "var(--ok)" }}>{pool.orderBasis === "chapter" ? "대단원마다" : "소단원마다"}</span></b><small>{pool.orderBasis === "chapter" ? "본책 한 대단원을 다 하고 나서 워크북" : "소단원 하나 끝날 때마다 워크북도 같이"}</small></div></div>
          {selected.filter((u) => (u.q_count ?? 0) >= pool.splitFrom).map((u) => (
            <div key={u.unit_id} style={{ margin: "4px 0 12px" }}>
              <div className="hw"><div className="hwname"><b>{u.short}</b><small>{u.q_count}문항{pagesText(u) ? ` · ${pagesText(u)}` : ""}</small></div></div>
              <div className="wv"><span className="fl" style={{ margin: 0 }}>이번에</span>
                <div className="seg sm" data-g="qrange">{splitPresets(u.q_count).map((o) => <button key={o.key} type="button" aria-pressed={(ranges[u.unit_id] ?? null) === o.range} disabled={closed} onClick={() => setRanges({ ...ranges, [u.unit_id]: o.range })}>{o.name}</button>)}</div>
                <input type="text" value={ranges[u.unit_id] ?? ""} placeholder="전체" disabled={closed} style={{ flex: "1 1 100px", minWidth: 100 }} onChange={(e) => setRanges({ ...ranges, [u.unit_id]: e.target.value || null })} /></div>
            </div>))}
          <div className="tune" style={{ marginTop: 12 }}>
            <div><label className="fl">이 교재 학습 메모</label><input type="text" value={memo.class} disabled={closed} onChange={(e) => setMemo({ ...memo, class: e.target.value })} /></div>
            <div><label className="fl">이 교재 숙제 메모</label><input type="text" value={memo.home} disabled={closed} onChange={(e) => setMemo({ ...memo, home: e.target.value })} /></div>
          </div>
        </div>
        <div className="mdlf"><button type="button" className="btn pri" disabled={closed || !selected.length} onClick={apply}>적용</button><button type="button" className="btn gho" onClick={onClose}>닫기</button>
          <span className="spacer" />{pool.tuned + 1 >= pool.askAfter && <span className="pill warn" data-g="ask-routine">같은 조절 {pool.tuned + 1}번째 · 루틴을 고칠까요? <Link prefetch={false} href={`/settings/routine?s=${sheet.student_id}#book-${b.book_id}`} data-act="to-routine">루틴 11 ↗</Link></span>}</div>
      </div>
    </div>
  );
}
/** 02b 진도 체크 · 진도 나무는 표 하나 · 보기 넷(확정-51). 대단원 접기 · 소단원 ○◐· (되돌리기 한 자리, 확정-㊶) · 이 대단원 건너뛰기 · ✍ 메모로 자동 ○ 후보(확정-㊳). 찍으면 바로 저장 · 저장 단추가 따로 없다.
 *  (어34) 원장님 9/15: 줄마다 「여기까지 ○」(그 소단원까지 모두 끝냄) · 소단원 네모 · 대단원을 펴면 「이 대단원 전체」 → 띠에서 ○ 끝냄 · ◐ 하는 중 · · 아직 한 번에(고르기 한 벌 · 대전제-20) */
/** 02c 결석·지각 예정 — 수업일만 고를 수 있는 좁은 달력 · 고른 날의 결석(사유 · 보강 날짜·시각 직접 · 안 잡음) / 지각(얼마나 · 사유) · 📨 학부모께 알림. 보강 시각은 앱이 제안하지 않는다(확정-㉔) */
function PlanModal({ student, date, fail, start, onClose }) {
  const [failM, errNode] = useModalErr();   // (어49) 모달 안 손의 실패는 모달 안에 선다 · 덮개 뒤 판에 뜨면 「단추가 안 먹힌다」로 보인다(원장님 9/16)
  const [ym, setYm] = useState(date.slice(0, 7));
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ kind: "none", reason: "", makeupOn: "", makeupAt: "", waived: false, minutes: "" });
  const [slot, setSlot] = useState("");   // 그 시각 아이 수(확정-㉔ — 보여만 주고 막지 않는다 · 4단계-3a)
  useEffect(() => { const on = form.makeupOn, at = form.makeupAt; if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(at) || form.waived) { setSlot(""); return; }
    let alive = true; const t = setTimeout(async () => { const r = await slotView(on, at); if (alive && r?.ok) setSlot(slotText(r.slot)); }, 400); return () => { alive = false; clearTimeout(t); }; }, [form.makeupOn, form.makeupAt, form.waived]);
  const [mk, setMk] = useState(false);
  const load = async (m) => { const r = await planView(student.id, m); if (failM(r)) setData(r.plan); };
  useEffect(() => { load(ym); }, [ym]);   // eslint-disable-line react-hooks/exhaustive-deps
  const grid = monthGrid(ym);
  const mark = (d) => markOf(d, data ?? {});
  const pick = (d) => { const m = mark(d); if (!m.pick && m.kind !== "absent" && m.kind !== "late") return; setSel(d); setMk(false);
    if (m.kind === "absent") setForm({ kind: "absent", reason: m.plan.reason ?? "", makeupOn: m.plan.on_date ?? "", makeupAt: String(m.plan.at_time ?? "").slice(0, 5), waived: m.plan.state === "waived", minutes: "" });
    else if (m.kind === "late") setForm({ kind: "late", reason: m.plan.reason ?? "", makeupOn: "", makeupAt: "", waived: false, minutes: m.plan.minutes ?? "" });
    else setForm({ kind: "absent", reason: "", makeupOn: "", makeupAt: "", waived: false, minutes: "" }); };
  const save = () => start(async () => { const r = await planPut(student.id, sel, form); if (failM(r)) { await load(ym); } });
  const send = () => start(async () => { const r = await planSend(student.id, sel); if (failM(r)) await load(ym); });
  const K = (d) => ({ class: "·", absent: "✕", late: "⏰", makeup: "↻", off: "🚫", exam: "📝" })[mark(d).kind];   // exam: (저) 시험 기간 — 결석 예상(표시만 · 0152)
  const I = (d) => ({ class: "i-cls", absent: "i-abs", late: "i-late", makeup: "i-mk", off: "i-off", exam: "i-ex" })[mark(d).kind];
  const label = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${weekdayName(d)}`;
  const cur = sel ? mark(sel) : null;
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="결석·지각 예정" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(540px,100%)" }}>
        <div className="mdlh"><b>📅 {student.name} · 결석·지각 예정</b>{data?.label && <span className="pill">{data.label}</span>}<span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">{errNode}
          <div className="calhead"><button type="button" className="btn sm gho" onClick={() => setYm(nextYm(ym, -1))}>◂</button><b>{ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월</b><button type="button" className="btn sm gho" onClick={() => setYm(nextYm(ym, 1))}>▸</button>
            <span className="spacer" /><span className="pill">수업일만 고를 수 있습니다</span></div>
          <div className="cal pick" data-g="plancal">
            {["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
            {grid.map((g) => { const m = mark(g.date); const can = m.pick || m.kind === "absent" || m.kind === "late"; return (
              <div key={g.date} className={"cd" + (g.out ? " out" : can ? " cls" : m.kind === "off" ? " cls off" : " no") + (sel === g.date ? (m.kind === "late" ? " sel-l" : " sel-x") : "")} data-date={g.date} role={can ? "button" : undefined} tabIndex={can ? 0 : undefined} onClick={() => !g.out && pick(g.date)}>
                {g.out ? g.day : <><span className="dn">{g.day}</span>{K(g.date) && <i className={"cm " + I(g.date)}>{K(g.date)}</i>}</>}
              </div>); })}
          </div>
          {sel && <div className={"pk " + (form.kind === "late" ? "late" : "abs")} data-g="plan-pick">
            <div className="pkh"><i className={"cm " + (form.kind === "late" ? "i-late" : "i-abs")}>{form.kind === "late" ? "⏰" : "✕"}</i><b>{label(sel)} · {form.kind === "late" ? "지각" : "결석"}</b><span className="spacer" />
              <div className="seg sm" data-g="plankind">{PLAN_KIND.map(([k, name]) => <button key={k} type="button" aria-pressed={form.kind === k} onClick={() => setForm({ ...form, kind: k })}>{name}</button>)}</div></div>
            {form.kind === "absent" && <>
              <div className="wv"><span className="fl" style={{ margin: 0 }}>사유</span><input type="text" value={form.reason} placeholder="예: 가족 여행" style={{ flex: "1 1 150px" }} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="wv"><span className="fl" style={{ margin: 0 }}>보강</span>
                <input type="text" value={form.makeupOn} placeholder="2026-10-18" style={{ maxWidth: 130 }} disabled={form.waived} onChange={(e) => setForm({ ...form, makeupOn: e.target.value })} />
                <input type="text" value={form.makeupAt} placeholder="14:00" style={{ maxWidth: 80 }} disabled={form.waived} onChange={(e) => setForm({ ...form, makeupAt: e.target.value })} />
                <button type="button" className="btn sm" data-act="mkcal" disabled={form.waived} onClick={() => setMk(!mk)}>📅 달력에서 고르기</button>
                <label className="ckl"><input type="checkbox" className="ck" checked={form.waived} onChange={(e) => setForm({ ...form, waived: e.target.checked })} />안 잡음</label></div>
              {mk && <div className="mkcal open"><div className="calhead"><b>{ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월</b><span className="spacer" /><span className="pill">아무 날이나</span></div>
                <div className="cal" data-g="mkcal">{["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
                  {grid.map((g) => <div key={g.date} className={"cd" + (g.out ? " out" : "") + (form.makeupOn === g.date ? " pickd" : "")} role={g.out ? undefined : "button"} onClick={() => !g.out && setForm({ ...form, makeupOn: g.date })}>{g.out ? g.day : <><span className="dn">{g.day}</span>{K(g.date) && <i className={"cm " + I(g.date)}>{K(g.date)}</i>}</>}</div>)}</div>
                <div className="wv" style={{ margin: "8px 0 0" }}><span className="fl" style={{ margin: 0 }}>시각</span><input type="text" value={form.makeupAt} placeholder="14:00" style={{ maxWidth: 90 }} onChange={(e) => setForm({ ...form, makeupAt: e.target.value })} />
                  <div className="seg sm">{["10:00", "11:00", "14:00", "16:00"].map((t) => <button key={t} type="button" aria-pressed={form.makeupAt === t} onClick={() => setForm({ ...form, makeupAt: t })}>{t}</button>)}</div>
                  <span className="note" style={{ margin: 0 }} data-g="slot">{slot}</span></div></div>}
            </>}
            {form.kind === "late" && <>
              <div className="wv"><span className="fl" style={{ margin: 0 }}>얼마나</span>
                <div className="seg sm" data-g="latemin">{LATE_PRESET.map(([m, name]) => <button key={m} type="button" aria-pressed={Number(form.minutes) === m} onClick={() => setForm({ ...form, minutes: m })}>{name}</button>)}</div>
                <input type="text" inputMode="numeric" value={form.minutes} placeholder="분" style={{ maxWidth: 90 }} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></div>
              <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>사유</span><input type="text" value={form.reason} placeholder="예: 학교 보충수업" style={{ flex: "1 1 150px" }} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </>}
            {form.kind === "none" && <p className="note" style={{ margin: "8px 0 0" }}>저장하면 「온다」로 돌아갑니다</p>}
            {cur?.plan?.notified_at && <p className="note" style={{ margin: "8px 0 0" }}>📨 학부모께 알림 보냄 {String(cur.plan.notified_at).slice(0, 16).replace("T", " ")}</p>}
          </div>}
          <div className="clegend"><span><i className="cm i-cls">·</i>수업일</span><span><i className="cm i-abs">✕</i>결석 예정</span><span><i className="cm i-late">⏰</i>지각 예정</span><span><i className="cm i-mk">↻</i>보강</span><span><i className="cm i-off">🚫</i>휴강</span><span><i className="cm i-ex">📝</i>시험 기간 · 결석 예상(표시만)</span></div>
        </div>
        <div className="mdlf"><button type="button" className="btn pri" disabled={!sel} onClick={save}>저장</button><button type="button" className="btn" disabled={!sel || !cur?.plan} onClick={send}>📨 학부모께 알림</button><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
