"use client";
/** 학생 줄 — 목업 01 의 .row 그대로. 자주 누르는 것(출결 · ○△✕)은 낙관적: 화면 먼저, 저장은 뒤에서, 실패하면 되돌리고 그 자리에서 말한다(속도-5).
 *  마감·발송처럼 되돌릴 수 없는 것은 서버 답을 기다린다. 마감된 판은 읽기만 한다 */
import { useState, useTransition } from "react";
import { setAttend, check, rest, add, move, late, lateSend, comment, close, openSheet, mode as setMode, stop as setStop, wave as pickWave, memo as saveMemo, quizAdd, quizSet, quizTake, quizRetest, quizSkip } from "./actions.js";
import { KIND, SOURCE, scopeText } from "@/lib/quiz-plan";
import { isUnchecked, CHECK } from "@/lib/status";
import { STOP, MODE, stopOn } from "@/lib/routine-plan";
const ATTEND = [["present", "왔음"], ["late", "지각"], ["absent", "결석"], ["early", "조퇴"], ["online", "온라인"]];
const UPTO = ["시작만", "절반", "거의 다"];
const REST = [["class", "오늘 학습으로"], ["home", "다음 숙제로"], ["stay", "남아서"]];
const PLUS = [[20, "+20분"], [40, "+40분"], [60, "+1시간"]];
const plus = (min) => { const t = new Date(Date.now() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
const attendName = (v) => ATTEND.find(([k]) => k === v)?.[1] ?? v;

export default function Row({ student, sheet, classId, date, minutes, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const closed = Boolean(sheet?.closed);
  const fail = (r) => { if (r && !r.ok) setErr(r.msg); return r?.ok; };
  // 출결 — 낙관적
  const [attend, setAttendLocal] = useState(sheet?.attend ?? "present");
  const pickAttend = (v) => { if (closed) return; const prev = attend; setAttendLocal(v); setErr("");
    start(async () => { let id = sheet?.id; if (!id) { const r = await openSheet(student.id, classId, date); if (!fail(r)) { setAttendLocal(prev); return; } id = r.sheetId; } const r = await setAttend(id, v); if (!fail(r)) setAttendLocal(prev); }); };
  const nCheck = sheet?.check.length ?? 0, nLeft = sheet?.check.filter(isUnchecked).length ?? 0;
  const status = closed ? "마감됨" : attend === "absent" ? "결석 · 보강 안 잡힘" : nLeft ? `검사 ${nLeft}/${nCheck} 남음` : null;
  return (
    <div className={"row" + (closed ? " closed" : "")} data-open={open ? "1" : "0"} data-student={student.id}>
      <div className="rowtop">
        <span className="who">{student.name}</span><span className="meta">{student.grade ? `${student.grade}학년` : ""}</span>
        <div className="seg sm" data-g="att" aria-label={`${student.name} 출결`}>
          {ATTEND.map(([v, name]) => <button key={v} type="button" aria-pressed={attend === v} disabled={closed} onClick={() => pickAttend(v)}>{name}</button>)}
        </div>
        <span className="spacer" />
        {sheet && <span className="pill hw">학원 {sheet.class.length} · 숙제 {sheet.home.length}</span>}
        {status && <span className={"pill" + (closed ? "" : attend === "absent" ? " bad" : " warn")}>{status}</span>}
        <button type="button" className="open" onClick={() => setOpen(!open)}>{open ? "닫기" : "펴기"}</button>
      </div>
      {open && (
        <div className="panel">
          {err && <div className="lf warn" role="alert" style={{ margin: "0 0 8px" }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
          {!sheet && <div className="card"><p className="note">아직 판이 없습니다 — 출결을 누르면 섭니다.</p></div>}
          {sheet && <>
            {(student.quizzes?.today?.length ?? 0) > 0 && <QuizCard sheet={sheet} quizzes={student.quizzes.today} closed={closed} fail={fail} start={start} />}
            <CheckCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <WorkCard sheet={sheet} books={student.books ?? []} next={student.quizzes?.next ?? []} date={date} minutes={minutes} closed={closed} fail={fail} start={start} />
            <LateCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <CommentCard sheet={sheet} closed={closed} fail={fail} />
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
  const unitless = (slot) => sheet[slot].filter((it) => !it.unit_id);
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
  const rows = (slot) => sheet[slot].filter((it) => it.units?.book_id === b.book_id);
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
      </div>
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
  const lines = []; for (const it of rows) { let l = lines.find((x) => x.item_id === it.item_id); if (!l) { l = { item_id: it.item_id, name: it.learn_items?.name ?? it.range_note ?? "(이름 없음)", units: [], carry: it.carry_of }; lines.push(l); } if (it.units) l.units.push(it.units); }
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
        <small>{l.units.length ? <><b>{l.units[0].chapter}</b> › {l.units.map((u) => u.short).join(" · ")}{pages(l.units[0]) ? ` · ${l.units.map(pages).filter(Boolean).join(" · ")}` : ""}{l.units[0].q_count ? ` · ${l.units.reduce((n, u) => n + (u.q_count || 0), 0)}문항` : ""}</> : l.carry ? "지난 숙제의 나머지" : null}</small></div></div>)}
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
function LateCard({ sheet, closed, fail, start }) {
  const l = sheet.late;
  const [until, setUntil] = useState(l?.until_at ? String(l.until_at).slice(0, 5) : "");
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">3b</span> 늦귀가 — 남아서 하고 갑니다{l?.until_at && <span className="auto">예상 귀가 {String(l.until_at).slice(0, 5)}</span>}</div>
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
function CommentCard({ sheet, closed, fail }) {
  return (
    <div className="card">
      <div className="ctitle"><span className="cemo">✉️</span>부모님께 나갈 글{closed && <span className="auto">마감됨</span>}</div>
      <form action={async (f) => { fail(await (f.get("how") === "close" ? close(f) : comment(f))); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <textarea name="comment" defaultValue={sheet.comment ?? ""} rows={3} placeholder="오늘 한 것 · 잘한 것 · 다음 시간에 할 것" disabled={closed} style={{ width: "100%" }} />
        {!closed && <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
          <button className="btn sm" type="submit" name="how" value="save">임시 저장</button>
          <button className="btn sm pri" type="submit" name="how" value="close">저장하고 마감</button>
          <span className="note" style={{ margin: 0 }}>마감하면 학부모 화면에 보입니다 — 되돌리기는 원장님께</span>
        </div>}
      </form>
    </div>
  );
}
