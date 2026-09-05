"use client";
/** 학생 줄 — 목업 01 의 .row 그대로. 자주 누르는 것(출결 · ○△✕)은 낙관적: 화면 먼저, 저장은 뒤에서, 실패하면 되돌리고 그 자리에서 말한다(속도-5).
 *  마감·발송처럼 되돌릴 수 없는 것은 서버 답을 기다린다. 마감된 판은 읽기만 한다 */
import { useState, useRef, useTransition } from "react";
import { setAttend, check, rest, add, move, late, lateSend, comment, close, openSheet, mode as setMode, stop as setStop, wave as pickWave, memo as saveMemo, quizAdd, quizSet, quizTake, quizRetest, quizSkip, tuneOpen, tuneApply, reflectAs, warnLimit, progressOpen, progressSet, progressSkip, planView, planPut, planSend, commentDraft, areaMemo, unitScore } from "./actions.js";
import { monthGrid, nextYm, markOf, makeupText, LATE_PRESET, KIND as PLAN_KIND } from "@/lib/plan-plan";
import { weekdayName } from "@/lib/day-plan";
import { whoMeta, marks, roundPill, unseenPill, todayUnits, MEMO_AREAS, unitResult } from "@/lib/roster-plan";
import { KIND as CKIND, CAPS, kindName, capName, capOf, pickKind, countChars, attached, preview, sameAsDraft } from "@/lib/comment-plan";
import { TRI } from "@/lib/progress-plan";
import { DISPOSAL } from "@/lib/warn-plan";
import { KIND, SOURCE, scopeText } from "@/lib/quiz-plan";
import { isUnchecked, CHECK } from "@/lib/status";
import { STOP, MODE, stopOn, tuneUnits, loadOf, splitPresets } from "@/lib/routine-plan";
import { useEffect } from "react";
const ATTEND = [["present", "왔음"], ["late", "지각"], ["absent", "결석"], ["early", "조퇴"], ["online", "온라인"]];
const UPTO = ["시작만", "절반", "거의 다"];
const REST = [["class", "오늘 학습으로"], ["home", "다음 숙제로"], ["stay", "남아서"]];
const PLUS = [[20, "+20분"], [40, "+40분"], [60, "+1시간"]];
const plus = (min) => { const t = new Date(Date.now() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
const attendName = (v) => ATTEND.find(([k]) => k === v)?.[1] ?? v;

export default function Row({ student, sheet, classId, date, minutes, defaultOpen, cfg }) {
  const [open, setOpen] = useState(defaultOpen);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const closed = Boolean(sheet?.closed);
  const fail = (r) => { if (r && !r.ok) setErr(r.msg); return r?.ok; };
  // 출결 — 낙관적
  const [attend, setAttendLocal] = useState(sheet?.attend ?? (student.plan?.absent ? "absent" : student.plan?.late ? "late" : "present"));
  const [plan, setPlan] = useState(false);
  const pickAttend = (v) => { if (closed) return; const prev = attend; setAttendLocal(v); setErr("");
    start(async () => { let id = sheet?.id; if (!id) { const r = await openSheet(student.id, classId, date); if (!fail(r)) { setAttendLocal(prev); return; } id = r.sheetId; } const r = await setAttend(id, v); if (!fail(r)) setAttendLocal(prev); }); };
  const nCheck = sheet?.check.length ?? 0, nLeft = sheet?.check.filter(isUnchecked).length ?? 0;
  const status = closed ? "마감됨" : student.plan?.absent && !sheet ? `결석 예정 · ${makeupText(student.plan)}` : attend === "absent" ? "결석 · 보강 안 잡힘" : student.plan?.makeup && !closed ? `보강 ${String(student.plan.at_time ?? "").slice(0, 5)}` : student.plan?.late && !sheet ? `지각 예정${student.plan.minutes ? ` ${student.plan.minutes}분` : ""}` : nLeft ? (unseenPill(sheet.check, date) || `검사 ${nLeft}/${nCheck} 남음`) : null;
  return (
    <div className={"row" + (closed ? " closed" : "")} data-open={open ? "1" : "0"} data-student={student.id}>
      <div className="rowtop">
        <span className="who">{student.name}</span><span className="meta">{whoMeta(student)}</span>
        <span className="marks">{marks(sheet?.check ?? []).map((m, i) => <i key={i} className={"dot" + (m.cls ? " " + m.cls : "")}>{m.ch}</i>)}</span>
        <div className="seg sm" data-g="att" aria-label={`${student.name} 출결`}>
          {ATTEND.map(([v, name]) => <button key={v} type="button" aria-pressed={attend === v} disabled={closed} onClick={() => pickAttend(v)}>{name}</button>)}
        </div>
        <span className="spacer" />
        {sheet && <span className="pill hw">학원 {sheet.class.length} · 숙제 {sheet.home.length}</span>}
        {roundPill(student.books) && <span className="pill">{roundPill(student.books)}</span>}
        {student.warn?.count > 0 && <span className={"pill" + (student.warn.due || student.warn.today_disposal ? " bad" : "")} data-warn="1">경고 {student.warn.count}{student.warn.due || student.warn.today_disposal ? " · 반성문" : ""}</span>}
        {status && <span className={"pill" + (closed ? "" : attend === "absent" ? " bad" : " warn")}>{status}</span>}
        <button type="button" className="btn sm" data-act="plan" onClick={() => setPlan(true)}>📅 예정</button>
        <button type="button" className="open" onClick={() => setOpen(!open)}>{open ? "닫기" : "펴기"}</button>
      </div>
      {plan && <PlanModal student={student} date={date} fail={fail} start={start} onClose={() => setPlan(false)} />}
      {open && (
        <div className="panel">
          {err && <div className="lf warn" role="alert" style={{ margin: "0 0 8px" }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
          {!sheet && <div className="card"><p className="note">아직 판이 없습니다 — 출결을 누르면 섭니다.</p></div>}
          {sheet && <>
            {(student.quizzes?.today?.length ?? 0) > 0 && <QuizCard sheet={sheet} quizzes={student.quizzes.today} closed={closed} fail={fail} start={start} />}
            <CheckCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <WorkCard sheet={sheet} books={student.books ?? []} next={student.quizzes?.next ?? []} date={date} minutes={minutes} closed={closed} fail={fail} start={start} />
            {(student.unitTests ?? []).map((t) => <UnitTestCard key={t.id} t={t} passPct={cfg?.unitPass} date={date} closed={closed} fail={fail} start={start} />)}
            <AreaMemoCard sheet={sheet} books={student.books ?? []} closed={closed} fail={fail} start={start} />
            <LateCard sheet={sheet} warn={student.warn} studentId={student.id} closed={closed} fail={fail} start={start} />
            <CommentCard sheet={sheet} student={student} closed={closed} fail={fail} start={start} cfg={cfg?.comment} />
          </>}
        </div>
      )}
    </div>
  );
}

function CheckCard({ sheet, closed, fail, start }) {
  const left = sheet.check.filter(isUnchecked).length;
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">1</span> 숙제 검사 · 집에서 해온 것{sheet.check.length ? <span className="auto">{left ? `${left}/${sheet.check.length} 남음` : "다 봤습니다"}</span> : null}</div>
      {!sheet.check.length && <p className="note">검사할 지난 숙제가 없습니다.</p>}
      {sheet.check.map((it) => <CheckItem key={it.id} it={it} closed={closed} fail={fail} start={start} />)}
    </div>
  );
}
function CheckItem({ it, closed, fail, start }) {
  const [st, setSt] = useState(isUnchecked(it) ? null : it.status);
  const [upto, setUpto] = useState(it.done_note ?? "");
  const [restTo, setRestTo] = useState(null);
  const pick = (v) => { if (closed) return; const prev = st; setSt(v); start(async () => { const r = await check(it.id, v, v === "weak" ? upto || null : null); if (!fail(r)) setSt(prev); }); };
  const pickUpto = (u) => { setUpto(u); start(async () => { fail(await check(it.id, "weak", u)); }); };
  const pickRest = (w) => { setRestTo(w); start(async () => { fail(await rest(it.id, w)); }); };
  return (
    <div className="hw">
      <div className="hwname"><b>{it.range_note || "(이름 없음)"}</b>{it.memo && <small>{it.memo}</small>}
        {st && st !== "done" && !closed && (
          <div className="partial">
            {st === "weak" && <div className="wv"><span className="fl" style={{ margin: 0 }}>어디까지</span><div className="seg sm" data-g="upto">{UPTO.map((u) => <button key={u} type="button" aria-pressed={upto === u} onClick={() => pickUpto(u)}>{u}</button>)}</div></div>}
            <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>나머지는</span><div className="seg sm" data-g="rest">{REST.map(([w, name]) => <button key={w} type="button" aria-pressed={restTo === w} onClick={() => pickRest(w)}>{name}</button>)}</div></div>
          </div>
        )}
      </div>
      <div className="chk" aria-label="검사">
        {CHECK.map(([v, g]) => <button key={v} type="button" data-v={v[0]} aria-pressed={st === v} disabled={closed} onClick={() => pick(v)}>{g}</button>)}
      </div>
    </div>
  );
}
/** 2 오늘 학습 + 3 오늘 숙제 — 목업 01 의 카드 그대로: 분량 띠(학원·숙제·줄이기) → 교재마다 머리(회독·대단원·상태 세그먼트) + 좌우(폰은 위아래) 학습·숙제(회차·줄·메모) → 교재 없는 줄(손으로 더한 것·나머지) */
function WorkCard({ sheet, books, next, date, minutes, closed, fail, start }) {
  const nextQuiz = <NextQuiz sheet={sheet} books={books} quizzes={next} closed={closed} fail={fail} start={start} />;
  const laid = sheet.books.some((b) => b.laid_at);
  const per = minutes && sheet.class.length ? (minutes / sheet.class.length).toFixed(1) : null;
  const isAuto = (it) => Boolean(it.item_id && !it.carry_of && it.unit_id);   // 루틴이 깐 줄 — 교재 반쪽에. 손으로 더한 줄·나머지 줄은 단원이 있어도 「그 밖에」
  const unitless = (slot) => sheet[slot].filter((it) => !isAuto(it));
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">2</span>오늘 학습 · 학원 &nbsp;+&nbsp; <span className="stepno">3</span>오늘 숙제 · 집<span className="auto">{laid ? "검사에서 저절로 깔림" : sheet.check.length ? "검사 끝나면 채워집니다" : "깔 교재가 없습니다"}</span></div>
      <div className="load">
        <div className="ldn"><span>학원</span><b>{sheet.class.length}</b><small>{per ? <>{minutes}분이면 한 항목에 <b>{per}분</b></> : "오늘 여기서 할 것"}</small></div>
        <div className="ldn"><span>숙제</span><b>{sheet.home.length}</b><small>집에서 할 것 — 다음 시간 검사</small></div>
        {laid && <div className="ldw">{books.length > 1 ? <>⚠️ <b>교재 {books.length}권이라 항목이 {sheet.class.length + sheet.home.length}개입니다.</b></> : <b>교재 {books.length}권 · 항목 {sheet.class.length + sheet.home.length}개</b>}
          <div className="wv" style={{ margin: "4px 0 0" }}><span className="fl" style={{ margin: 0 }}>줄이기</span>
            <div className="seg sm" data-g="mode">{MODE.map(([k, name]) => <button key={k} type="button" aria-pressed={(sheet.load_mode ?? "all") === k} disabled={closed} onClick={() => start(async () => { fail(await setMode(sheet.id, k)); })}>{name}</button>)}</div>
          </div>
        </div>}
      </div>
      {books.map((b, i) => <BookBlock key={b.id} b={b} sheet={sheet} date={date} closed={closed} fail={fail} start={start} extra={i === 0 ? nextQuiz : null} />)}
      <div className="two">
        {[["class", "그 밖에 · 학원", "home", "⏭ 숙제로 미루기"], ["home", "그 밖에 · 집", "class", "↩ 학원에서"]].map(([slot, title, other, moveLabel]) => (
          <div className="half" key={slot}>
            <div className="hh">{title}<span className="cnt">{unitless(slot).length}개</span></div>
            {unitless(slot).map((it, i) => <div className="li" key={it.id}><span className="n">{i + 1}</span><div><b>{it.range_note || it.learn_items?.name || "(이름 없음)"}</b>{it.carry_of && <small>지난 숙제의 나머지</small>}</div>{!closed && <button type="button" className="btn sm" onClick={() => start(async () => { fail(await move(it.id, other)); })}>{moveLabel}</button>}</div>)}
            {!closed && <form className="wv" action={async (f) => { fail(await add(f)); }}><input type="hidden" name="sheetId" value={sheet.id} /><input type="hidden" name="slot" value={slot} /><input type="text" name="text" placeholder="항목 더하기 — 예: 워크북 p.10 1-18" style={{ flex: "1 1 160px", minWidth: 0 }} /><button className="btn sm" type="submit">항목 더하기</button></form>}
            {slot === "home" && !books.length && nextQuiz}
          </div>
        ))}
      </div>
    </div>
  );
}
const pages = (u) => u?.page_start ? `p.${u.page_start}${u.page_end && u.page_end !== u.page_start ? `-${u.page_end}` : ""}` : null;
/** 교재 하나 — 머리(이름 · N회독 · 대단원 · 진행중/숙제멈춤/교재멈춤) + 학습·숙제 좌우. 줄은 루틴 항목마다 하나, 소단원이 둘이면 이름을 잇는다 */
function BookBlock({ b, sheet, date, closed, fail, start, extra = null }) {
  const stop = stopOn(b, date);
  const mark = sheet.books.find((x) => x.book_id === b.book_id);
  const [tune, setTune] = useState(false);
  const [prog, setProg] = useState(false);
  const rows = (slot) => sheet[slot].filter((it) => it.units?.book_id === b.book_id && it.item_id && !it.carry_of);   // 루틴이 깐 줄만 — 나머지 줄(carry_of)은 「그 밖에」
  const chapter = rows("class")[0]?.units?.chapter ?? rows("home")[0]?.units?.chapter ?? null;
  const pickStop = (m) => start(async () => { fail(await setStop(sheet.id, b.id, m)); });
  return (
    <div className={"bk" + (stop === "book_off" ? " stopped" : "")} data-book={b.book_id}>
      <div className="bkh">
        <b>{b.books.name}</b>
        <span className="tag type">{b.round}회독 · 단원 진행</span>
        {chapter && <span className="tag">{chapter}</span>}
        <span className="spacer" />
        <div className="seg sm stopseg" data-g="stop">{STOP.map(([k, name]) => <button key={k} type="button" aria-pressed={stop === k} disabled={closed} onClick={() => pickStop(k)}>{name}</button>)}</div>
        <button type="button" className="btn sm" data-act="tune" disabled={closed || !mark?.laid_at || stop === "book_off"} onClick={() => setTune(true)}>조절 ↗</button>
        <button type="button" className="btn sm" data-act="progress" onClick={() => setProg(true)}>진도 체크 ↗</button>
      </div>
      {tune && <TuneModal b={b} sheet={sheet} closed={closed} fail={fail} start={start} onClose={() => setTune(false)} />}
      {prog && <ProgressModal b={b} sheet={sheet} closed={closed} fail={fail} start={start} onClose={() => setProg(false)} />}
      {stop === "book_off" ? <div className="stopnote big"><b>교재 멈춤</b> — {b.stop_until ? `${b.stop_until} 에 저절로 풀립니다` : "진행중을 누르면 다시 나갑니다"}</div>
      : !mark?.laid_at ? <div className="stopnote">검사 끝나면 채워집니다</div>
      : mark.waves?.why ? <div className="stopnote"><b>{mark.waves.why}</b> — 진도는 교재 화면에서 봅니다</div>
      : <div className="two">
          <Half slot="class" title="오늘 학습 · 학원" b={b} sheet={sheet} mark={mark} rows={rows("class")} closed={closed} fail={fail} start={start} />
          {stop === "hw_off" ? <div className="half muted"><div className="hh">오늘 숙제 · 집<span className="cnt">숙제멈춤</span></div><div className="stopnote"><b>숙제 없음</b> — 수업에서만 씁니다</div></div>
          : <Half slot="home" title="오늘 숙제 · 집" b={b} sheet={sheet} mark={mark} rows={rows("home")} closed={closed} fail={fail} start={start} extra={extra} />}
        </div>}
      {stop !== "running" && extra}
    </div>
  );
}
function Half({ slot, title, b, sheet, mark, rows, closed, fail, start, extra = null }) {
  const lines = []; for (const it of rows) { let l = lines.find((x) => x.item_id === it.item_id); if (!l) { l = { item_id: it.item_id, name: it.learn_items?.name ?? it.range_note ?? "(이름 없음)", units: [], notes: [], carry: it.carry_of }; lines.push(l); } if (it.units) { l.units.push(it.units); if (it.range_note && !l.notes.includes(it.range_note)) l.notes.push(it.range_note); } }
  const cur = new Set(rows.map((it) => it.unit_id));
  const opts = mark.waves?.[slot] ?? [];
  const same = (o) => o.units.length === cur.size && o.units.every((u) => cur.has(u.unit_id));
  const memoText = slot === "class" ? mark.class_memo : mark.home_memo;
  return (
    <div className="half">
      <div className="hh">{title}<span className="cnt">{rows.length}개</span></div>
      {opts.length > 0 && <div className="wv"><span className="fl" style={{ margin: 0 }}>회차</span>
        <div className="seg sm" data-g={`wave-${slot}`}>{opts.map((o) => <button key={o.key} type="button" aria-pressed={same(o)} disabled={closed} onClick={() => start(async () => { fail(await pickWave(sheet.id, b.book_id, slot, o.units.map((u) => u.unit_id))); })}>{o.name}</button>)}</div></div>}
      {lines.map((l, i) => <div className="li" key={l.item_id ?? i}><span className="n">{i + 1}</span><div><b>{l.name}</b>
        <small>{l.units.length ? <><b>{l.units[0].chapter}</b> › {l.units.map((u) => u.short).join(" · ")}{pages(l.units[0]) ? ` · ${l.units.map(pages).filter(Boolean).join(" · ")}` : ""}{l.units[0].q_count ? ` · ${l.units.reduce((n, u) => n + (u.q_count || 0), 0)}문항` : ""}{l.notes.length ? ` · 이번에 ${l.notes.join(" · ")}` : ""}</> : l.carry ? "지난 숙제의 나머지" : null}</small></div></div>)}
      <form className="memoline" action={async (f) => { fail(await saveMemo(f)); }}>
        <span className="mi">✎</span><input type="hidden" name="sheetId" value={sheet.id} /><input type="hidden" name="bookId" value={b.book_id} /><input type="hidden" name="slot" value={slot} />
        <input type="text" name="text" defaultValue={memoText ?? ""} placeholder={slot === "class" ? "이 교재 오늘 학습 메모 — 아이 화면에 그대로" : "이 교재 숙제 메모 — 아이 화면에 그대로"} disabled={closed} onBlur={(e) => { if ((e.target.value ?? "") !== (memoText ?? "")) e.target.form.requestSubmit(); }} />
      </form>
      {extra}
    </div>
  );
}
const kindOf = (k) => KIND.find(([x]) => x === k) ?? ["", k, "?"];
const numOr = (v) => (v === null || v === undefined ? "" : String(v));
/** 🔤 시험 · 시작하자마자 — 지난 시간에 낸 범위 그대로. 틀린 개수(·전체)만 적으면 맞은 개수·%·통과는 세어 나온다(SQL). 미통과면 재시험 줄 + 늦귀가 사유가 저절로 */
function QuizCard({ sheet, quizzes, closed, fail, start }) {
  const failed = quizzes.filter((q) => q.passed === false && !q.retry_of);
  const retryOf = (q) => quizzes.find((r) => r.retry_of === q.id);
  const taken = quizzes.filter((q) => q.passed !== null && q.passed !== undefined && !q.retry_of);
  const save = (q, form) => start(async () => { fail(await quizTake(sheet.id, q.id, form.wrong.value, form.total.value)); });
  return (
    <div className="card" data-card="quiz">
      <div className="ctitle"><span className="cemo">🔤</span>시험 · 시작하자마자<span className="auto">지난 시간에 낸 범위 그대로</span></div>
      {quizzes.map((q) => { const [, kname, icon] = kindOf(q.kind); const res = q.passed === true ? "ok" : q.passed === false ? "warn" : ""; return (
        <form key={q.id} className={"lf" + (res ? " " + res : "")} style={{ marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); save(q, e.currentTarget); }}>
          <span className="ln">{icon}</span>
          <div><b>{q.retry_of ? "재시험 · " : ""}{kname} — {scopeText(q)}</b>
            <small>{q.quiz_style?.round && <span className="tag type">{q.quiz_style.round}회독</span>} {q.quiz_style?.text ?? ""}{q.harder ? " · 더 어렵게" : ""} · 통과 {q.cut_pct}%{q.state === "skipped" ? " · 오늘 건너뜀" : ""}</small></div>
          <span className="qlab">틀린 개수</span><input className="scr" name="wrong" type="text" inputMode="numeric" defaultValue={numOr(q.wrong)} placeholder="—" disabled={closed || q.state === "skipped"} onBlur={(e) => { if (e.target.value !== numOr(q.wrong)) e.target.form.requestSubmit(); }} />
          <span className="qlab">전체</span><input className="scr" name="total" type="text" inputMode="numeric" defaultValue={numOr(q.total)} placeholder="—" disabled={closed || q.state === "skipped"} onBlur={(e) => { if (e.target.value !== numOr(q.total)) e.target.form.requestSubmit(); }} />
          <span className="lm" style={q.passed === true ? { color: "var(--ok)" } : q.passed === false ? { color: "var(--miss)" } : undefined}>{q.passed === null || q.passed === undefined ? "아직 안 적음" : `${q.total - q.wrong}/${q.total} · ${q.pct}% · ${q.passed ? "통과" : "못 넘음"}`}</span>
        </form>); })}
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
        {failed.length ? <span className="pill warn">⚠️ 미통과 {failed.length} — 재시험지 + 늦귀가 사유 자동</span> : taken.length ? <span className="pill ok">✅ 통과 · 재시험 없음</span> : null}
        {failed.map((q) => { const r = retryOf(q); return (<span key={q.id} className="wv" style={{ margin: 0 }}>
          <button type="button" className="btn sm" disabled={closed || Boolean(r)} onClick={() => start(async () => { fail(await quizRetest(sheet.id, q.id)); })}>{r ? "📄 재시험 대상 ✓" : "📄 재시험지 만들기"}</button>
          <button type="button" className="btn sm" aria-pressed={r?.state === "skipped"} disabled={closed || !r} onClick={() => start(async () => { fail(await quizSkip(sheet.id, q.id, r?.state !== "skipped")); })}>⏭ 오늘은 재시험 건너뜀</button>
        </span>); })}
        <span className="spacer" />
        <span className="note" style={{ margin: 0 }}>틀린 개수만 셉니다 — 맞은 개수·%·통과는 <b>세어 나옵니다.</b> 건너뛰면 <b>오늘만</b> 빠집니다(늦귀가 사유·리포트에서도) — 점수는 그대로</span>
      </div>
    </div>
  );
}
/** 📝 다음 시간 시험 — 숙제와 같이 나간다. 범위는 교재(오늘 학습 소단원)거나 직접 · 전체 개수를 적어야 리포트에 나간다(원장님 9/2) · 방식·통과선은 학생×교재×회독 한 곳(style_for) */
function NextQuiz({ sheet, books, quizzes, closed, fail, start }) {
  const unitOf = (bookId) => sheet.class.find((it) => it.units?.book_id === bookId)?.unit_id ?? sheet.home.find((it) => it.units?.book_id === bookId)?.unit_id ?? null;
  const patch = (q, p) => start(async () => { fail(await quizSet(sheet.id, q.id, p)); });
  return (
    <div data-card="next-quiz">
      <div className="ctitle" style={{ marginTop: 12, fontSize: "var(--fs-3)" }}><span className="cemo">📝</span>다음 시간 시험 — 숙제와 같이 나갑니다</div>
      {quizzes.map((q) => { const [, kname, icon] = kindOf(q.kind); return (
        <div key={q.id}>
          <div className="lf" style={{ marginTop: 4 }}><span className="ln">{icon}</span>
            <div><b>{kname}</b><small>{scopeText(q)}</small></div>
            <div className="seg sm" data-g="source">{SOURCE.map(([k, name]) => <button key={k} type="button" aria-pressed={q.source === k} disabled={closed || k === "prep" || (k === "book" && !q.book_id)} title={k === "prep" ? "내신 범위는 시험 화면을 지을 때" : undefined} onClick={() => k !== q.source && patch(q, { source: k, freeNote: q.free_note ?? "" })}>{name}</button>)}</div>
            <span className="qlab">전체 개수</span><input className="scr" type="text" inputMode="numeric" defaultValue={numOr(q.total)} placeholder="—" disabled={closed} onBlur={(e) => { if (e.target.value !== numOr(q.total)) patch(q, { total: e.target.value }); }} />
            <span className="qlab">통과선</span><input className="scr" type="text" inputMode="numeric" defaultValue={numOr(q.cut_pct)} style={{ maxWidth: 52 }} disabled={closed} onBlur={(e) => { if (e.target.value !== numOr(q.cut_pct)) patch(q, { cutPct: e.target.value }); }} /><b className="qof">%</b></div>
          {q.source === "manual" && <div className="lf" style={{ marginTop: 4 }}><span className="ln">✎</span><input type="text" defaultValue={q.free_note ?? ""} placeholder="범위를 직접 — 예: 2409 학평 22-24번" disabled={closed} style={{ flex: 1, minWidth: 0 }} onBlur={(e) => { if (e.target.value !== (q.free_note ?? "")) patch(q, { freeNote: e.target.value }); }} /></div>}
          {q.total == null && <div className="lf warn" style={{ marginTop: 4 }}><span className="ln">!</span><div><b>{kname} 시험은 리포트에 안 나갑니다</b><small>전체 개수를 아직 안 적으셨습니다 — 적으면 바로 붙습니다</small></div></div>}
          <div className="lf" style={{ marginTop: 4, background: "var(--sunk)" }}><span className="ln">⚙️</span><div><b>방식 — {q.quiz_style?.round ?? 1}회독 기본값을 따릅니다</b><small>{q.quiz_style?.text ?? "방식 줄 없음"} — 이 아이만 다르게도 됩니다(방식 고치기는 다음에)</small></div></div>
        </div>); })}
      {!closed && <form className="wv" style={{ marginTop: 8 }} action={async (f) => { fail(await quizAdd(f)); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <select name="kind" className="sel" aria-label="시험 갈래">{KIND.map(([k, name]) => <option key={k} value={k}>{name}</option>)}</select>
        <select name="bookId" className="sel" aria-label="범위 교재" onChange={(e) => { const f = e.target.form; f.unitId.value = unitOf(e.target.value) ?? ""; f.round.value = books.find((b) => b.book_id === e.target.value)?.round ?? 1; }}>
          {books.map((b) => <option key={b.id} value={b.book_id}>{b.books.name}</option>)}<option value="">직접 적기</option></select>
        <input type="hidden" name="unitId" defaultValue={books[0] ? unitOf(books[0].book_id) ?? "" : ""} /><input type="hidden" name="round" defaultValue={books[0]?.round ?? 1} />
        <input type="text" name="freeNote" placeholder="직접 적을 때 범위" style={{ flex: "1 1 120px", minWidth: 0 }} />
        <button className="btn sm" type="submit">+ 시험 더하기</button>
      </form>}
    </div>
  );
}
function LateCard({ sheet, warn, studentId, closed, fail, start }) {
  const ask = warn && (warn.due || warn.today_disposal);
  const l = sheet.late;
  const [until, setUntil] = useState(l?.until_at ? String(l.until_at).slice(0, 5) : "");
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">3b</span> 늦귀가 — 남아서 하고 갑니다{l?.until_at && <span className="auto">예상 귀가 {String(l.until_at).slice(0, 5)}</span>}</div>
      {ask && <div className="lf warn" style={{ margin: "8px 0 0" }} data-reflect="1"><span className="ln">⚠️</span>
        <div><b>경고 {warn.count}회째 — 반성문{warn.pending && !warn.today_disposal ? " (유예했던 것을 다시 묻습니다)" : ""}</b>
          <small>{warn.days} — 앱은 세기만 하고 <span style={{ fontWeight: 700 }}>정하는 것은 원장님</span> · 경고는 저장하지 않고 리포트에서 매달 셉니다 · 지난 반성문 뒤 {warn.since_written}회째</small></div></div>}
      {warn?.count > 0 && <div className="lenrow" style={{ marginTop: 8 }} data-limit="1"><span className="fl" style={{ margin: 0, width: "auto" }}>반성문 기준</span>
        <div className="stepper" data-g="limit"><button type="button" data-s="-" disabled={closed || warn.report_at <= 1} onClick={() => start(async () => { fail(await warnLimit(studentId, warn.report_at - 1)); })}>−</button><input type="text" inputMode="numeric" aria-label="반성문 기준 횟수" value={warn.report_at} readOnly /><button type="button" data-s="+" disabled={closed} onClick={() => start(async () => { fail(await warnLimit(studentId, warn.report_at + 1)); })}>+</button></div>
        <span className="note" style={{ margin: 0 }}>{warn.own_limit ? "이 아이만 · " : "학원 기본 · "}쓴 뒤로 다시 {warn.report_at}회째에 묻습니다(지금 {warn.since_written}회째)</span></div>}
      {ask && <div className="lenrow" style={{ marginTop: 8 }}><span className="fl" style={{ margin: 0, width: "auto" }}>처분</span>
        <div className="seg sm" data-g="refl">{DISPOSAL.map(([k, name]) => <button key={k} type="button" aria-pressed={warn.today_disposal === k} disabled={closed} onClick={() => start(async () => { fail(await reflectAs(sheet.id, k)); })}>{name}</button>)}</div>
        <span className="note" style={{ margin: 0 }}>남아서 쓰면 늦귀가 사유에 서고, 숙제면 다음 시간 검사 줄에 섭니다. 유예는 지운 것이 아니라 미룬 것 — 다음 경고에 다시 묻습니다</span></div>}
      <form className="lategrid" action={async (f) => { fail(await late(f)); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <div><label className="fl">사유</label><input type="text" name="reason" defaultValue={l?.reason ?? ""} placeholder="예: 워크북 나머지 10-18번" disabled={closed} /></div>
        <div><label className="fl">예상 귀가 시각</label><input type="text" name="untilAt" value={until} onChange={(e) => setUntil(e.target.value)} placeholder="예: 18:40" inputMode="numeric" disabled={closed} />
          <div className="seg sm" style={{ marginTop: 4 }}>{PLUS.map(([m, name]) => <button key={m} type="button" disabled={closed} onClick={() => setUntil(plus(m))}>{name}</button>)}</div></div>
        <div className="wv" style={{ marginBottom: 0 }}>
          <button className="btn sm" type="submit" disabled={closed}>적어 두기</button>
          <button className="btn sm pri" type="button" disabled={closed || !l?.until_at} onClick={() => start(async () => { fail(await lateSend(sheet.id)); })}>📨 학부모에게 지금 보내기</button>
          {l?.sent_at ? <span className="pill">보냄</span> : l?.until_at ? <span className="pill warn">보내야 함</span> : null}
        </div>
      </form>
    </div>
  );
}
/** 🗺 진도 · 영역별 메모(목업 01) — 오늘 한 단원(검사 결과대로 ○◐✕ · 오늘 학습 ◐) · 영역 넷 한 마디(칸을 떠나면 저장 · 아이에게 그대로 나가고 브리핑 재료). 표 v2.day_area_memo(0079) */
function AreaMemoCard({ sheet, books, closed, fail, start }) {
  const units = todayUnits(sheet, books);
  const init = Object.fromEntries(MEMO_AREAS.map((a) => [a, sheet.memos?.find((m) => m.area === a)?.memo ?? ""]));
  const [vals, setVals] = useState(init);
  const last = useRef(init);
  const save = (a) => { if ((vals[a] ?? "") === (last.current[a] ?? "")) return; last.current = { ...last.current, [a]: vals[a] }; start(async () => { fail(await areaMemo(sheet.id, a, vals[a])); }); };
  return (
    <div className="card" data-card="areamemo">
      <div className="ctitle"><span className="cemo">🗺</span>진도 · 영역별 메모</div>
      <label className="fl">오늘 한 단원</label>
      <div className="tags" style={{ marginBottom: 12 }} data-g="today-units">{units.length ? units.map((u) => <span key={u.id} className={"tag" + (u.on ? " on" : "")}>{u.label} {u.mark}</span>) : <span className="note" style={{ margin: 0 }}>아직 없습니다 — 검사하면 여기 섭니다</span>}</div>
      <div className="areas">{MEMO_AREAS.map((a) => <div key={a}><label className="fl">{a}</label><input type="text" name={`memo-${a}`} value={vals[a]} disabled={closed} placeholder="(오늘 안 함)" onChange={(e) => setVals({ ...vals, [a]: e.target.value })} onBlur={() => save(a)} /></div>)}</div>
      <p className="note" style={{ margin: 0 }}>이 메모는 <b>아이에게 그대로 나가고</b>, 부모님께 글의 ✨ 브리핑 재료가 됩니다</p>
    </div>
  );
}
/** 📝 단원평가(목업 01) — 이 아이에게 출제한 것이 있을 때만 선다(없으면 안 엶). 교재와 무관, 원장님이 따로 출제. 맞은 개수만 적는다 → 통과선(규칙 unit_test.pass_pct)으로 통과/미달 */
function UnitTestCard({ t, passPct, date, closed, fail, start }) {
  const [n, setN] = useState(t.correct ?? "");
  const res = unitResult(n, t.q_count, passPct);
  const put = (v) => { const x = Math.max(0, Math.min(Number(t.q_count ?? 0), Number(v) || 0)); setN(x); start(async () => { fail(await unitScore(t.id, x, date)); }); };
  const state = { todo: "낼 것", made: "출제함", taken: "봤음", scored: "채점함" }[t.state] ?? t.state;
  return (
    <div className="card" data-card="unit-test">
      <div className="ctitle"><span className="cemo">📝</span>단원평가 · {t.grammar_topics?.name ?? "—"}<span className="auto">{state}</span></div>
      <div className="wtrow">
        <div className="wtset"><b>원장님이 출제한 {t.q_count}문항</b><div className="tags"><span className="tag type">교재 문제가 아닙니다</span>{t.assigned_on && <span className="tag">낸 날 {String(t.assigned_on).slice(5).replace("-", "/")}</span>}<span className="tag">통과선 {passPct}%</span></div></div>
        <div className="wtscore"><label className="fl">맞은 개수</label>
          <div className="stepper" data-g="unit"><button type="button" data-s="-" disabled={closed} onClick={() => put((Number(n) || 0) - 1)}>−</button><input type="text" inputMode="numeric" value={n} aria-label="직접 입력" disabled={closed} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} onBlur={() => { if (n !== "") put(n); }} /><button type="button" data-s="+" disabled={closed} onClick={() => put((Number(n) || 0) + 1)}>+</button></div>
          {res && <div className={"wtres " + (res.pass ? "pass" : "fail")} data-g="unit-res"><b>{n} / {t.q_count}</b><span>{res.pct}% {res.pass ? "통과" : "미달"}</span></div>}
        </div>
      </div>
    </div>
  );
}
/** ✉️ 부모님께 나갈 글(목업 01 · 03 폰) — 키워드 → 상황(갈래 다섯, 그날 상태에서 저절로) → 길이(상황이 먼저 고른다) → ✨ 브리핑(AI 초안 · 넘으면 문장 끝에서 자름 · 원장님 글은 덮지 않는다) → 글.
 *  글 밑에 저절로 붙는 줄과 👁 학부모 화면 미리보기(09·10 과 같은 판단). AI 초안을 안 고치고 마감하면 「그대로 보낼까요?」를 한 번 묻는다 — 막지 않는다(목업 9/5 ⑥) */
function CommentCard({ sheet, student, closed, fail, start, cfg }) {
  const lines = attached({ next: student.quizzes?.next ?? [], late: sheet.late, warn: student.warn });
  const autoKind = pickKind({ hour: cfg?.hour, lateFrom: cfg?.lateFrom, checks: sheet.check });
  const [kind, setKind] = useState(sheet.comment_kind ?? autoKind);
  const [cap, setCap] = useState(sheet.comment_cap ?? capOf(sheet.comment_kind ?? autoKind, cfg?.caps));
  const [keys, setKeys] = useState(sheet.comment_keys ?? "");
  const [text, setText] = useState(sheet.comment ?? "");
  const [draft, setDraft] = useState(sheet.comment_ai ?? "");
  const [offer, setOffer] = useState("");   // 초안이 나왔지만 지금 글이 있어 안 덮은 것
  const [ask, setAsk] = useState(false);     // 「그대로 보낼까요?」
  const [show, setShow] = useState(false);   // 👁 미리보기
  const [made, setMade] = useState(null);    // 방금 만든 초안의 사정(다시 시킴 · 잘림)
  const n = countChars(text), over = n > cap;
  const payload = () => ({ comment: text, kind, cap, keys });
  const pick = (k) => { setKind(k); setCap(capOf(k, cfg?.caps)); };
  const brief = () => start(async () => {
    const r = await commentDraft(sheet.id, { kind, cap, keys });
    if (fail(r)) { setDraft(r.draft.text); setMade(r.draft); if (r.draft.replaced) { setText(r.draft.text); setOffer(""); } else setOffer(r.draft.text); }   // fail() 은 ok 를 돌려준다(이름과 반대) — 실패면 그 자리에 말하고 끝
  });
  const save = () => start(async () => { fail(await comment(sheet.id, payload())); });
  const finish = (force) => { if (!force && sameAsDraft(text, draft)) { setAsk(true); return; } setAsk(false); start(async () => { fail(await close(sheet.id, payload())); }); };
  return (
    <div className="card" data-card="comment">
      <div className="ctitle"><span className="cemo">✉️</span>부모님께 나갈 글{closed && <span className="auto">마감됨</span>}</div>
      {lines.length > 0 && <div className="lf ok" style={{ marginBottom: 8 }} data-g="attached"><span className="ln">📝</span>
        <div><b>글 밑에 저절로 붙습니다</b><small>{lines.map((l, i) => <span key={l.key} style={l.on ? undefined : { color: "var(--mute)" }}>{i ? " | " : ""}{l.text}</span>)}</small></div><span className="lm">따로 안 씀</span></div>}
      {closed && <div className="tags" style={{ marginBottom: 8 }}><span className="tag">{capName(cap)}</span><span className="tag type">{kindName(kind)}</span>{draft && sameAsDraft(text, draft) && <span className="tag">AI 초안 그대로</span>}</div>}
      {!closed && <>
        <label className="fl">키워드만 적으세요</label>
        <input type="text" name="keys" value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="예: 간접의문문, 어순 스스로 설명, 워크북 오답 3개 다음시간" style={{ width: "100%" }} />
        <div className="lenrow"><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>상황</span>
          <div className="seg sm" data-g="kind">{CKIND.map(([k, name]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)}>{name}</button>)}</div>
          {kind === autoKind && <span className="note" style={{ margin: 0 }}>오늘 상태에서 저절로</span>}</div>
        <div className="lenrow"><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>길이</span>
          <div className="seg sm" data-g="cap">{CAPS.map((c) => <button key={c} type="button" aria-pressed={cap === c} onClick={() => setCap(c)}>{capName(c)}</button>)}</div>
          <button type="button" className="btn sm" data-act="brief" onClick={brief}>✨ 브리핑 만들기</button>
          <span className={"cap" + (over ? " over" : "")} data-g="count">{n} / {capName(cap)}</span></div>
      </>}
      <textarea name="comment" value={text} onChange={(e) => { setText(e.target.value); setAsk(false); }} rows={3} placeholder="오늘 한 것 · 잘한 것 · 다음 시간에 할 것" disabled={closed} style={{ width: "100%", marginTop: 8 }} />
      {made && !closed && <p className="note" style={{ margin: "4px 0 0" }}>✨ 초안 {made.chars}자{made.retried ? ` · ${made.retried}번 다시 시킴` : ""}{made.cut ? " · 넘어서 문장 끝에서 잘랐습니다" : ""}</p>}
      {offer && <div className="lf" data-g="offer"><span className="ln">✨</span><div><b>초안이 나왔습니다 — 지금 글이 있어 덮지 않았습니다</b><small style={{ whiteSpace: "pre-wrap" }}>{offer}</small></div><button type="button" className="btn sm" onClick={() => { setText(offer); setOffer(""); }}>이 초안으로 바꾸기</button></div>}
      {show && <div className="lf" data-g="preview"><span className="ln">👁</span><div><b>학부모 화면에 이렇게 보입니다</b><small style={{ whiteSpace: "pre-wrap" }}>{preview(text, lines) || "(아직 글이 없습니다)"}</small></div></div>}
      {ask && <div className="lf warn" data-g="same"><span className="ln">?</span><div><b>AI 초안을 안 고치셨습니다 — 그대로 보낼까요?</b></div><button type="button" className="btn sm pri" onClick={() => finish(true)}>그대로 마감</button><button type="button" className="btn sm" onClick={() => setAsk(false)}>고치기</button></div>}
      {!closed && <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
        <button className="btn sm" type="button" onClick={save}>임시 저장</button>
        <button className="btn sm pri" type="button" data-act="close" onClick={() => finish(false)}>저장하고 마감</button>
        <button className="btn sm gho" type="button" data-act="preview" aria-pressed={show} onClick={() => setShow((v) => !v)}>👁 미리보기</button>
        <span className="note" style={{ margin: 0 }}>마감하면 학부모 화면에 보입니다 — 되돌리기는 원장님께</span>
      </div>}
      {!closed && <p className="note" style={{ margin: "6px 0 0" }}>AI 초안을 안 고치고 마감하면 「그대로 보낼까요?」를 한 번 묻습니다 — 막지는 않습니다</p>}
    </div>
  );
}
/** 02 조절 — 교재마다 갯수 · 뺄 칩 · 긴 줄의 「이번에」 · 도는 차례(읽기만) · 메모 둘. 기본값대로 나가는 날은 안 연다(클릭 0). 화면엔 개수가 아니라 문항·쪽 합계(확정-㉓) */
function TuneModal({ b, sheet, closed, fail, start, onClose }) {
  const [pool, setPool] = useState(null);
  const [n, setN] = useState(1);
  const [excluded, setExcluded] = useState([]);
  const [ranges, setRanges] = useState({});
  const [memo, setMemo] = useState({ class: "", home: "" });
  useEffect(() => { let alive = true; (async () => { const r = await tuneOpen(sheet.id, b.book_id); if (!alive) return; if (!fail(r)) { onClose(); return; }
    // 지금 나가는 소단원 그대로 열린다 — 차례에서 건너뛴 것은 「뺀 칩」으로, 갯수는 지금 나가는 수로
    const cur = new Set(r.pool.current.class.length ? r.pool.current.class : r.pool.current.home), ids = r.pool.pool.map((u) => u.unit_id), last = ids.reduce((m, id, i) => (cur.has(id) ? i : m), -1);
    setPool(r.pool); setExcluded(ids.slice(0, last + 1).filter((id) => !cur.has(id))); setN(Math.max(1, ids.filter((id) => cur.has(id)).length || 1)); setRanges(r.pool.ranges ?? {}); setMemo(r.pool.memos); })(); return () => { alive = false; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!pool) return <div className="mdlov" role="dialog" aria-modal="true"><div className="mdl" style={{ width: "min(520px,100%)" }}><div className="mdlb"><p className="note">읽는 중…</p></div></div></div>;
  const selected = tuneUnits(pool.pool, n, excluded), sel = new Set(selected.map((u) => u.unit_id));
  const sum = loadOf(selected), first = pool.pool[0];
  const toggle = (u) => { if (sel.has(u.unit_id)) setExcluded([...excluded, u.unit_id]); else if (excluded.includes(u.unit_id)) setExcluded(excluded.filter((x) => x !== u.unit_id)); else setN(pool.pool.filter((x) => !excluded.includes(x.unit_id)).findIndex((x) => x.unit_id === u.unit_id) + 1); };
  const apply = () => start(async () => { const r = await tuneApply(sheet.id, b.book_id, { unitIds: selected.map((u) => u.unit_id), ranges: Object.fromEntries(selected.filter((u) => ranges[u.unit_id]).map((u) => [u.unit_id, ranges[u.unit_id]])), classMemo: memo.class, homeMemo: memo.home }); if (fail(r)) onClose(); });
  const basis = pool.orderBasis === "chapter" ? "대단원 기준" : "소단원 기준";
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="조절" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(520px,100%)" }}>
        <div className="mdlh"><b>{b.books.name} · {pool.chapter ?? "안 한 대단원 없음"}</b><span className="tag type">{pool.round}회독</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">
          <div className="hw">
            <div className="hwname"><b>소단원 갯수</b><small>안 한 소단원 {pool.pool.length}개 중에서 — 칩을 눌러 뺍니다</small>
              <div className="units unitcol">{pool.pool.map((u) => <button key={u.unit_id} type="button" className="unit" aria-pressed={sel.has(u.unit_id)} disabled={closed} onClick={() => toggle(u)}>{u.short}<i>{pages(u) ?? ""}{u.q_count ? ` · ${u.q_count}문항` : ""}</i></button>)}</div>
            </div>
            <div className="stepper"><button type="button" data-s="-" disabled={closed} onClick={() => setN(Math.max(1, n - 1))}>−</button><input type="text" inputMode="numeric" value={n} aria-label="직접 입력" disabled={closed} onChange={(e) => setN(Math.max(1, Math.min(pool.pool.length, Number(e.target.value) || 1)))} /><button type="button" data-s="+" disabled={closed} onClick={() => setN(Math.min(pool.pool.length, n + 1))}>+</button></div>
          </div>
          <div className="lf warn" style={{ margin: "2px 0 8px" }}><span className="ln">📐</span>
            <div><b>{selected.length}개면 오늘 <span style={{ color: "var(--navy)" }}>{sum.questions}문항 · {sum.pages}쪽</span></b>
              <small>{selected.map((u) => `${u.short} ${u.q_count ?? 0}문항`).join(" · ") || "고른 소단원 없음"} — 교재 {pool.books}권 합치면 <b>{pool.load.questions}문항 · {pool.load.pages}쪽</b>(지금 깔린 것)</small></div>
            {first && <span className="lm">1개면 {first.q_count ?? 0}문항</span>}</div>
          <div className="lf ok" style={{ margin: "2px 0 8px" }}><span className="ln">🔀</span>
            <div><b>도는 차례 — 지금 <span style={{ color: "var(--ok)" }}>{basis}</span></b>
              <small>{pool.orderBasis === "chapter" ? "본책을 다 하고 → 워크북" : "소단원마다 본책+워크북 나란히"} · 고치는 자리는 <b>11 학생 루틴 한 곳</b> — 여기서는 읽기만(11 은 다음에)</small></div></div>
          {selected.filter((u) => (u.q_count ?? 0) >= pool.splitFrom).map((u) => (
            <div key={u.unit_id} style={{ margin: "4px 0 12px" }}>
              <div className="hw"><div className="hwname"><b>{u.short}</b><small>{u.q_count}문항{pages(u) ? ` · ${pages(u)}` : ""} · 한 줄짜리 — 한 번에 다 못 냅니다</small></div></div>
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
          <span className="spacer" />{pool.tuned + 1 >= pool.askAfter && <span className="pill warn">같은 조절 {pool.tuned + 1}번째 — 루틴을 고칠까요?</span>}</div>
      </div>
    </div>
  );
}
/** 02b 진도 체크 — 진도 나무는 표 하나 · 보기 넷(확정-51). 대단원 접기 · 소단원 ○◐· (되돌리기 한 자리, 확정-㊶) · 이 대단원 건너뛰기 · ✍ 메모로 자동 ○ 후보(확정-㊳). 찍으면 바로 저장 — 저장 단추가 따로 없다 */
function ProgressModal({ b, sheet, closed, fail, start, onClose }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(null);
  const load = async () => { const r = await progressOpen(sheet.id, b.book_id); if (!fail(r)) { onClose(); return; } setT(r.tree); setOpen((o) => o ?? r.tree.now ?? r.tree.chapters[0]?.chapter ?? null); };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (body) => <div className="mdlov" role="dialog" aria-modal="true" aria-label="진도 체크" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="mdl" style={{ width: "min(560px,100%)" }}>{body}</div></div>;
  if (!t) return shell(<div className="mdlb"><p className="note">읽는 중…</p></div>);
  const set = (u, st) => start(async () => { if (fail(await progressSet(sheet.id, u.id, st))) await load(); });
  const skip = (chapter) => start(async () => { if (fail(await progressSkip(sheet.id, b.book_id, chapter))) await load(); });
  const undone = t.chapters.reduce((n, c) => n + (c.total - c.done - c.skip), 0);
  return shell(<>
    <div className="mdlh"><b>진도 체크</b><span className="pill">{t.book?.name} · {t.round}회독</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
    <div className="mdlb">
      <div className="tags" style={{ marginBottom: 8 }}><span className="tag on">끝낸 대단원 {t.finished} / {t.chapters.length}</span>{t.now && <span className="tag act">지금 {t.now}</span>}<span className="tag">안 끝난 소단원 {undone}</span></div>
      {t.chapters.map((c) => { const isOpen = open === c.chapter; const fin = c.done + c.skip === c.total && c.total > 0; return (
        <div key={c.chapter} className={"acc" + (isOpen ? " open" : "")} data-chapter={c.chapter}>
          <button type="button" className="acch" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.chapter)}><span className="ar">›</span><b>{c.chapter}</b><span className="spacer" />
            {fin ? <span className="tag on">{c.done}/{c.total} 끝냄{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : c.chapter === t.now ? <span className="tag act">지금 · {c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : <span className="tag">{c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span>}</button>
          {isOpen && <div className="accb">
            {c.units.map((u) => { const auto = t.today.includes(u.id) && t.memo; return (
              <div key={u.id} className="ur" style={auto ? { background: "var(--sunk)", borderLeft: "3px solid var(--amber)", margin: "0 -8px", padding: "8px 8px", borderRadius: 8 } : undefined}>
                <span className="nm">{auto ? <b>{u.short}</b> : u.short}<small>{u.activity}{pages(u) ? ` · ${pages(u)}` : ""}{u.q_count ? ` · ${u.q_count}문항` : ""}{u.status === "skip" ? " · 건너뜀" : ""}{auto ? <> · <b style={{ color: "var(--navy)" }}>✍ 메모로 자동 ○</b></> : null}</small></span>
                <div className="tri" data-g={u.id}>{TRI.map(([k, mark]) => <button key={k} type="button" data-p={k} aria-pressed={(u.status === "skip" ? "none" : u.status) === k} disabled={closed} onClick={() => u.status !== k && set(u, k)}>{mark}</button>)}</div>
              </div>); })}
            <div style={{ marginTop: 12 }}><label className="fl">교재 없이 한 날 — 무엇을 했나(01 의 학습 메모와 같은 값)</label><input type="text" value={t.memo} readOnly placeholder="01 의 이 교재 학습 메모에 적으면 마감 때 오늘 학습 소단원이 ○ 가 됩니다" /></div>
            {!fin && !closed && <div className="wv" style={{ marginTop: 8 }}><button type="button" className="btn sm" onClick={() => skip(c.chapter)}>이 대단원 건너뛰기</button><span className="note" style={{ margin: 0 }}>안 한 채로 넘어간 것으로 남습니다 — 지운 것이 아닙니다(월간 리포트에서 구별)</span></div>}
          </div>}
        </div>); })}
    </div>
    <div className="mdlf"><button type="button" className="btn gho" onClick={onClose}>닫기</button><span className="spacer" /><span className="note" style={{ margin: 0 }}>찍으면 바로 저장됩니다 · 메모로 대신한 날은 마감이 ○ 로 올립니다(그 교재만)</span></div>
  </>);
}
/** 02c 결석·지각 예정 — 수업일만 고를 수 있는 좁은 달력 · 고른 날의 결석(사유 · 보강 날짜·시각 직접 · 안 잡음) / 지각(얼마나 · 사유) · 📨 학부모께 알림. 보강 시각은 앱이 제안하지 않는다(확정-㉔) */
function PlanModal({ student, date, fail, start, onClose }) {
  const [ym, setYm] = useState(date.slice(0, 7));
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ kind: "none", reason: "", makeupOn: "", makeupAt: "", waived: false, minutes: "" });
  const [mk, setMk] = useState(false);
  const load = async (m) => { const r = await planView(student.id, m); if (fail(r)) setData(r.plan); };
  useEffect(() => { load(ym); }, [ym]);   // eslint-disable-line react-hooks/exhaustive-deps
  const grid = monthGrid(ym);
  const mark = (d) => markOf(d, data ?? {});
  const pick = (d) => { const m = mark(d); if (!m.pick && m.kind !== "absent" && m.kind !== "late") return; setSel(d); setMk(false);
    if (m.kind === "absent") setForm({ kind: "absent", reason: m.plan.reason ?? "", makeupOn: m.plan.on_date ?? "", makeupAt: String(m.plan.at_time ?? "").slice(0, 5), waived: m.plan.state === "waived", minutes: "" });
    else if (m.kind === "late") setForm({ kind: "late", reason: m.plan.reason ?? "", makeupOn: "", makeupAt: "", waived: false, minutes: m.plan.minutes ?? "" });
    else setForm({ kind: "absent", reason: "", makeupOn: "", makeupAt: "", waived: false, minutes: "" }); };
  const save = () => start(async () => { const r = await planPut(student.id, sel, form); if (fail(r)) { await load(ym); } });
  const send = () => start(async () => { const r = await planSend(student.id, sel); if (fail(r)) await load(ym); });
  const K = (d) => ({ class: "·", absent: "✕", late: "⏰", makeup: "↻", off: "🚫" })[mark(d).kind];
  const I = (d) => ({ class: "i-cls", absent: "i-abs", late: "i-late", makeup: "i-mk", off: "i-off" })[mark(d).kind];
  const label = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${weekdayName(d)}`;
  const cur = sel ? mark(sel) : null;
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="결석·지각 예정" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(540px,100%)" }}>
        <div className="mdlh"><b>📅 {student.name} · 결석·지각 예정</b>{data?.label && <span className="pill">{data.label}</span>}<span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">
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
              {mk && <div className="mkcal open"><div className="calhead"><b>{ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월</b><span className="spacer" /><span className="pill">아무 날이나 고를 수 있습니다 — 앱은 제안하지 않습니다</span></div>
                <div className="cal" data-g="mkcal">{["월", "화", "수", "목", "금", "토", "일"].map((w) => <div key={w} className="cdow">{w}</div>)}
                  {grid.map((g) => <div key={g.date} className={"cd" + (g.out ? " out" : "") + (form.makeupOn === g.date ? " pickd" : "")} role={g.out ? undefined : "button"} onClick={() => !g.out && setForm({ ...form, makeupOn: g.date })}>{g.out ? g.day : <><span className="dn">{g.day}</span>{K(g.date) && <i className={"cm " + I(g.date)}>{K(g.date)}</i>}</>}</div>)}</div>
                <div className="wv" style={{ margin: "8px 0 0" }}><span className="fl" style={{ margin: 0 }}>시각</span><input type="text" value={form.makeupAt} placeholder="14:00" style={{ maxWidth: 90 }} onChange={(e) => setForm({ ...form, makeupAt: e.target.value })} />
                  <div className="seg sm">{["10:00", "11:00", "14:00", "16:00"].map((t) => <button key={t} type="button" aria-pressed={form.makeupAt === t} onClick={() => setForm({ ...form, makeupAt: t })}>{t}</button>)}</div>
                  <span className="note" style={{ margin: 0 }}>칸이 차 있어도 넣을 수 있습니다</span></div></div>}
            </>}
            {form.kind === "late" && <>
              <div className="wv"><span className="fl" style={{ margin: 0 }}>얼마나</span>
                <div className="seg sm" data-g="latemin">{LATE_PRESET.map(([m, name]) => <button key={m} type="button" aria-pressed={Number(form.minutes) === m} onClick={() => setForm({ ...form, minutes: m })}>{name}</button>)}</div>
                <input type="text" inputMode="numeric" value={form.minutes} placeholder="분" style={{ maxWidth: 90 }} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></div>
              <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>사유</span><input type="text" value={form.reason} placeholder="예: 학교 보충수업" style={{ flex: "1 1 150px" }} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </>}
            {form.kind === "none" && <p className="note" style={{ margin: "8px 0 0" }}>저장하면 이날 예정을 물립니다 — 지우는 것이 아니라 「온다」로 되돌리는 것입니다.</p>}
            {cur?.plan?.notified_at && <p className="note" style={{ margin: "8px 0 0" }}>📨 학부모께 알림 보냄 {String(cur.plan.notified_at).slice(0, 16).replace("T", " ")}</p>}
          </div>}
          <div className="clegend"><span><i className="cm i-cls">·</i>수업일</span><span><i className="cm i-abs">✕</i>결석 예정</span><span><i className="cm i-late">⏰</i>지각 예정</span><span><i className="cm i-mk">↻</i>보강</span><span><i className="cm i-off">🚫</i>휴강</span></div>
        </div>
        <div className="mdlf"><button type="button" className="btn pri" disabled={!sel} onClick={save}>저장</button><button type="button" className="btn" disabled={!sel || !cur?.plan} onClick={send}>📨 학부모께 알림</button><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
