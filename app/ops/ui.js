"use client";
/**
 * 운영 화면에서 **누르는 것**들. 여기에도 판단은 없다 — 서버 동작을 부르고 답을 그대로 보인다.
 *
 * ⚠️ **누른 그 단추만 바뀐다** (§속도 5). 저장하면 **그 줄만** 갈아 끼운다 —
 *    화면을 다시 그리지 않는다. 25명을 이어서 적는데 한 명마다 전체를 다시 읽으면
 *    한 달 마감 한 번에 그 값을 25번 치른다.
 * ⚠️ **되돌릴 수 없는 것**(등록 전환)은 낙관 갱신을 안 쓴다 — 서버 답을 기다린다.
 *    아이 줄은 지울 수 없다(대전제 6). 잘못 만들면 영영 남는다.
 * ⚠️ `alert`/`confirm` 을 안 쓴다. 브라우저 알림창이 뜨면 자동화가 그 자리에서 멈춘다.
 * ⚠️ `position:fixed` · `history.pushState` · `createPortal` 도 안 쓴다 —
 *    덮개 판은 `<details>` 로 편다. **닫는 길이 언제나 화면 안에 있다** (대전제 10).
 */
import { useState, useTransition } from "react";
import { savePayment, addFeeRule, endFeeRule, saveConsult, saveInquiry, setStage, enroll } from "./actions.js";

/** 문의 단계 — 화면 글자와 DB 낱말을 **한 줄에** 둔다. 두 벌이 되면 언젠가 어긋난다 */
const STAGE_TEXT = [
  ["new", "문의"],
  ["test", "레벨테스트"],
  ["visit", "방문상담"],
  ["dropped", "안 옴"],
];
const STAGE_NAME = { new: "문의", test: "레벨테스트", visit: "방문상담", joined: "등록", dropped: "안 옴" };

const won = (n) => (n == null ? "" : Number(n).toLocaleString("ko-KR"));

/* ══════════════════════════════════════════════════════════════════════
 * ① 수강료 — **금액 넣고 받은 날 체크가 전부**다 (원장님: 「아직 결제는 중요한 내용이 아니다」)
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 한 아이 한 달.
 * ⚠️ 금액 칸을 비우면 **0원이 아니라 「아직 안 적음」**이다. 그래서 `placeholder` 로 그렇게 적어 둔다.
 * ⚠️ 청구액을 화면이 안 만든다 — 단가 줄과 회차는 **옆에 보이기만** 한다 (오류 83).
 */
export function PayLine({ studentId, ym, name, grade, state, classes = [], rules = [],
                          sessions = null, amount, paidOn, method, note, canWrite, today }) {
  const [amt, setAmt] = useState(amount == null ? "" : String(amount));
  const [on, setOn] = useState(paidOn ?? "");
  const [how, setHow] = useState(method ?? "");
  const [memo, setMemo] = useState(note ?? "");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function save() {
    if (!canWrite) { setMsg("`v2.payment` 에 쓸 권한이 없습니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await savePayment({ studentId, ym, amount: amt, paidOn: on, method: how, note: memo });
      setMsg(r?.ok ? (r.msg ?? "저장했습니다") : (r?.msg ?? "저장 못 했습니다"));
    });
  }

  return (
    <div className="op-line">
      <span className="op-nm">{name}</span>
      {grade ? <span className="chip">{grade}학년</span> : null}
      {state !== "active" ? <span className="pill pilloff">퇴원 — 재원 기간만 보입니다</span> : null}
      {classes.map((c) => (
        <span key={c.id} className={c.kind === "special" ? "pill pillinfo" : "chip"}>
          {c.kind === "special" ? "특강 " : ""}{c.label}
        </span>
      ))}

      {/* 단가 줄 — **고르지 않는다.** 겹치면 둘 다 보이고 겹쳤다고 말한다 */}
      {rules.length === 0
        ? <span className="pill pillwarn">단가 줄 없음</span>
        : rules.map((f) => (
            <span key={f.id} className="chip">
              {f.scope === "student" ? "이 아이" : "반"} {won(f.amount)}원
              {f.per_session ? " ×회차" : "/월"} ({f.from}~{f.to ?? "지금"})
            </span>))}
      {rules.length > 1 ? <span className="pill pillwarn">단가 줄이 둘 이상 겹칩니다 — 어느 것이 이기는지 정해진 데가 없습니다</span> : null}

      {/* 특강만 회차를 보인다. **곱하지 않는다** */}
      {sessions != null
        ? <span className="pill pillinfo num">특강 {sessions}회 — 회차만큼 받습니다</span>
        : null}

      <div className="grow">
        <label className="lbl" htmlFor={`amt-${studentId}`}>금액</label>
        <input id={`amt-${studentId}`} className="fld num" inputMode="numeric"
               value={amt} onChange={(e) => setAmt(e.target.value)}
               placeholder="비우면 「아직 안 적음」" />
      </div>
      <div className="grow">
        <label className="lbl" htmlFor={`on-${studentId}`}>받은 날</label>
        <input id={`on-${studentId}`} className="fld" type="date" max={today ?? undefined}
               value={on} onChange={(e) => setOn(e.target.value)} />
      </div>
      <div className="grow">
        <label className="lbl" htmlFor={`how-${studentId}`}>받은 길</label>
        <input id={`how-${studentId}`} className="fld" value={how}
               onChange={(e) => setHow(e.target.value)} placeholder="계좌 · 카드 …" />
      </div>
      <div className="grow">
        <label className="lbl" htmlFor={`memo-${studentId}`}>메모</label>
        <input id={`memo-${studentId}`} className="fld" value={memo}
               onChange={(e) => setMemo(e.target.value)} />
      </div>
      <button type="button" className="btn btnmain" onClick={save} disabled={busy}>저장</button>
      {busy ? <span className="chip">보내는 중</span> : null}
      {msg ? <span className="muted">{msg}</span> : null}
    </div>
  );
}

/**
 * 단가 줄 — **가끔 만지는 것이라 접기 안에 둔다** (대전제 9).
 * ⚠️ 고치지 않고 **쌓는다.** 값 하나만 두면 단가를 올리는 순간 지난달이 소급해 바뀐다.
 */
export function FeeRules({ rules = [], students = [], classes = [], canWrite, today }) {
  const [list, setList] = useState(rules);
  const [who, setWho] = useState("");
  const [from, setFrom] = useState(today ?? "");
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("");
  const [per, setPer] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function add() {
    if (!canWrite) { setMsg("`v2.fee_rule` 에 쓸 권한이 없습니다"); return; }
    const [kind, id] = String(who).split(":");
    setMsg(null);
    start(async () => {
      const r = await addFeeRule({
        studentId: kind === "s" ? id : "", classId: kind === "c" ? id : "",
        fromDate: from, toDate: to, amount: amt, perSession: per });
      if (!r?.ok) { setMsg(r?.msg ?? "못 넣었습니다"); return; }
      // ⚠️ 그 줄만 더한다 — 화면을 다시 그리지 않는다
      setList((a) => [{ id: r.id, scope: kind === "s" ? "student" : "class",
                        name: nameOf(kind, id, students, classes),
                        amount: Number(String(amt).replace(/[^\d]/g, "")),
                        from, to: to || null, per_session: per }, ...a]);
      setAmt(""); setMsg("한 줄 쌓았습니다");
    });
  }
  function close(id) {
    setMsg(null);
    start(async () => {
      const r = await endFeeRule({ id, toDate: today });
      if (!r?.ok) { setMsg(r?.msg ?? "못 바꿨습니다"); return; }
      setList((a) => a.map((x) => (x.id === id ? { ...x, to: today } : x)));
    });
  }

  return (
    <details className="op-fold">
      <summary className="op-foldhd">
        단가 — 「언제부터 얼마」 <span className="num">{list.length}줄</span>
        {list.length === 0 ? <span className="pill pillwarn">아직 한 줄도 없습니다</span> : null}
      </summary>
      <div className="op-foldbd">
        <p className="op-note">
          단가는 <b>고치지 않고 쌓습니다.</b> 값 하나만 두면 단가를 올리는 순간
          <b> 지난달 청구액이 소급해 바뀝니다.</b> 바꾸려면 지금 줄의 「끝 찍기」를 누르고 새 줄을 넣으세요.
          <br />⚠️ <b>정규는 월정액</b>이라 회차와 무관합니다. <b>「회차만큼」은 특강에만</b> 켭니다 (오류 83).
        </p>

        <div className="op-list">
          {list.map((f) => (
            <div key={f.id} className="op-line">
              <span className="op-nm">{f.name ?? (f.scope === "student" ? "어떤 아이" : "어떤 반")}</span>
              <span className="chip">{f.scope === "student" ? "아이" : "반"}</span>
              <span className="num">{won(f.amount)}원</span>
              <span className="chip">{f.per_session ? "회차만큼" : "월정액"}</span>
              <span className="num">{f.from} ~ {f.to ?? "지금"}</span>
              {f.to ? <span className="pill pilloff">끝남</span>
                    : <button type="button" className="btn btnghost"
                              onClick={() => close(f.id)} disabled={busy || !canWrite}>끝 찍기</button>}
            </div>))}
          {list.length === 0
            ? <p className="op-note">
                단가 줄이 없어서 수납 줄 옆에 「단가 줄 없음」이 뜹니다 — 금액은 그래도 손으로 적을 수 있습니다.
              </p>
            : null}
        </div>

        <div className="row">
          <div className="grow">
            <label className="lbl" htmlFor="fr-who">누구 것</label>
            <select id="fr-who" className="fld" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">— 고르세요 —</option>
              <optgroup label="반">
                {classes.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.kind === "special" ? "특강 " : "정규 "}{c.label}
                  </option>))}
              </optgroup>
              <optgroup label="아이">
                {students.map((s) => <option key={s.studentId} value={`s:${s.studentId}`}>{s.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="grow">
            <label className="lbl" htmlFor="fr-amt">얼마</label>
            <input id="fr-amt" className="fld num" inputMode="numeric" value={amt}
                   onChange={(e) => setAmt(e.target.value)} />
          </div>
          <div className="grow">
            <label className="lbl" htmlFor="fr-from">언제부터</label>
            <input id="fr-from" className="fld" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grow">
            <label className="lbl" htmlFor="fr-to">언제까지 (비우면 지금까지)</label>
            <input id="fr-to" className="fld" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <label className="op-kv">
          <input type="checkbox" checked={per} onChange={(e) => setPer(e.target.checked)} />
          <span className="grow">회차만큼 받는다 (특강) — 끄면 월정액입니다</span>
        </label>
        <div className="row">
          <button type="button" className="btn btnmain" onClick={add} disabled={busy || !who}>한 줄 쌓기</button>
          {busy ? <span className="chip">보내는 중</span> : null}
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </div>
    </details>
  );
}

function nameOf(kind, id, students, classes) {
  if (kind === "s") return students.find((s) => s.studentId === id)?.name ?? null;
  const c = classes.find((x) => x.id === id);
  return c ? `${c.kind === "special" ? "특강 " : "정규 "}${c.label}` : null;
}

/* ══════════════════════════════════════════════════════════════════════
 * ② 신규 문의 — **전화 끊고 바로.** 클릭을 늘리지 않는다
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 문의 — **적는 자리와 진행 중 목록이 한 덩어리**다.
 * ⚠️ 가르면 방금 적은 문의가 목록에 안 보여서 원장님이 새로고침한다 (§속도 5).
 * ⚠️ 끝난 것(등록·안 옴)은 **여기 안 넣는다** — 접기로 줄여 서버가 그린다. 안 지운다(대전제 6).
 */
export function InquiryBox({ rows = [], classes = [], canWrite, canEnroll, today }) {
  const [list, setList] = useState(rows);
  return (
    <div className="col">
      <InquiryNew canWrite={canWrite} onAdd={(r) => setList((a) => [r, ...a])} />
      <div className="op-list">
        <span className="sronly">진행 중인 문의 {list.length}건</span>
        {list.map((r) => (
          <InquiryLine key={r.id} row={r} classes={classes}
                       canWrite={canWrite} canEnroll={canEnroll} today={today} />))}
        {list.length === 0
          ? <p className="op-note">진행 중인 문의가 없습니다 — 끝난 것은 아래 접기 안에 있습니다.</p>
          : null}
      </div>
    </div>
  );
}

/** 새 문의 한 줄 — 폼은 **늘 펴져 있다.** 접으면 전화 끊고 한 번 더 눌러야 한다 */
function InquiryNew({ canWrite, onAdd }) {
  const [f, setF] = useState({ name: "", phone: "", school: "", grade: "", way: "", body: "" });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  function add() {
    if (!canWrite) { setMsg("`v2.inquiry` 에 쓸 권한이 없습니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await saveInquiry(f);
      if (!r?.ok) { setMsg(r?.msg ?? "못 넣었습니다"); return; }
      onAdd?.(r.row);
      setF({ name: "", phone: "", school: "", grade: "", way: "", body: "" });
      setMsg("적어 뒀습니다");
    });
  }

  return (
    <div className="col">
      <div className="row">
        <div className="grow">
          <label className="lbl" htmlFor="iq-name">이름</label>
          <input id="iq-name" className="fld" value={f.name} onChange={put("name")} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor="iq-phone">전화</label>
          <input id="iq-phone" className="fld" type="tel" inputMode="tel" value={f.phone} onChange={put("phone")} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor="iq-school">학교</label>
          <input id="iq-school" className="fld" value={f.school} onChange={put("school")} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor="iq-grade">학년</label>
          <input id="iq-grade" className="fld num" inputMode="numeric" value={f.grade} onChange={put("grade")} />
        </div>
        <div className="grow">
          <label className="lbl" htmlFor="iq-way">알게 된 길</label>
          <input id="iq-way" className="fld" value={f.way} onChange={put("way")} placeholder="검색 · 소개 …" />
        </div>
      </div>
      <label className="lbl" htmlFor="iq-body">통화에서 들은 것</label>
      <textarea id="iq-body" className="fld" rows={3} value={f.body} onChange={put("body")} />
      <div className="row">
        <button type="button" className="btn btnmain" onClick={add} disabled={busy}>적어 두기</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        {msg ? <span className="muted">{msg}</span> : null}
      </div>
      <p className="op-note">
        ⚠️ 「바로 안내 보내기」 단추를 여기에 <b>안 만들었습니다.</b> 밖으로 나가는 길은
        <b> lib/notify.js</b> 한 곳뿐인데 실제로 쏘는 손을 밖에서 받게 되어 있어,
        화면이 그 손을 만들면 발송이 두 벌이 됩니다(대전제 7). 빈 손을 넘기면
        <b> 자취에는 「보냄」이 남고 폰에는 아무것도 안 갑니다.</b> 발송 문(`app/api/notify`)이 서면 단추 하나만 붙입니다.
      </p>
    </div>
  );
}

/** 문의 한 줄 — 단계 한 번 · 등록 전환 한 번 */
export function InquiryLine({ row, classes = [], canWrite, canEnroll, today }) {
  const [stage, setSt] = useState(row.stage);
  const [kid, setKid] = useState(row.studentName ?? null);
  const [msg, setMsg] = useState(null);
  const [same, setSame] = useState(null);       // 같은 이름이 있어 한 번 되돌린 상태
  const [done, setDone] = useState(null);       // 등록 전환 결과 — 못 한 것을 그대로 띄운다
  const [cls, setCls] = useState("");
  const [from, setFrom] = useState(today ?? "");
  const [busy, start] = useTransition();

  function press(next) {
    if (!canWrite) { setMsg("`v2.inquiry` 에 쓸 권한이 없습니다"); return; }
    const before = stage;
    setSt(next); setMsg(null);
    start(async () => {
      const r = await setStage({ id: row.id, stage: next });
      if (!r?.ok) { setSt(before); setMsg(r?.msg ?? "못 바꿨습니다"); }
    });
  }

  // ⚠️ 되돌릴 수 없다 — 낙관 갱신을 안 쓰고 **서버 답을 기다린다**
  function go(force) {
    if (!canEnroll) { setMsg("`v2.students` 에 쓸 권한이 없어 등록 전환을 못 합니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await enroll({ inquiryId: row.id, name: row.name, grade: row.grade,
                               classId: cls, fromDate: from, force });
      if (!r?.ok) {
        if (r?.why === "same_name") { setSame(r.same ?? []); setMsg(r.msg); return; }
        setMsg(r?.msg ?? "등록 전환 못 했습니다"); return;
      }
      setSt("joined"); setKid(r.name); setSame(null); setDone(r);
    });
  }

  return (
    <div className="op-line">
      <span className="op-nm">{row.name ?? "(이름 없음)"}</span>
      {row.phone ? <a className="chip" href={`tel:${row.phone}`}>{row.phone}</a> : null}
      {row.school ? <span className="chip">{row.school}{row.grade ? ` ${row.grade}학년` : ""}</span> : null}
      {row.way ? <span className="chip">{row.way}</span> : null}
      <span className="num muted">{row.onDate}</span>
      <span className={stage === "joined" ? "pill pillok" : stage === "dropped" ? "pill pilloff" : "pill pillinfo"}>
        {STAGE_NAME[stage] ?? stage}
      </span>
      {kid ? <span className="pill pillok">아이 줄 있음 — {kid}</span> : null}

      {row.body ? <p className="op-body grow">{row.body}</p> : null}

      {stage === "joined" ? null : (
        <div className="row">
          {STAGE_TEXT.map(([v, t]) => (
            <button key={v} type="button" aria-pressed={stage === v}
                    className={"btn" + (stage === v ? " btnmain" : " btnghost")}
                    onClick={() => press(v)} disabled={busy}>{t}</button>))}
        </div>
      )}

      {stage !== "joined" && !kid ? (
        <details className="op-fold grow">
          <summary className="op-foldhd">등록 전환 — 아이 줄을 세우고 문의를 잇습니다</summary>
          <div className="op-foldbd">
            <div className="row">
              <div className="grow">
                <label className="lbl" htmlFor={`cl-${row.id}`}>반 (안 고르면 소속을 안 만듭니다)</label>
                <select id={`cl-${row.id}`} className="fld" value={cls} onChange={(e) => setCls(e.target.value)}>
                  <option value="">— 나중에 —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kind === "special" ? "특강 " : "정규 "}{c.label}
                    </option>))}
                </select>
              </div>
              <div className="grow">
                <label className="lbl" htmlFor={`fd-${row.id}`}>언제부터 — 소속은 기간이 열쇠입니다</label>
                <input id={`fd-${row.id}`} className="fld" type="date" value={from}
                       onChange={(e) => setFrom(e.target.value)} />
              </div>
            </div>
            {same ? (
              <p className="op-note">
                같은 이름의 아이가 이미 있습니다 — {same.map((s) => s.name).join(" · ")}.
                아이 줄은 <b>지울 수 없습니다</b>(대전제 6). 그래도 새로 만들려면 아래를 한 번 더 누르세요.
              </p>) : null}
            <div className="row">
              <button type="button" className="btn btnmain" onClick={() => go(same != null)} disabled={busy}>
                {same ? "그래도 만든다" : "등록 전환"}
              </button>
              {busy ? <span className="chip">서버 답을 기다립니다</span> : null}
            </div>
          </div>
        </details>
      ) : null}

      {done ? (
        <p className="op-note grow">
          아이 줄을 세웠습니다{done.joinedClass ? " · 반 소속도 넣었습니다" : ""}
          {done.schoolFound ? " · 학교를 찾아 붙였습니다" : " · ⚠️ 학교는 못 붙였습니다 (그 이름의 학교 줄이 없습니다)"}
          <br />⚠️ 여기서 <b>안 한 것</b>: {done.notDone.join(" · ")}
        </p>) : null}

      {msg ? <span className="muted grow">{msg}</span> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ③ 상담일지 — 아이마다 모아 본다
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 적는 자리와 읽는 자리를 **한 덩어리**로 둔다.
 * ⚠️ 가르면 새로 적은 줄이 목록에 안 얹혀서, 원장님이 「저장이 됐나」 하고 새로고침한다 —
 *    그러면 화면 전체가 다시 조회된다(§속도 5 가 막으려는 바로 그것).
 */
export function ConsultBox({ studentId, studentName, rows = [], showName = false, canWrite }) {
  const [list, setList] = useState(rows);
  const [body, setBody] = useState("");
  const [way, setWay] = useState("");
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  function add() {
    if (!canWrite) { setMsg("`v2.consult` 에 쓸 권한이 없습니다"); return; }
    setMsg(null);
    start(async () => {
      const r = await saveConsult({ studentId, at, way, body });
      if (!r?.ok) { setMsg(r?.msg ?? "못 넣었습니다"); return; }
      // ⚠️ 그 줄만 얹는다 — 화면을 다시 그리지 않는다
      setList((a) => [{ ...r.row, name: studentName ?? null }, ...a]);
      setBody(""); setAt(""); setMsg("적었습니다");
    });
  }

  // ⚠️ 넓은 화면에서는 **적는 자리와 지난 줄이 좌우로** 선다 — 지난 상담을 보면서 적어야
  //    같은 말을 두 번 안 한다. 900px 아래에서는 위아래로 접힌다
  return (
    <div className="op-pair">
      <div className="col">
        <label className="lbl" htmlFor="cs-body">
          {studentName ? `${studentName} — 상담 내용` : "상담 내용 — ⚠️ 아이를 안 고르면 아이 없는 줄로 남습니다"}
        </label>
        <textarea id="cs-body" className="fld" rows={5} value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder={"■ 학부모 말씀\n· \n■ 드린 말씀\n· "} />
        <div className="row">
          <div className="grow">
            <label className="lbl" htmlFor="cs-way">어떻게</label>
            <input id="cs-way" className="fld" value={way} onChange={(e) => setWay(e.target.value)}
                   placeholder="전화 · 방문 · 문자" />
          </div>
          <div className="grow">
            <label className="lbl" htmlFor="cs-at">언제 (비우면 지금)</label>
            <input id="cs-at" className="fld" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
          <button type="button" className="btn btnmain" onClick={add} disabled={busy}>적기</button>
          {busy ? <span className="chip">보내는 중</span> : null}
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </div>

      <div className="op-list">
        <span className="sronly">상담 {list.length}줄</span>
        {list.map((c) => (
          <div key={c.id} className="op-line">
            <span className="num muted">{c.at}</span>
            {showName ? <span className="op-nm">{c.name ?? "(아이 없음)"}</span> : null}
            {c.way ? <span className="chip">{c.way}</span> : null}
            {c.body ? <p className="op-body grow">{c.body}</p>
                    : <span className="pill pillwarn">내용이 비어 있습니다</span>}
          </div>))}
        {list.length === 0
          ? <p className="op-note">
              {studentName ? `${studentName} 상담 줄이 아직 없습니다.` : "상담 줄이 아직 없습니다."}
            </p>
          : null}
      </div>
    </div>
  );
}
