"use client";
/**
 * 일정 화면에서 **누르는 것**들. 여기에도 판단은 없다 — 서버 동작을 부르고 답을 그대로 보인다.
 *
 * ⚠️ **누른 그 단추만 바뀐다** (§속도 5). 화면을 다시 그리지 않는다.
 *    달력에서 날짜를 고르는 것은 **재조회가 아니다** — 이미 받아 둔 한 벌에서 골라 편다.
 * ⚠️ **회차를 바꾸는 것**(휴강)만 「회차 다시 세기」를 원장님께 **직접 누르시라고** 내놓는다.
 *    앱이 멋대로 화면을 다시 그리면 적던 것이 날아간다.
 * ⚠️ `alert`/`confirm` 을 안 쓴다. 브라우저 알림창이 뜨면 자동화가 그 자리에서 멈춘다.
 * ⚠️ `position:fixed` · `history.pushState` · `createPortal` 도 안 쓴다 —
 *    고른 날 판은 **화면 안에** 펴진다. **닫는 길이 언제나 화면 안에 있다** (대전제 10).
 * ⚠️ 여는 순간 `autoFocus` 를 안 건다 — 키보드가 튀어 올라 화면이 뛴다.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  planAttend, clearPlan, saveMakeup, waiveMakeup, saveHoliday,
  saveEnglishOn, stampMonth, setTodoState, LATE_PRESETS,
} from "./actions.js";

/** 요일 — `lib/session.js` 의 `DOW_NAME` 과 같은 차례다(0=일). 화면 글자만 여기서 쓴다 */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function Msg({ v }) {
  if (!v) return null;
  return <span className={`pill ${v.bad ? "pillbad" : "pillok"}`}>{v.text}</span>;
}

/* ══ 달력 ══════════════════════════════════════════════════════════════
 * **정상 수업은 안 띄우고 휴강을 띄운다**(오류 85) · **사유별로 묶는다**(오류 86) ·
 * **15×15 고정 아이콘**(오류 78) · **칸은 넉넉히**(오류 87).
 * ═══════════════════════════════════════════════════════════════════ */
export function Calendar({ grid, marks, today, who, load, classes, students, makeups, planned, holidays, canWrite }) {
  const [picked, setPicked] = useState(null);

  return (
    <div className="col">
      <div className="calwrap">
        <div className="cal" aria-hidden="true">
          {DOW.map((d) => <div key={d} className="sc-dow">{d}</div>)}
        </div>
        <div className="cal">
          {Array.from({ length: grid.pad }).map((_, i) => <div key={`pad${i}`} className="sc-out" />)}
          {grid.days.map((d) => {
            const rows = marks[d.date] ?? [];
            return (
              <button key={d.date} type="button"
                      className={"sc-cell" + (picked === d.date ? " is-sel" : "")}
                      aria-pressed={picked === d.date}
                      onClick={() => setPicked(picked === d.date ? null : d.date)}>
                <span className="sc-kv">
                  <span className="num sc-daynum">{d.day}</span>
                  {d.date === today ? <span className="pill pillinfo">오늘</span> : null}
                </span>
                {rows.map((r) => (
                  <span key={r.key} className="sc-mark">
                    <span className="sc-icon" aria-hidden="true">{r.icon}</span>
                    {/* ⚠️ 사람마다 한 줄이 아니라 **사유별 한 줄**이다 (오류 86) */}
                    <span className="grow">{r.label} · {(r.who.length ? r.who : r.why).join(", ")}</span>
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>
      <p className="muted">
        정상 수업은 안 띄웁니다 — 휴강·보강·결석·지각·시험만 섭니다. 날짜를 누르면 아래에 그날이 열립니다.
      </p>
      {picked ? (
        <PickedDay date={picked} onClose={() => setPicked(null)}
                   who={who[picked] ?? []} load={load[picked] ?? 0}
                   classes={classes} students={students}
                   makeups={makeups.filter((m) => m.on_date === picked)}
                   planned={planned.filter((p) => p.date === picked)}
                   holidays={holidays.filter((h) => h.date === picked)}
                   canWrite={canWrite} />
      ) : null}
    </div>
  );
}

/**
 * 고른 날 — **가끔 만지는 것을 담는 모달 하나**(대전제 9).
 * 휴강 · 결석·지각 예정 · 보강이 여기 다 있다.
 */
function PickedDay({ date, onClose, who, load, classes, students, makeups, planned, holidays, canWrite }) {
  return (
    <div className="mdl sc-picked">
      <div className="cardhd">
        <span className="num">{date}</span>
        <span className="muted">그날 수업 {who.length}명 · 잡아 둔 보강 {load}명</span>
      </div>

      {holidays.length ? (
        <p className="sc-kv">
          <span className="pill pillbad">휴강</span>
          <span className="grow">{holidays.map((h) => h.reason || "휴강").join(" · ")}</span>
          <span className="muted">휴강은 회차에서 빠집니다.</span>
        </p>
      ) : null}

      {planned.length ? (
        <div className="col">
          {planned.map((p) => (
            <UndoPlan key={p.id} row={p} canWrite={canWrite} />
          ))}
        </div>
      ) : null}

      {makeups.length ? (
        <div className="col">
          {makeups.map((m) => <UndoMakeup key={m.id} row={m} canWrite={canWrite} />)}
        </div>
      ) : null}

      <details className="sc-fold">
        <summary className="sc-foldhd">결석 · 지각 예정 넣기</summary>
        <div className="sc-foldbd"><PlanForm date={date} who={who} canWrite={canWrite} /></div>
      </details>

      <details className="sc-fold">
        <summary className="sc-foldhd">보강 잡기 — 시각도 직접 적습니다</summary>
        <div className="sc-foldbd">
          <MakeupForm date={date} load={load} students={students} canWrite={canWrite} />
        </div>
      </details>

      <details className="sc-fold">
        <summary className="sc-foldhd">휴강 넣기 — 이 달 회차가 바뀝니다</summary>
        <div className="sc-foldbd"><HolidayForm date={date} classes={classes} canWrite={canWrite} /></div>
      </details>

      <div className="mdlf">
        <button type="button" className="btn btnghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

/**
 * 결석·지각 **예정** (㉔).
 * ⚠️ **지각에는 「얼마나」가 있다** — 10·20·30·60분 또는 도착 시각. `lib/attend.js` 가 따진다.
 * ⚠️ **결석은 회차에서 안 빠진다.** 그래서 여기서 회차를 안 건드린다.
 */
function PlanForm({ date, who, canWrite }) {
  const [pick, setPick] = useState("");
  const [kind, setKind] = useState("absent");
  const [mins, setMins] = useState(String(LATE_PRESETS[1] ?? 20));
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const one = who.find((w) => w.id === pick) ?? null;

  function save() {
    if (!canWrite?.day_sheet?.ins) { setMsg({ bad: true, text: "`v2.day_sheet` 에 쓸 권한이 없습니다" }); return; }
    if (!one) { setMsg({ bad: true, text: "아이를 골라 주세요" }); return; }
    setMsg(null);
    start(async () => {
      // ⚠️ 도착 시각을 적었으면 그것이 이깁니다 — 「몇 분」과 「도착 시각」은 같은 사실의 두 단위입니다
      const late = kind === "late" ? (at ? at : Number(mins)) : null;
      const r = await planAttend({ studentId: one.id, date, classId: one.classId ?? null, attend: kind, late });
      setMsg(r?.ok
        ? { text: r.warn ? r.warn : (kind === "late" ? "지각 예정으로 적었습니다" : "결석 예정으로 적었습니다"), bad: !!r.warn }
        : { bad: true, text: r?.msg ?? "못 적었습니다" });
    });
  }

  if (!who.length) return <p className="sc-note">이 날은 수업이 없어 고를 아이가 없습니다.</p>;

  return (
    <div className="col">
      <label className="lbl" htmlFor={`p-who-${date}`}>누구</label>
      <select id={`p-who-${date}`} className="fld" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">— 고르세요 —</option>
        {who.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <div className="row">
        {[["absent", "결석 예정"], ["late", "지각 예정"]].map(([v, t]) => (
          <button key={v} type="button" aria-pressed={kind === v}
                  className={"btn" + (kind === v ? " btnmain" : " btnghost")}
                  onClick={() => setKind(v)}>{t}</button>
        ))}
      </div>
      {kind === "late" ? (
        <div className="col">
          <div className="row">
            <span className="muted">얼마나</span>
            {LATE_PRESETS.map((m) => (
              <button key={m} type="button" aria-pressed={!at && String(m) === mins}
                      className={"btn" + (!at && String(m) === mins ? " btnmain" : " btnghost")}
                      onClick={() => { setMins(String(m)); setAt(""); }}>
                {m === 60 ? "1시간" : `${m}분`}
              </button>
            ))}
          </div>
          <label className="lbl" htmlFor={`p-at-${date}`}>또는 도착 시각을 직접</label>
          <input id={`p-at-${date}`} className="fld" type="time" value={at} onChange={(e) => setAt(e.target.value)} />
          <p className="sc-note">
            ⚠️ 「얼마나」는 아직 <b>저장되지 않습니다</b> — `v2.day_sheet` 에 담을 칸이 없습니다.
            저장된 척하지 않으려고 그대로 밝힙니다.
          </p>
        </div>
      ) : null}
      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy}>적기</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        <Msg v={msg} />
      </div>
      <p className="muted">
        ⚠️ 결석은 회차에서 <b>안 빠집니다</b>(학원은 열었습니다). 그 아이만 보강을 잡습니다.
        학부모께 알리는 것은 발송 화면의 「결석·지각 예정 알림」 묶음입니다.
      </p>
    </div>
  );
}

/** 예정을 **무른다** — 지우지 않는다(대전제 6) */
function UndoPlan({ row, canWrite }) {
  const [gone, setGone] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  function undo() {
    if (!canWrite?.day_sheet?.upd) { setMsg({ bad: true, text: "`v2.day_sheet` 에 쓸 권한이 없습니다" }); return; }
    setMsg(null);
    start(async () => {
      const r = await clearPlan({ studentId: row.student_id, date: row.date, classId: row.class_id ?? null });
      if (r?.ok) setGone(true); else setMsg({ bad: true, text: r?.msg ?? "못 물렀습니다" });
    });
  }
  return (
    <p className="sc-kv">
      <span className={`pill ${row.attend === "late" ? "pillwarn" : "pillbad"}`}>
        {row.attend === "late" ? "지각" : "결석"}
      </span>
      <span className="grow">{row.name}</span>
      {gone
        ? <span className="pill pillok">물렀습니다 (판은 남습니다)</span>
        : <button type="button" className="btn btnghost" onClick={undo} disabled={busy || !!row.closed_at}>
            {row.closed_at ? "마감한 날 — 못 무릅니다" : "무르기"}
          </button>}
      <Msg v={msg} />
    </p>
  );
}

/**
 * 보강 잡기 — ⚠️ **앱이 시각을 제안하지 않는다**(오류 82).
 * 원장님: 「니가 시간이랑 일정을 잡으면 내가 고칠 수가 없잖아.」
 * 빈 자리 셈은 **보여 주기만** 하고 **막지 않는다.**
 */
function MakeupForm({ date, load, students, canWrite }) {
  const [pick, setPick] = useState("");
  const [at, setAt] = useState("");
  const [of, setOf] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function save() {
    if (!canWrite?.makeup?.ins) { setMsg({ bad: true, text: "`v2.makeup` 에 쓸 권한이 없습니다" }); return; }
    if (!pick) { setMsg({ bad: true, text: "아이를 골라 주세요" }); return; }
    setMsg(null);
    start(async () => {
      const r = await saveMakeup({ studentId: pick, onDate: date, ofDate: of || null, atTime: at || null });
      setMsg(r?.ok
        ? { text: r.warn ?? r.note ?? "보강을 잡았습니다 — 그날 판이 섰습니다", bad: !!r.warn }
        : { bad: true, text: r?.msg ?? "못 잡았습니다" });
    });
  }
  return (
    <div className="col">
      <p className="muted">이 날은 이미 <span className="num">{load}</span>명 보강이 잡혀 있습니다 —
        <b> 보여 드리기만 하고 막지 않습니다.</b></p>
      {/* ⚠️ 재원생 **전부**를 고를 수 있다. 그날 수업이 있는 아이로 좁히지 않는다 —
           앱이 후보를 좁히면 원장님이 고치실 수가 없다(오류 82). */}
      <label className="lbl" htmlFor={`m-who-${date}`}>누구</label>
      <select id={`m-who-${date}`} className="fld" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">— 고르세요 —</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="row">
        <div className="grow">
          <label className="lbl" htmlFor={`m-at-${date}`}>시각 — 직접 적습니다</label>
          <input id={`m-at-${date}`} className="fld" type="time" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor={`m-of-${date}`}>빠진 날 (없으면 비웁니다)</label>
          <input id={`m-of-${date}`} className="fld" type="date" value={of} onChange={(e) => setOf(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy}>보강 잡기</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        <Msg v={msg} />
      </div>
      <p className="muted">
        ⚠️ 앱은 <b>시각을 제안하지 않습니다</b>. 빈 자리 셈도 보여 드리기만 하고 막지 않습니다 —
        원장님이 고치실 수 있어야 하기 때문입니다.
      </p>
    </div>
  );
}

/** 잡아 둔 보강을 **무른다** — 지우지 않고 'waived' 로 내린다(대전제 6) */
function UndoMakeup({ row, canWrite }) {
  const [gone, setGone] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  function undo() {
    if (!canWrite?.makeup?.upd) { setMsg({ bad: true, text: "`v2.makeup` 에 쓸 권한이 없습니다" }); return; }
    setMsg(null);
    start(async () => {
      const r = await waiveMakeup({ id: row.id });
      if (r?.ok) setGone(true); else setMsg({ bad: true, text: r?.msg ?? "못 물렀습니다" });
    });
  }
  return (
    <p className="sc-kv">
      <span className="pill pillinfo">보강</span>
      <span className="grow">{row.name}{row.at_time ? ` · ${String(row.at_time).slice(0, 5)}` : " · 시각 없음"}</span>
      {gone
        ? <span className="pill pillok">물렀습니다</span>
        : <button type="button" className="btn btnghost" onClick={undo} disabled={busy}>무르기</button>}
      <Msg v={msg} />
    </p>
  );
}

/**
 * 휴강 — ⚠️ **회차에서 빠진다**(결석은 안 빠진다).
 * ⚠️ **무르는 단추가 없다.** `v2.holiday` 에 상태 칸이 없고 지우기 권한도 없다 —
 *    지우는 척하는 단추보다 없는 편이 낫다(대전제 0).
 */
function HolidayForm({ date, classes, canWrite }) {
  const [cls, setCls] = useState("");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  function save() {
    if (!canWrite?.holiday?.ins) { setMsg({ bad: true, text: "`v2.holiday` 에 쓸 권한이 없습니다" }); return; }
    setMsg(null);
    start(async () => {
      const r = await saveHoliday({ date, classId: cls || null, reason: why });
      if (r?.ok) { setDone(true); setMsg({ text: r.warn ?? r.note, bad: !!r.warn }); }
      else setMsg({ bad: true, text: r?.msg ?? "못 넣었습니다" });
    });
  }
  return (
    <div className="col">
      <label className="lbl" htmlFor={`h-cls-${date}`}>어느 반 — 비우면 학원 전체 휴강</label>
      <select id={`h-cls-${date}`} className="fld" value={cls} onChange={(e) => setCls(e.target.value)}>
        <option value="">학원 전체</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {(c.weekdays ?? []).map((d) => DOW[d] ?? "?").join("")} {String(c.start_time ?? "").slice(0, 5)}
          </option>
        ))}
      </select>
      <label className="lbl" htmlFor={`h-why-${date}`}>사유 — 달력이 사유별로 묶습니다</label>
      <input id={`h-why-${date}`} className="fld" value={why} onChange={(e) => setWhy(e.target.value)}
             placeholder="예: 추석" />
      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy}>휴강 넣기</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        <Msg v={msg} />
        {/* ⚠️ 회차는 화면이 멋대로 다시 세지 않는다 — 원장님이 직접 누르신다(§속도 5) */}
        {done ? <button type="button" className="btn btnghost" onClick={() => router.refresh()}>회차 다시 세기</button> : null}
      </div>
      <p className="sc-note">
        ⚠️ 넣은 휴강을 <b>무르는 길이 아직 없습니다</b> — `v2.holiday` 에 상태 칸도 지우기 권한도 없습니다.
        그리고 계획대로라면 휴강이 그 달 확정 도장을 통째로 풀어야 하는데, <b>푸는 길도 없습니다.</b>
      </p>
    </div>
  );
}

/**
 * 영어 시험일 한 줄 (㊲ · 4단계).
 * ⚠️ **나이스는 안 준다.** 그리고 이 한 줄이 전날 등원·안내·마감을 한꺼번에 세운다 —
 *    누르기 **전에** 그 사실을 보인다.
 */
export function EnglishOn({ examId, value, canWrite }) {
  const [on, setOn] = useState(value ?? "");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  function save() {
    if (!canWrite?.exams?.upd) { setMsg({ bad: true, text: "`v2.exams` 에 쓸 권한이 없습니다" }); return; }
    setMsg(null);
    start(async () => {
      const r = await saveEnglishOn({ examId, on });
      setMsg(r?.ok ? { text: r.note ?? "넣었습니다" } : { bad: true, text: r?.msg ?? "못 넣었습니다" });
    });
  }
  return (
    <span className="row">
      <input className="fld grow" type="date" value={on} onChange={(e) => setOn(e.target.value)}
             aria-label="영어 시험일" />
      <button type="button" className="btn btnghost" onClick={save} disabled={busy}>영어 시험일 넣기</button>
      {busy ? <span className="chip">보내는 중</span> : null}
      <Msg v={msg} />
    </span>
  );
}

/**
 * 다음 달 확정 도장 셋 (3단계).
 * ⚠️ **③까지 끝난 달은 안 건드린다.** 그리고 **푸는 길이 없다** — 되돌리기 단추를 안 만들었다.
 */
export function Stamps({ ym, classId, done, canWrite }) {
  const [at, setAt] = useState(done ?? {});
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const shut = !!at[3];
  const NAME = { 1: "① 원장 안내", 2: "② 학부모 확인", 3: "③ 원장 확정" };

  function press(step) {
    if (!canWrite?.month_confirm?.ins) { setMsg({ bad: true, text: "`v2.month_confirm` 에 쓸 권한이 없습니다" }); return; }
    setMsg(null);
    const before = at;
    setAt({ ...at, [step]: "방금" });      // ⚠️ 누른 그 단추만 바뀐다
    start(async () => {
      const r = await stampMonth({ ym, classId, step });
      if (!r?.ok) { setAt(before); setMsg({ bad: true, text: r?.msg ?? "못 찍었습니다" }); }
    });
  }
  return (
    <span className="sc-stamp">
      {[1, 2, 3].map((s) => (
        <button key={s} type="button" disabled={busy || !!at[s] || (shut && !at[s])}
                className={"btn" + (at[s] ? " btnmain" : " btnghost")}
                onClick={() => press(s)}>
          {NAME[s]}{at[s] ? " ✓" : ""}
        </button>
      ))}
      {shut ? <span className="pill pillok">확정된 달 — 안 건드립니다</span> : null}
      <Msg v={msg} />
    </span>
  );
}

/**
 * 할 일 체크 (㊴).
 * ⚠️ **묶인 카드는 속에 든 줄을 전부 바꾼다** — 하나만 바꾸면 나머지가 다음 날 또 뜬다.
 * ⚠️ **앱이 세어 준 카드**(`counted`)에는 이 단추가 안 붙는다 — 바꿀 줄이 DB 에 없다.
 */
export function TodoCheck({ ids, state, canWrite }) {
  const [now, setNow] = useState(state ?? "todo");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const done = now === "done";
  function press() {
    if (!canWrite?.todo?.upd) { setMsg({ bad: true, text: "`v2.todo` 에 쓸 권한이 없습니다" }); return; }
    const before = now;
    setNow(done ? "todo" : "done");        // ⚠️ 먼저 바뀐다. 기다리지 않는다
    setMsg(null);
    start(async () => {
      const r = await setTodoState({ ids, done: !done });
      if (!r?.ok) { setNow(before); setMsg({ bad: true, text: r?.msg ?? "못 바꿨습니다" }); }
      else if (r.warn) setMsg({ bad: true, text: r.warn });
    });
  }
  return (
    <span className="row">
      <button type="button" className={"btn" + (done ? " btnmain" : " btnghost")}
              aria-pressed={done} onClick={press} disabled={busy}>
        {done ? "끝냄 ✓" : "끝냄으로"}
      </button>
      {ids.length > 1 ? <span className="chip">{ids.length}줄 묶임</span> : null}
      <Msg v={msg} />
    </span>
  );
}
