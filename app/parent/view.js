"use client";
/**
 * 학부모 화면 — **그리기만 한다.** 판단은 하나도 없다.
 *
 * ⚠️ 이 파일이 지키는 것 (어기면 그날 사고가 난다)
 *   · **탭을 안 만든다.** 탭 전환은 화면 전체 재조회다. 급한 순서로 한 화면에 세우고 **접기**로 줄인다.
 *     접기는 다시 조회하지 않는다 — 값은 이미 서버에서 다 받아 왔다.
 *   · `position:fixed` 스크롤 잠금 · `history.pushState` 닫기 · `createPortal` ·
 *     `alert`/`confirm` **안 쓴다.** 덮개 판도 안 띄운다 — 고른 날은 **달력 바로 아래**에 편다.
 *   · **닫는 길은 언제나 화면 안에 있다**(대전제 10). 접은 것은 그 자리에서 다시 펴고,
 *     로그아웃은 `app/parent/page.js` 가 화면 맨 아래에 놓는다.
 *   · **투명도로 흐리게 하지 않는다.** 「덜 중요함」은 색(`--mute`·`--off-*`)으로 말한다.
 *   · **새 색·새 글씨 크기를 만들지 않는다.** 아래 스타일은 `app/globals.css` 의 토큰만 쓴다.
 *   · **진도 레이스(순위)를 안 그린다.** 아이 화면에만 있는 것이다 —
 *     학부모에게 순위가 보이면 중하위권 가정에서 불만이 나온다.
 *   · 되돌릴 수 없는 것(원장님께 가는 말·자료)은 **서버 답을 기다린다.** 낙관적 갱신을 안 쓴다.
 */
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
// ⚠️ 카드 차례 판단은 **lib 한 벌**이다 (원칙 1 · 계획 ⑮ 1)
import { applyOrder, moveOne, canUp, canDown, CARDS } from "@/lib/screens";
import { acceptBatch, isImage, MAX_FILES, MAX_EDGE } from "@/lib/files";
import { CELL, DOW, PREPARING, NOTHING } from "./shape";
import { FIRST_TIME, LEAVE_NOTE, PLAN_NOTE, REQUEST_NAME } from "./words";

const ATTEND_NAME = { present: "출석", late: "지각", absent: "결석", off: "휴강" };
const ATTEND_PILL = { present: "pillok", late: "pillwarn", absent: "pillbad", off: "pilloff" };
const SLOT_NAME = { check: "검사", class: "학원에서", home: "숙제", next: "다음에 할 것" };
const STATUS_NAME = { none: "아직", done: "다 함", weak: "조금 더", missing: "안 했음", inclass: "학원에서 함" };
const STATUS_PILL = { none: "pillinfo", done: "pillok", weak: "pillwarn", missing: "pillbad", inclass: "pilloff" };

export default function ParentView({ model, tellPlan, leaveWord, saveCardOrder }) {
  const [picked, setPicked] = useState(null);
  const [open, setOpen] = useState({
    intro: true, recent: true, homework: true, next: false,
    files: false, word: true, reports: false, sent: false,
  });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  /* ── 카드 차례 (계획 ⑮ 1) — **사람마다 따로** ────────────────────────
   * ⚠️ 판단은 `lib/screens.js` 한 벌이다. 여기 다시 적지 않는다(원칙 1).
   * ⚠️ 저장은 **뒤에서** 보낸다 — 차례는 되돌릴 수 있는 것이라 낙관적 갱신을 쓴다.
   *    실패하면 **그 자리만** 되돌리고 왜인지 화면에 적는다(조용히 넘어가지 않는다).  */
  const [순서, set순서] = useState(() => applyOrder(model.cardOrder, CARDS.parent));
  const [차례못함, set차례못함] = useState("");
  const [옮기는중, 옮기기시작] = useTransition();
  const 옮기기 = (id, 어디로) => {
    const 다음 = moveOne(순서, id, 어디로);
    if (다음 === 순서) return;                 // 끝에서 더 밀면 아무 일도 안 한다
    const 전 = 순서;
    set순서(다음); set차례못함("");
    옮기기시작(async () => {
      const r = await saveCardOrder(다음);
      if (!r?.ok) { set순서(전); set차례못함(r?.error || "까닭을 모릅니다"); }
    });
  };
  const 차례 = (id) => ({
    id, at: 순서.indexOf(id), first: 옮기는중 || !canUp(순서, id),
    last: 옮기는중 || !canDown(순서, id), onMove: 옮기기,
  });

  const dayOf = useMemo(() => {
    const m = new Map();
    for (const mo of model.months ?? []) for (const d of mo.days) m.set(d.date, d);
    return m;
  }, [model.months]);

  const sheetOf = useMemo(() => {
    const m = new Map();
    for (const d of model.recent ?? []) m.set(d.date, d);
    return m;
  }, [model.recent]);

  // ⚠️ **달력은 세지 않는다.** 달력은 값이 하나도 없어도 그려지므로, 그것까지 세면
  //    「아직 보여 드릴 것이 없습니다」가 영영 안 뜨고 학부모는 왜 빈지 모른 채 화면만 본다
  const hasAny = (model.recent?.length ?? 0) + (model.homework?.length ?? 0)
               + (model.reports?.length ?? 0) + (model.requests?.length ?? 0) > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* ── 왜 비었나 · 이 화면이 못 아는 것 (대전제 0) ─────────────────── */}
      {(model.problems ?? []).length > 0 && (
        <div className="card pr-bad" role="status">
          <div className="cardhd">지금 안 되는 것</div>
          <ul className="pr-list">{model.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      {(model.children?.length ?? 0) > 1 && (
        <nav className="card">
          <div className="cardhd">어느 아이</div>
          <div className="row">
            {model.children.map((c) => (
              <a key={c.id} href={`/parent?s=${c.id}`}
                 className={`btn ${c.id === model.student?.id ? "pr-on" : ""}`}
                 aria-current={c.id === model.student?.id ? "true" : undefined}>
                {c.name}{c.grade ? ` (${c.grade})` : ""}
              </a>
            ))}
          </div>
          <p className="muted pr-small">
            ⚠️ 자료를 보내실 때 <b>누구 것인지 여기서 먼저 골라 주세요.</b> 안 고르면 형·언니 자료가 동생 칸에 들어갑니다.
          </p>
        </nav>
      )}

      {차례못함 && (
        <p className="sunk" style={{ margin: 0, color: "var(--bad-fg)", background: "var(--bad-bg)" }}>
          ⚠️ 카드 차례를 못 바꿨습니다 — {차례못함} (지금 보이는 차례는 이 화면에서만 그렇습니다)
        </p>
      )}

      {/* ⚠️ **여기가 flex 여야 카드의 `order` 가 먹는다.** 아니면 차례를 눌러도 아무 일도 안 난다 */}
      <div className="pr-deck">
      {/* ── ① 처음 오신 분께 ──────────────────────────────────────────── */}
      <Card title="처음 오셨나요" {...차례("intro")} open={open.intro} onToggle={() => toggle("intro")}>
        <ul className="pr-list">
          {FIRST_TIME.map((t, i) => <li key={i}>{strong(t)}</li>)}
        </ul>
        {(model.limits ?? []).length > 0 && (
          <ul className="pr-list pr-dim">
            {model.limits.map((t, i) => <li key={i}>· {t}</li>)}
          </ul>
        )}
      </Card>

      {/* ── ② 최근 수업 ───────────────────────────────────────────────── */}
      {show(model, model.recent) && (
        <Card title="최근 수업" {...차례("recent")} open={open.recent} onToggle={() => toggle("recent")}
              count={model.recent.length}>
          {model.recent.slice(0, 5).map((d) => <DayBlock key={d.id ?? d.date} d={d} />)}
        </Card>
      )}

      {/* ── ③ 과제 ────────────────────────────────────────────────────── */}
      {show(model, model.homework) && (
        <Card title="과제" {...차례("homework")} open={open.homework} onToggle={() => toggle("homework")}
              count={model.homework.length}>
          <p className="muted pr-small">
            ⚠️ <b>앞으로 할 것도 같이 있습니다.</b> 「다음에 할 것」은 아직 안 한 것이 아니라 다음 시간에 할 것입니다.
          </p>
          <ul className="pr-list">
            {model.homework.map((h) => (
              <li key={h.id} className="pr-hw">
                <span className="num pr-date">{h.date.slice(5)}</span>
                <span className={`pill ${h.ahead ? "pillinfo" : STATUS_PILL[h.status] ?? "pillinfo"}`}>
                  {h.ahead ? "다음에 할 것" : STATUS_NAME[h.status] ?? h.status}
                </span>
                <span className="pr-hwtxt">
                  {h.book ? <b>{h.book}</b> : null}
                  {h.chapter ? <span className="muted"> {h.chapter}</span> : null}
                  {h.sub ? <span> {h.sub}</span> : null}
                  {h.activity ? <span className="chip">{h.activity}</span> : null}
                  {h.item ? <span className="chip">{h.item}</span> : null}
                  {h.range ? <span className="num"> {h.range}</span> : null}
                  {h.memo ? <span className="muted"> — {h.memo}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── ④ 달력 ────────────────────────────────────────────────────── */}
      {(model.months ?? []).map((mo, i) => (
        i === 0 ? (
          <section className="card" key={mo.ym}>
            <div className="cardhd">{mo.label}</div>
            <Calendar mo={mo} picked={picked} onPick={setPicked} />
            <Legend />
          </section>
        ) : (
          <Card key={mo.ym} title={mo.label} {...차례("next")} open={open.next} onToggle={() => toggle("next")}>
            <Calendar mo={mo} picked={picked} onPick={setPicked} />
          </Card>
        )
      ))}

      {/* ── ⑤ 고른 날 — **덮개 판이 아니라 달력 바로 아래에 편다** ──────── */}
      {picked && (
        <PickedDay
          day={dayOf.get(picked)} sheet={sheetOf.get(picked)}
          student={model.student} tellPlan={tellPlan}
          onClose={() => setPicked(null)}
        />
      )}

      {/* ── ⑥ 자료 보내기 (계획 ㊸) ───────────────────────────────────── */}
      <Card title="자료 보내기" {...차례("files")} open={open.files} onToggle={() => toggle("files")}>
        <SendFiles model={model} />
      </Card>

      {/* ── ⑦ 남기실 말 ──────────────────────────────────────────────── */}
      <Card title="남기실 말" {...차례("word")} open={open.word} onToggle={() => toggle("word")}>
        <LeaveWord model={model} leaveWord={leaveWord} />
      </Card>

      {/* ── ⑧ 월간 리포트 — **보내야 보인다** ─────────────────────────── */}
      {show(model, model.reports) && (
        <Card title="월간 리포트" {...차례("reports")} open={open.reports} onToggle={() => toggle("reports")}
              count={model.reports.length}>
          {model.reports.map((r) => (
            <div key={r.ym} className="pr-block">
              <div className="row">
                <b>{r.label}</b>
                <span className="chip num">보낸 날 {String(r.sentAt ?? "").slice(0, 10)}</span>
              </div>
              {r.body ? <p className="pr-body">{r.body}</p>
                      : <p className="muted">{r.why || "글이 없습니다."}</p>}
            </div>
          ))}
        </Card>
      )}

      {/* ── ⑨ 보내신 것 — 「원장님이 보셨나」를 같이 보여 준다 ─────────── */}
      {show(model, model.requests) && (
        <Card title="보내신 것" {...차례("sent")} open={open.sent} onToggle={() => toggle("sent")}
              count={model.requests.length}>
          <ul className="pr-list">
            {model.requests.map((r) => (
              <li key={r.id} className="pr-hw">
                <span className="num pr-date">{String(r.at ?? "").slice(5, 10)}</span>
                <span className={`pill ${r.answered ? "pillok" : r.seen ? "pillinfo" : "pilloff"}`}>
                  {r.answered ? "답 주심" : r.seen ? "보셨습니다" : "아직 안 보심"}
                </span>
                <span className="pr-hwtxt">
                  {r.who ? <span className="chip">{r.who}</span> : null}
                  <span className="chip">{REQUEST_NAME[r.kind] ?? r.kind}</span> {r.body}
                  {r.answer ? <span className="pr-answer">↳ {r.answer}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      </div>

      {/* ⚠️ 하나도 없을 때 — **예쁜 빈 화면을 만들지 않는다.** 무엇이 없어서 비었는지를 적는다 */}
      {!hasAny && (
        <div className="card pr-bad">
          <div className="cardhd">아직 보여 드릴 것이 없습니다</div>
          <ul className="pr-list">
            <li>수업 내용은 원장님이 그날 <b>정리를 마쳐야</b> 보입니다.</li>
            <li>월간 리포트는 원장님이 <b>보내셔야</b> 보입니다.</li>
            {(model.problems ?? []).map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

// ── 조각들 ────────────────────────────────────────────────────────────────

/** 빈 카드를 띄울까 — ⚠️ **판단은 `lib/close.js` 의 `hideEmptyCards()`** 다. 여기선 받아 쓴다 */
function show(model, list) {
  return (list?.length ?? 0) > 0 || !model.hideEmpty;
}

/**
 * 접었다 펴는 카드. ⚠️ 접기는 **다시 조회하지 않는다** — 값은 이미 다 받아 왔다.
 *
 * ⚠️⚠️ **머리를 통째로 단추로 두지 않는다.** 차례 옮기는 ▲▼ 를 붙여야 하는데
 *    단추 안에 단추는 못 넣는다(브라우저가 바깥 것만 누른 것으로 친다).
 *    → 펴고 접는 단추와 ▲▼ 를 **나란히** 둔다.
 * ⚠️ 차례를 바꿔도 **카드 속을 다시 안 그린다** — flex 의 `order` 만 바꾼다(계획 「속도」 5).
 */
function Card({ id, title, count, open, onToggle, at, first, last, onMove, children }) {
  return (
    <section className={`card acc ${open ? "is-open" : ""}`} style={at == null ? undefined : { order: at }}>
      <div className="pr-acchd">
        <button type="button" className="pr-accbtn" onClick={onToggle} aria-expanded={open}>
          <span className="cardhd pr-acctitle">{title}</span>
          {count != null && <span className="chip num">{count}</span>}
          <span className="pr-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>
          <span className="sronly">{open ? "접기" : "펴기"}</span>
        </button>
        {onMove && (
          <span className="row pr-move">
            <button type="button" className="btn btnghost" disabled={first}
                    onClick={() => onMove(id, "up")}>
              <span aria-hidden="true">▲</span><span className="sronly">{title} 위로</span>
            </button>
            <button type="button" className="btn btnghost" disabled={last}
                    onClick={() => onMove(id, "down")}>
              <span aria-hidden="true">▼</span><span className="sronly">{title} 아래로</span>
            </button>
          </span>
        )}
      </div>
      <div className="accbd">{children}</div>
    </section>
  );
}

/** 하루치 — ⚠️ **마감 전 값은 애초에 안 내려온다.** 여기서 숨기는 것이 아니다 */
function DayBlock({ d }) {
  const items = d.items ?? [];
  return (
    <div className="pr-block">
      <div className="row">
        <b className="num">{d.date}</b>
        <span className={`pill ${ATTEND_PILL[d.attend] ?? "pilloff"}`}>
          {ATTEND_NAME[d.attend] ?? d.attend}
        </span>
      </div>
      {!d.visible && <p className="muted">{d.label ?? PREPARING}</p>}
      {d.visible && String(d.comment ?? "").trim() !== "" && <p className="pr-body">{d.comment}</p>}
      {/* ⚠️ 마감했는데 정말 아무것도 없는 날 — **마감해야 이 글로 굳는다** (lib/close.js) */}
      {d.visible && String(d.comment ?? "").trim() === "" && items.length === 0 &&
        <p className="muted">{NOTHING}</p>}
      {items.length > 0 && (
        <ul className="pr-list">
          {items.map((it) => (
            <li key={it.id} className="pr-hw">
              <span className="chip">{SLOT_NAME[it.slot] ?? it.slot}</span>
              <span className="pr-hwtxt">
                {it.units?.books?.name ? <b>{it.units.books.name}</b> : null}
                {it.units?.chapter ? <span className="muted"> {it.units.chapter}</span> : null}
                {it.units?.sub ? <span> {it.units.sub}</span> : null}
                {it.units?.activity ? <span className="chip">{it.units.activity}</span> : null}
                {it.learn_items?.name ? <span className="chip">{it.learn_items.name}</span> : null}
                {it.range_note ? <span className="num"> {it.range_note}</span> : null}
                {it.memo ? <span className="muted"> — {it.memo}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Calendar({ mo, picked, onPick }) {
  return (
    <div className="calwrap">
      <div className="cal pr-dowrow" aria-hidden="true">
        {DOW.map((d) => <div key={d} className="calday pr-dow">{d}</div>)}
      </div>
      <div className="cal">
        {Array.from({ length: mo.pad }).map((_, i) => (
          <div key={`pad${i}`} className="calday pr-cell-out" />
        ))}
        {mo.days.map((d) => (
          d.state === CELL.OUT
            ? <div key={d.date} className="calday pr-cell-out"><span className="num">{d.day}</span></div>
            : (
              <button key={d.date} type="button"
                      className={`calday pr-cell pr-cell-${d.state} ${picked === d.date ? "pr-pick" : ""}`}
                      onClick={() => onPick(picked === d.date ? null : d.date)}
                      aria-pressed={picked === d.date}>
                <span className="num pr-daynum">{d.day}</span>
                {d.state === CELL.CLOSED && (
                  <span className={`pill ${ATTEND_PILL[d.attend] ?? "pilloff"}`}>
                    {ATTEND_NAME[d.attend] ?? "수업"}
                  </span>
                )}
                {/* ⚠️ 마감 안 한 날을 **빈 칸으로 두지 않는다** — 「수업이 없던 날」과 같아 보인다 */}
                {d.state === CELL.OPEN && <span className="pill pillwarn">{d.label}</span>}
                {d.state === CELL.FUTURE && <span className="pill pillinfo">예정</span>}
              </button>
            )
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <p className="row pr-small">
      <span className="pill pillok">출석</span>
      <span className="pill pillwarn">수업함 · 정리 중</span>
      <span className="pill pillinfo">예정</span>
      <span className="muted">날짜를 누르면 그날 것이 아래에 열립니다.</span>
    </p>
  );
}

/** 고른 날 — 지난 날은 그날 것, 앞날은 **결석·지각을 미리 알리는 자리** (계획 ㉔) */
function PickedDay({ day, sheet, student, tellPlan, onClose }) {
  if (!day) return null;
  return (
    <section className="card mdl pr-picked">
      <div className="row">
        <b className="num">{day.date}</b>
        {/* ⚠️ 닫는 길은 **화면 안에** 있다 (대전제 10) */}
        <button type="button" className="btn btnghost pr-right" onClick={onClose}>닫기</button>
      </div>

      {day.state === CELL.OFF && <p className="muted">수업이 없는 날입니다.</p>}
      {day.state === CELL.OPEN && <p className="muted">{day.label} — {PREPARING}</p>}
      {day.state === CELL.CLOSED && (sheet ? <DayBlock d={sheet} /> : <p className="muted">{NOTHING}</p>)}
      {day.state === CELL.FUTURE && <PlanForm date={day.date} student={student} tellPlan={tellPlan} />}
    </section>
  );
}

/**
 * 결석·지각 예정.
 * ⚠️ **지각에 「몇 분」을 안 묻는다** (원장님 2026-09-02 「지각은 시간이 필요없을 듯」) —
 *    아이가 등원을 찍은 그 시각이 곧 도착 시각이라 미리 골라 봐야 담을 칸이 없다.
 *    늦는 시각을 아시면 **까닭 한 줄**에 적으시면 그 글이 원장님께 그대로 간다.
 */
function PlanForm({ date, student, tellPlan }) {
  const [what, setWhat] = useState("absent");
  const [state, action, pending] = useActionState(tellPlan, null);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="studentId" value={student?.id ?? ""} />

      <div className="row">
        <label className="btn"><input type="radio" name="what" value="absent" className="pr-radio"
          checked={what === "absent"} onChange={() => setWhat("absent")} /> 결석합니다</label>
        <label className="btn"><input type="radio" name="what" value="late" className="pr-radio"
          checked={what === "late"} onChange={() => setWhat("late")} /> 늦습니다</label>
      </div>

      {what === "late" && (
        <p className="muted pr-small">
          몇 분 늦으시는지는 안 여쭙습니다 — 아이가 학원에서 등원을 찍는 그 시각이 도착 시각이 됩니다.
          아시는 시각이 있으면 아래 까닭에 적어 주세요.
        </p>
      )}

      <label className="col">
        <span className="lbl">까닭 (안 적으셔도 됩니다)</span>
        <input type="text" name="reason" className="fld" maxLength={100}
               placeholder={what === "late" ? "예: 병원 진료 · 7시 20분쯤 도착합니다" : "예: 병원 진료"} />
      </label>

      <p className="muted pr-small">{PLAN_NOTE}</p>

      {/* ⚠️ 원장님께 가는 말이라 **서버 답을 기다린다.** 낙관적 갱신을 안 쓴다 */}
      <button type="submit" className="btn btnmain" disabled={pending}>
        {pending ? "보내는 중…" : "원장님께 미리 알리기"}
      </button>
      {state?.error && <p className="pr-bad pr-msg" role="alert">{state.error}</p>}
      {state?.ok && <p className="pr-good pr-msg" role="status">{state.msg}</p>}
    </form>
  );
}

/** 남기실 말 — ⚠️ 원장님이 써 주신 두 줄을 **그대로** 둔다 */
function LeaveWord({ model, leaveWord }) {
  const [state, action, pending] = useActionState(leaveWord, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="studentId" value={model.student?.id ?? ""} />
      <ul className="pr-list">{LEAVE_NOTE.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <label className="col">
        <span className="lbl">남기실 말</span>
        <textarea name="text" className="fld pr-ta" rows={3} maxLength={1000} />
      </label>
      <button type="submit" className="btn btnmain" disabled={pending}>
        {pending ? "남기는 중…" : "남기기"}
      </button>
      {state?.error && <p className="pr-bad pr-msg" role="alert">{state.error}</p>}
      {state?.ok && <p className="pr-good pr-msg" role="status">{state.msg}</p>}
    </form>
  );
}

/**
 * 자료 보내기 — ⚠️ **받을까 말까는 `lib/files.js` 가 정한다.** 여기서 확장자도 30장도 안 적는다.
 * ⚠️ 사진만 긴 변 1600px 로 줄여 보낸다. pdf·문서는 안 줄인다 (글자가 뭉개진다).
 */
function SendFiles({ model }) {
  const box = useRef(null);
  const [chosen, setChosen] = useState([]);
  const [refused, setRefused] = useState([]);
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  const many = (model.children?.length ?? 0) > 1;

  function onPick(e) {
    const list = [...(e.target.files ?? [])];
    const meta = list.map((f) => ({ name: f.name, mime: f.type, bytes: f.size }));
    const batch = acceptBatch(meta, { already: 0 });   // ← 판단은 lib
    setRefused(batch.refused);
    setSay(batch.say || "");
    setChosen(batch.take.length ? list.filter((f) => batch.take.some((t) => t.name === f.name)) : []);
  }

  async function send() {
    if (!chosen.length || busy) return;
    setBusy(true); setSay("보내는 중…");
    try {
      const form = new FormData();
      form.append("studentId", model.student?.id ?? "");
      for (const f of chosen) {
        const s = await shrinkOne(f);
        form.append("file", s.file, f.name);
        form.append("shrunk", s.shrunk ? "1" : "0");
      }
      const res = await fetch("/parent/upload", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      // ⚠️ **성공한 척하지 않는다.** 답을 못 읽었으면 못 읽었다고 말한다
      setSay(j?.say ?? "보내지 못했습니다 — 답을 못 받았습니다. 잠시 뒤 다시 해주세요.");
      if (j?.ok) { setChosen([]); setRefused([]); if (box.current) box.current.value = ""; }
    } catch {
      setSay("보내지 못했습니다 — 인터넷을 확인하고 다시 해주세요.");
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <p className="muted pr-small">
        학교에서 받은 종이(수행평가 안내 · 학사일정 · 가정통신문)를 찍어 보내주세요.
        한 번에 <b>{MAX_FILES}장</b>까지입니다. 사진은 긴 변 {MAX_EDGE}px 로 줄여 보냅니다.
      </p>
      {many && (
        <p className="pr-bad pr-msg">
          ⚠️ 지금 <b>{model.student?.name}</b> 의 자료로 보냅니다. 다른 아이 것이면 위에서 아이를 먼저 바꿔 주세요.
        </p>
      )}
      <input ref={box} type="file" multiple className="fld" onChange={onPick} />
      {chosen.length > 0 && (
        <ul className="pr-list">
          {chosen.map((f) => (
            <li key={f.name} className="pr-hw">
              <span className="chip">{isImage(f.name) ? "사진" : "문서"}</span>
              <span className="pr-hwtxt">{f.name}</span>
            </li>
          ))}
        </ul>
      )}
      {refused.length > 0 && (
        <ul className="pr-list pr-bad">
          {refused.map((r, i) => <li key={i}>{r.name} — {r.say}</li>)}
        </ul>
      )}
      <button type="button" className="btn btnmain" onClick={send} disabled={busy || !chosen.length}>
        {busy ? "보내는 중…" : `${chosen.length || ""} 보내기`}
      </button>
      {say && <p className="pr-msg" role="status">{say}</p>}
      <p className="muted pr-small">
        보내신 것은 <b>원장님만</b> 보십니다. 다른 집에는 안 보입니다.
      </p>
    </div>
  );
}

/**
 * 사진 줄이기 — ⚠️ **줄일 수 있는 것만 줄인다.** 못 줄이면 원본을 그대로 보낸다.
 *    (아이폰 HEIC 는 브라우저가 못 여는 일이 잦다 — 거기서 막으면 아무것도 못 보낸다)
 * ⚠️ **낸 것과 같은 갈래로 되돌린다.** png 를 jpeg 로 바꿔 담으면 확장자와 속이 어긋나
 *    원장님 화면에서 안 열린다.
 */
const CAN_SHRINK = new Set(["image/jpeg", "image/png", "image/webp"]);
async function shrinkOne(file) {
  if (!isImage(file.name) || !CAN_SHRINK.has(file.type)) return { file, shrunk: false };
  try {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    if (long <= MAX_EDGE) return { file, shrunk: false };
    const k = MAX_EDGE / long;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, file.type, 0.85));
    if (!blob) return { file, shrunk: false };
    return { file: new File([blob], file.name, { type: file.type }), shrunk: true };
  } catch {
    return { file, shrunk: false };
  }
}

/** `**굵게**` 만 굵게. ⚠️ 다른 것은 안 판단한다 */
function strong(text) {
  return String(text).split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>);
}

/* ⚠️ 여기는 template literal 이다 — 안에 backtick 을 쓰면 문자열이 끊겨 빌드가 깨진다.
 * ⚠️ **새 색·새 글씨 크기를 만들지 않는다.** 값은 전부 app/globals.css 의 토큰이다.
 * ⚠️ 한 낱말 상태 클래스(open·on·sel)를 전역으로 쓰지 않는다 — 이름은 전부 `pr-` 로 시작한다. */
const css = `
.pr-list{margin:0;padding-left:var(--s4);display:flex;flex-direction:column;gap:var(--s2)}
.pr-list li{margin:0}
.pr-dim{color:var(--mute)}
.pr-small{font-size:var(--fs2)}
.pr-block{padding:var(--s3) 0;border-top:1px solid var(--line)}
.pr-block:first-child{border-top:0;padding-top:0}
.pr-body{white-space:pre-wrap;margin:var(--s2) 0 0}
.pr-answer{display:block;color:var(--ok-fg);margin-top:var(--s1)}
.pr-hw{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:baseline;list-style:none}
.pr-hwtxt{flex:1 1 170px}
.pr-date{color:var(--mid);flex:0 0 auto}
.pr-msg{margin:var(--s2) 0 0;padding:var(--s2) var(--s3);border-radius:var(--r1)}
.pr-bad{background:var(--bad-bg);color:var(--bad-fg)}
.pr-good{background:var(--ok-bg);color:var(--ok-fg)}
.pr-right{margin-left:auto}
.pr-ta{min-height:96px}
.pr-radio{width:auto;min-height:0;margin-right:var(--s1)}
.pr-on{border-color:var(--accent);color:var(--accent);font-weight:700}

.pr-deck{display:flex;flex-direction:column;gap:var(--s3)}
.pr-accbtn{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;flex:1 1 160px;
  min-width:0;background:none;border:0;text-align:left;padding:0;color:inherit;cursor:pointer}
.pr-move{flex:0 0 auto;gap:var(--s1)}
.pr-acchd{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;width:100%;
  min-height:var(--tap);padding:0;border:0;background:none;color:inherit;
  font-family:inherit;font-size:var(--fs4);text-align:left;cursor:pointer}
.pr-acctitle{margin:0;flex:1 1 170px}
.pr-caret{color:var(--mid);font-size:var(--fs2)}
.acc.card{padding:var(--s4)}
.acc .accbd{border-top:1px solid var(--line);margin-top:var(--s3);padding:var(--s3) 0 0}

.pr-dowrow{margin-bottom:1px}
.calday.pr-dow{min-height:0;text-align:center;color:var(--mid);background:var(--sunk);font-weight:700}
.calday.pr-cell{display:flex;flex-direction:column;gap:var(--s1);align-items:flex-start;
  border:0;font-family:inherit;font-size:var(--fs2);color:var(--fg);text-align:left;cursor:pointer}
.pr-daynum{font-weight:700}
.calday.pr-cell-out{background:var(--bg);color:var(--off-fg)}
.calday.pr-cell-off{background:var(--sunk);color:var(--off-fg)}
.calday.pr-cell-open{background:var(--warn-bg);color:var(--warn-fg)}
.calday.pr-cell-closed{background:var(--surface)}
.calday.pr-cell-future{background:var(--info-bg);color:var(--info-fg)}
.calday.pr-pick{outline:2px solid var(--accent);outline-offset:-2px}
.pr-picked{max-width:none}

@media (pointer:coarse){
  .pr-acchd{font-size:var(--fs6)}
  .calday.pr-cell{font-size:var(--fs2)}
}
`;
