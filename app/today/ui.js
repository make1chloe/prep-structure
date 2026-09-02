"use client";
/**
 * 오늘 화면에서 **누르는 것**들. 여기에도 판단은 없다 — 서버 동작을 부르고 답을 그대로 보인다.
 *
 * ⚠️ **누른 그 단추만 바뀐다** (§속도 5). ○ 을 누르면 그 자리에서 바로 ○ 이 되고
 *    서버로는 뒤에서 간다. 실패하면 **그 단추만 되돌리고 알린다.**
 * ⚠️ **되돌릴 수 없는 것**(마감)은 낙관 갱신을 안 쓴다 — 서버 답을 기다린다.
 * ⚠️ `alert`/`confirm` 을 안 쓴다. 브라우저 알림창이 뜨면 자동화가 그 자리에서 멈춘다.
 * ⚠️ `position:fixed` · `history.pushState` · `createPortal` 도 안 쓴다 —
 *    덮개 판은 `<details>` 로 편다. **닫는 길이 언제나 화면 안에 있다** (대전제 10).
 */
import { useState, useTransition } from "react";
import { markCheck, setAttend, saveComment, saveLate, previewClose, closeDay } from "./actions.js";

/** ○△✕ 와 「학원에서 함」·「미검사」. 낱말은 `v2.day_item.status` 가 받는 그대로다 */
const MARKS = [
  ["done", "○", "다 해왔다"],
  ["weak", "△", "하다 말았다"],
  ["missing", "✕", "안 해왔다"],
  ["inclass", "학원", "학원에서 함 — 진도를 안 건드린다"],
  ["none", "—", "미검사로 되돌린다"],
];

/** 검사 한 줄의 ○△✕ */
export function Marks({ itemId, studentId, on, value, canWrite }) {
  const [mark, setMark] = useState(value ?? "none");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function press(v) {
    if (!canWrite) { setMsg("권한이 없어 못 씁니다 — 아래 「지금 못 하는 것」을 보세요"); return; }
    const before = mark;
    setMark(v);                       // ⚠️ 먼저 바뀐다. 기다리지 않는다
    setMsg(null);
    start(async () => {
      const r = await markCheck({ itemId, studentId, on, mark: v });
      if (!r?.ok) { setMark(before); setMsg(r?.msg ?? "저장 못 했습니다"); }   // 그 단추만 되돌린다
      else if (r.msg) setMsg(r.msg);
    });
  }

  return (
    <div className="td-marks">
      {MARKS.map(([v, glyph, why]) => (
        <button key={v} type="button" title={why} aria-pressed={mark === v}
                className={"td-mark" + (mark === v ? " is-sel" : "")}
                onClick={() => press(v)}>{glyph}</button>
      ))}
      {busy ? <span className="chip">보내는 중</span> : null}
      {msg ? <span className="pill pillbad">{msg}</span> : null}
    </div>
  );
}

/** 출결 빠른 찍기 — **판을 세우는 유일한 길**(`lib/attend.js`)을 지난다 */
export function Attend({ studentId, on, classId, attend, canWrite }) {
  const [now, setNow] = useState(attend ?? null);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function press(v) {
    if (!canWrite) { setMsg("`v2.day_sheet` 에 쓸 권한이 없어 판을 못 세웁니다"); return; }
    const before = now;
    setNow(v); setMsg(null);
    start(async () => {
      // ⚠️ 지각은 「얼마나」가 있어야 한다 (㉔). 여기서는 20분을 기본으로 보내고 아래에서 고친다
      const r = await setAttend({ studentId, on, classId, attend: v, late: v === "late" ? 20 : null });
      if (!r?.ok) { setNow(before); setMsg(r?.msg ?? "못 찍었습니다"); }
      else if (r.msg) setMsg(r.msg);
    });
  }
  return (
    <div className="row">
      {[["present", "왔음"], ["late", "지각"], ["absent", "결석"], ["off", "휴강"]].map(([v, t]) => (
        <button key={v} type="button" aria-pressed={now === v}
                className={"btn" + (now === v ? " btnmain" : " btnghost")}
                onClick={() => press(v)}>{t}</button>
      ))}
      {busy ? <span className="chip">보내는 중</span> : null}
      {msg ? <span className="pill pillbad">{msg}</span> : null}
    </div>
  );
}

/** 부모님께 나갈 글 — 마감하면 이 글이 학부모 화면에 그대로 뜬다 */
export function Comment({ sheetId, hint, value, canWrite }) {
  const [text, setText] = useState(value ?? "");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function save() {
    if (!canWrite) { setMsg("`v2.day_sheet` 에 쓸 권한이 없습니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await saveComment({ sheetId, text });
      setMsg(r?.ok ? "저장했습니다" : (r?.msg ?? "저장 못 했습니다"));
    });
  }
  return (
    <div className="col">
      <label className="lbl" htmlFor="t-comment">부모님께 나갈 글 — 마감하면 이 글이 그대로 보입니다</label>
      <textarea id="t-comment" className="fld" rows={5} value={text}
                onChange={(e) => setText(e.target.value)} placeholder={hint} />
      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy || !sheetId}>저장</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>
    </div>
  );
}

/** 늦귀가 한 줄 (⑭) — 사유 · 예상 귀가 · **실제 하원**(약속과의 차이가 남는다) */
export function Late({ sheetId, reason, untilAt, leftAt, sentAt, endTime, suggest, canWrite }) {
  const [why, setWhy] = useState(reason ?? suggest ?? "");
  const [until, setUntil] = useState(untilAt ?? "");
  const [left, setLeft] = useState(leftAt ?? "");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  /** 평소 하원 + N분. 평소 하원을 모르면 **버튼을 안 만든다** (지어내지 않는다) */
  function plus(mins) {
    if (!endTime) return;
    const [h, m] = String(endTime).split(":").map(Number);
    const t = h * 60 + m + mins;
    setUntil(`${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  function save() {
    if (!canWrite) { setMsg("`v2.late_stay` 에 쓸 권한이 없습니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await saveLate({ sheetId, reason: why, untilAt: until, leftAt: left });
      setMsg(r?.ok ? (r.msg ?? "저장했습니다") : (r?.msg ?? "저장 못 했습니다"));
    });
  }
  return (
    <div className="col">
      <label className="lbl" htmlFor="late-why">남는 까닭 — 학부모에게 이 글이 그대로 갑니다</label>
      <input id="late-why" className="fld" value={why} onChange={(e) => setWhy(e.target.value)}
             placeholder="예: 단어 82% 재시험" />
      <div className="row">
        <div className="grow">
          <label className="lbl" htmlFor="late-until">예상 귀가 — ⚠️ 약속이 됩니다</label>
          <input id="late-until" className="fld" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor="late-left">실제 하원 — 차이를 같이 남깁니다</label>
          <input id="late-left" className="fld" type="time" value={left} onChange={(e) => setLeft(e.target.value)} />
        </div>
      </div>
      {endTime
        ? <div className="row">
            <span className="muted">평소 하원 {String(endTime).slice(0, 5)} +</span>
            {[20, 40, 60].map((m) => (
              <button key={m} type="button" className="btn btnghost" onClick={() => plus(m)}>
                {m === 60 ? "1시간" : `${m}분`}
              </button>
            ))}
          </div>
        : <p className="muted">평소 하원 시각을 몰라 「+20분」 단추를 안 만들었습니다 — 시각을 직접 적어 주세요.</p>}
      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy || !sheetId}>저장</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        {sentAt
          ? <span className="pill pillok">보냄</span>
          : <span className="pill pillwarn">아직 안 보냄 — 마감이 한 번 묻습니다</span>}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>
      <p className="td-note">
        ⚠️ 「보내기」 단추를 여기에 안 만들었습니다. 발송은 <b>lib/notify.js</b> 한 곳을 지나야 하는데
        실제로 쏘는 손을 밖에서 받게 되어 있어, 화면이 그 손을 만들면 발송이 두 벌이 됩니다(대전제 7).
        빈 손을 넘기면 자취에는 「보냄」이 남고 폰에는 아무것도 안 갑니다.
      </p>
    </div>
  );
}

/**
 * 마감 — **되돌릴 수 없다.** 그래서 낙관 갱신을 안 쓴다.
 * 누르기 **전에** 「무엇이 ○ 로 올라가나 · 무엇이 학부모에게 보이나 · 무엇을 답해야 하나」를 보인다 (㊳).
 */
export function Close({ sheetId, closedAt, canWrite }) {
  const [gate, setGate] = useState(null);
  const [done, setDone] = useState(closedAt ?? null);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [okAsks, setOkAsks] = useState([]);

  function look() {
    setMsg(null);
    start(async () => {
      const r = await previewClose(sheetId);
      if (!r?.ok) { setMsg(r?.msg ?? "미리 못 봤습니다"); return; }
      setGate(r); setDone(r.closedAt ?? null); setOkAsks([]);
    });
  }
  function shut() {
    if (!canWrite) { setMsg("`v2.day_sheet` 에 쓸 권한이 없어 마감을 못 합니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await closeDay({ sheetId, confirm: okAsks, expect: gate?.stamp ?? null });
      if (r?.ok) { setDone(r.closedAt); setGate(null); setMsg("마감했습니다 — 이제 학부모·아이에게 보입니다"); }
      else setMsg(r?.msg ?? "마감 못 했습니다");
    });
  }
  const toggle = (code) =>
    setOkAsks((a) => (a.includes(code) ? a.filter((x) => x !== code) : [...a, code]));

  if (done) return <p className="pill pillok">마감함 — 학부모·아이에게 보입니다</p>;

  return (
    <div className="col">
      <div className="row">
        <button type="button" className="btn btnghost" onClick={look} disabled={busy || !sheetId}>
          마감하면 어떻게 되나 보기
        </button>
        {busy ? <span className="chip">서버 답을 기다립니다</span> : null}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>

      {gate ? (
        <div className="mdl">
          <div className="cardhd">이대로 마감하면</div>
          {gate.autoDone.length ? (
            <div className="col">
              {gate.autoDone.map((b) => (
                <p key={b.book_id} className="td-kv">
                  <b>{b.book_name ?? "교재"}</b>
                  <span className="td-unit">{b.units.map((u) => u.label).join(" · ")} 가 ○ 로 올라갑니다</span>
                </p>
              ))}
            </div>
          ) : <p className="muted">메모로 대신한 교재가 없어 저절로 올라갈 진도는 없습니다.</p>}

          <p className="muted">학부모·아이에게 보이게 되는 것 — {gate.reachesFamily.join(" · ")}</p>

          {gate.asks.length ? (
            <div className="col">
              {gate.asks.map((a) => (
                <label key={a.code} className="td-kv">
                  <input type="checkbox" checked={okAsks.includes(a.code)} onChange={() => toggle(a.code)} />
                  <span className={a.must ? "pill pillbad" : "pill pillwarn"}>{a.must ? "반드시" : "살펴봄"}</span>
                  <span className="grow">{a.what} — {a.why}</span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="mdlf">
            <button type="button" className="btn btnghost" onClick={() => setGate(null)}>닫기</button>
            <button type="button" className="btn btnmain" onClick={shut} disabled={busy}>마감한다</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
