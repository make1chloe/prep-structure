"use client";

/**
 * 설정 화면의 **누르는 조각들**.
 *
 * ⚠️ 여기에도 판단이 없다. 고른 값을 `app/settings/actions.js` 로 넘기고,
 *    돌아온 말을 그대로 띄운다. 세는 것은 DB(`v2.…()`)와 `lib/` 이 한다.
 *
 * ⚠️ **`alert`/`confirm` 을 안 쓴다.** 까닭은 화면 안에 글로 선다 —
 *    폰에서 덮개가 뜨면 원장님이 무엇을 누르다 말았는지 잊는다.
 * ⚠️ **누른 그 자리만 바뀐다** (계획 「속도」 5). 저장 한 번에 화면 전체를 다시 조회하지 않는다.
 * ⚠️ 실패하면 **그 자리를 되돌린다.** 「저장됨」이라 말해 놓고 값이 그대로면 제일 나쁘다.
 */

import { useEffect, useState } from "react";
import {
  setAcademyProgressEdit, setStudentProgressEdit,
  saveStopWeeks, saveTemplate, saveRule,
  setRoleAccess, setRoleAll, applyDecided,
} from "./actions.js";

/** 한 줄 알림 — 좋은 소식은 초록, 나쁜 소식은 빨강 (흐리게 하지 않는다 · 계획 ㉑) */
function Said({ ok, text }) {
  if (!text) return null;
  return <span className={ok ? "pill pillok" : "pill pillbad"}>{text}</span>;
}

/* ══════════════════════════════════════════════════════════════════
 * ① 배색 고르기 (계획 ㉖)
 *
 * ⚠️ **되살리는 한 줄은 `app/layout.js` 에 이미 있다.** 여기서 새로 만들지 않는다 —
 *    두 벌이 되면 한쪽만 고치는 날 첫 그림이 흰 화면으로 번쩍인다.
 *    여기가 하는 일은 **고른 것을 적어 두는 것**뿐이다.
 * ⚠️ 값 다섯은 `app/globals.css` 가 정한다. 여기 이름을 더해도 그 배색은 안 먹는다.
 * ⚠️ 서버에 안 남긴다 — **원장님·아이·학부모가 각자 고른다**(㉖). 기계마다 다르다.
 * ══════════════════════════════════════════════════════════════════ */
export function SkinPick({ skins = [] }) {
  const [chosen, setChosen] = useState("");
  const [said, setSaid] = useState("");

  // ⚠️ 첫 그림에서는 무엇이 골라졌는지 서버가 모른다 (브라우저에만 있다).
  //    그래서 붙은 뒤에 읽는다 — 서버와 화면이 어긋나 React 가 경고하는 것을 막는다.
  useEffect(() => {
    let v = "";
    try { v = localStorage.getItem("skin") || ""; } catch { v = ""; }
    setChosen(v || document.documentElement.dataset.skin || "auto");
  }, []);

  const pick = (id) => {
    document.documentElement.dataset.skin = id;     // 눈에 바로 보인다
    setChosen(id);
    try {
      localStorage.setItem("skin", id);
      setSaid("");
    } catch {
      // 사파리 비공개 창처럼 저장이 막힌 기계가 있다. **막힌 것을 숨기지 않는다**
      setSaid("⚠️ 이 브라우저가 저장을 막고 있습니다 — 지금만 바뀌고 다음에 열면 되돌아갑니다.");
    }
  };

  const now = skins.find((s) => s.id === chosen) ?? null;

  return (
    <div className="stack">
      <div className="skinpick">
        {skins.map((s) => (
          <button key={s.id} type="button"
                  className={chosen === s.id ? "skinbtn is-sel" : "skinbtn"}
                  aria-pressed={chosen === s.id}
                  onClick={() => pick(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <small className="muted">{now ? now.why : "누르면 그 자리에서 바뀝니다."}</small>
      {said ? <div className="row"><span className="pill pillwarn">{said}</span></div> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ② 진도 체크 켜고 끄기 — 학원 전체 (계획 ㊶)
 *
 * ⚠️ **날짜 자동 만료는 없다** (원장님 2026-09-02). 대신 **켠 날짜**를 남겨
 *    대시보드가 「N일째 열려 있습니다」를 셀 수 있게 한다.
 * ⚠️ 「며칠째」를 여기서 세지 않는다 — `v2.progress_open_days()` 가 센 값을 받아 그린다(원칙 5).
 * ══════════════════════════════════════════════════════════════════ */
export function ProgressEditSwitch({ isOpen = false, days = null, openedOn = null }) {
  // ⚠️ 이 값을 `on` 이라 이름 짓지 마라 — `className={on ? …}` 이 되는 순간
  //    「한 낱말 상태 이름」이 되고, 이 저장소에서 세 번 터진 그 자리다 (오류 49·92)
  const [live, setLive] = useState(isOpen === true);
  const [day, setDay] = useState(openedOn);
  const [nth, setNth] = useState(days);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  const flip = async (next) => {
    setBusy(true); setSaid(null);
    const r = await setAcademyProgressEdit(next);
    setBusy(false);
    if (!r?.ok) { setSaid({ ok: false, text: r?.why || "바꾸지 못했습니다" }); return; }
    setLive(next);
    if (next) {
      // ⚠️ 켠 날짜는 **DB 가 찍은 것**을 받아 쓴다. 화면에서 오늘 날짜를 지어내지 않는다
      setDay(r.openedOn ?? day);
      setNth(null);                       // 다시 셀 값이다 — 옛 숫자를 그대로 두면 거짓말이 된다
    }
    setSaid({ ok: true, text: r.why || (next ? "켰습니다" : "껐습니다") });
  };

  return (
    <div className="stack">
      <div className="row">
        <span className={live ? "pill pillwarn" : "pill pilloff"}>
          {live ? "열려 있습니다" : "닫혀 있습니다"}
        </span>
        {live && day ? <span className="chip">켠 날 <span className="num">{day}</span></span> : null}
        {live && nth != null ? <span className="chip"><span className="num">{nth}</span>일째</span> : null}
        {live && nth == null ? <span className="chip">방금 켰습니다</span> : null}
        <button type="button" className={live ? "btn btnghost" : "btn btnmain"}
                disabled={busy} onClick={() => flip(!live)}>
          {live ? "끄기" : "켜기"}
        </button>
        <Said ok={said?.ok} text={said?.text} />
      </div>
      <small className="muted">
        켜면 아이가 자기 교재 진도를 소단원마다 찍을 수 있습니다. 아이가 찍은 줄은
        「확인 기다리는 중」으로 서고, 원장님이 찍은 줄은 아이가 못 덮습니다.
        ⚠️ 날짜로 저절로 꺼지지 않습니다 — <b>여기서 끄셔야 꺼집니다.</b>
        열려 있는 동안 대시보드 맨 위에 「몇 일째」가 섭니다.
      </small>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ③ 학생별 예외 (계획 ㊶ 표 4-9)
 *
 * ⚠️ 「그래서 지금 이 아이가 고칠 수 있나」를 화면에서 조합하지 않는다 —
 *    `v2.can_edit_progress()` 한 곳이 답한다. 바꾼 뒤 값은 **다시 세야** 하므로
 *    옛 답을 그대로 두지 않고 「다시 셉니다」로 바꾼다 (거짓말을 안 하려고).
 * ══════════════════════════════════════════════════════════════════ */
export function StudentModes({ rows = [], modes = [] }) {
  const [list, setList] = useState(rows);
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");

  const change = async (id, mode) => {
    const before = list.find((r) => r.id === id)?.mode ?? "follow";
    setBusy(id);
    setList((xs) => xs.map((r) => (r.id === id ? { ...r, mode, stale: true } : r)));
    const r = await setStudentProgressEdit(id, mode);
    setBusy("");
    if (r?.ok) { setSaid((s) => ({ ...s, [id]: { ok: true, text: "저장했습니다" } })); return; }
    // ⚠️ 실패하면 **그 줄만** 되돌린다
    setList((xs) => xs.map((x) => (x.id === id ? { ...x, mode: before, stale: false } : x)));
    setSaid((s) => ({ ...s, [id]: { ok: false, text: r?.why || "저장하지 못했습니다" } }));
  };

  if (!list.length)
    return <p className="muted">재원 중인 학생이 없습니다 — 그래서 이 표가 비었습니다.</p>;

  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th className="hdstick">이름</th>
            <th className="hdstick">학년</th>
            <th className="hdstick">진도 체크</th>
            <th className="hdstick">지금 고칠 수 있나</th>
            <th className="hdstick">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="num">{r.grade == null ? "—" : r.grade}</td>
              <td>
                <select value={r.mode} disabled={busy === r.id}
                        aria-label={`${r.name} 진도 체크`}
                        onChange={(e) => change(r.id, e.target.value)}>
                  {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </td>
              <td>
                {r.stale
                  ? <span className="pill pillinfo">바뀌었습니다 · 다시 셉니다</span>
                  : r.canEdit
                    ? <span className="pill pillok">고칠 수 있습니다</span>
                    : <span className="pill pilloff">못 고칩니다</span>}
              </td>
              <td><Said ok={said[r.id]?.ok} text={said[r.id]?.text} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ④ 교재 멈춤 기본 (계획 ㊺-b — 고등 6주 · 중등 4주)
 * ══════════════════════════════════════════════════════════════════ */
export function StopWeeks({ rows = [], levels = [] }) {
  const [list, setList] = useState(rows);
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");

  const nameOf = (lv) => levels.find((x) => x.id === lv)?.name ?? lv;

  const save = async (lv) => {
    const row = list.find((r) => r.level === lv);
    setBusy(lv); setSaid((s) => ({ ...s, [lv]: null }));
    const r = await saveStopWeeks(lv, row?.weeks);
    setBusy("");
    setSaid((s) => ({ ...s, [lv]: { ok: r?.ok === true, text: r?.ok ? "저장했습니다" : (r?.why || "저장하지 못했습니다") } }));
  };

  if (!list.length)
    return <p className="muted">⚠️ 학교급 기본값이 한 줄도 없습니다 — 마이그레이션 0006 이 안 돌았습니다.</p>;

  return (
    <div className="stack">
      {list.map((r) => (
        <div className="row" key={r.level}>
          <span className="chip">{nameOf(r.level)}</span>
          <label className="grow">
            <span className="sronly">{nameOf(r.level)} 몇 주 전부터</span>
            <input type="number" inputMode="numeric" min="0" max="52" step="1"
                   className="fld" value={r.weeks}
                   onChange={(e) => setList((xs) => xs.map((x) =>
                     x.level === r.level ? { ...x, weeks: e.target.value } : x))} />
          </label>
          <span className="chip">주 전부터</span>
          <button type="button" className="btn" disabled={busy === r.level}
                  onClick={() => save(r.level)}>저장</button>
          <Said ok={said[r.level]?.ok} text={said[r.level]?.text} />
        </div>
      ))}
      <small className="muted">
        영어 시험일에서 거꾸로 셉니다. 학생 한 명만 다르게 하려면 그 아이 교재 배정에서 따로 정합니다.
        멈춤은 <b>시험이 끝나는 날 저절로 풀립니다.</b>
      </small>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ⑤ 문구 (계획 (e) ⑧)
 *
 * ⚠️⚠️ **「표에 줄을 더하면 채워진다」는 착각을 만들지 않는다.** 채우는 것은 코드다.
 *    그래서 여기에 **새 문구 만들기 단추가 없다** — 갈래(`kind`)는 발송 코드가 정한다.
 * ⚠️ 「지금 이대로 보내면 막히나」는 `lib/notify.js` 가 판정한 것을 받아 그린다.
 * ══════════════════════════════════════════════════════════════════ */
export function Templates({ rows = [] }) {
  const [list, setList] = useState(rows);
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");

  const put = (id, k, v) =>
    setList((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));

  const save = async (id) => {
    const row = list.find((x) => x.id === id);
    setBusy(id); setSaid((s) => ({ ...s, [id]: null }));
    const r = await saveTemplate({ id, title: row?.title, body: row?.body });
    setBusy("");
    setSaid((s) => ({ ...s, [id]: { ok: r?.ok === true, text: r?.ok ? "저장했습니다" : (r?.why || "저장하지 못했습니다") } }));
  };

  if (!list.length)
    return (
      <p className="muted">
        문구가 <span className="num">0</span>줄입니다. 갈래는 발송 코드가 정합니다 —
        여기서 지어내지 않습니다. 발송 화면이 갈래를 세우면 그때 여기 뜹니다.
      </p>
    );

  return (
    <div className="stack">
      {list.map((r) => (
        <div className="sunk stack" key={r.id}>
          <div className="row">
            <span className="mono">{r.kind}</span>
            {r.hole
              ? <span className="pill pillbad">안 채운 자리가 있어 발송이 멈춥니다</span>
              : <span className="pill pillok">보낼 수 있습니다</span>}
          </div>
          <label>
            <span className="lbl">제목</span>
            <input type="text" className="fld" value={r.title}
                   onChange={(e) => put(r.id, "title", e.target.value)} />
          </label>
          <label>
            <span className="lbl">본문</span>
            <textarea className="fld" rows={4} value={r.body}
                      onChange={(e) => put(r.id, "body", e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn" disabled={busy === r.id}
                    onClick={() => save(r.id)}>저장</button>
            <Said ok={said[r.id]?.ok} text={said[r.id]?.text} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ⑥ 되풀이 규칙의 임계값 (계획 (e) ⑤)
 *
 * 「몇 번째부터 재시험지」 같은 값 — **코드에 박으면 원장님이 못 바꾼다.**
 * ⚠️ 새 규칙을 여기서 만들지 않는다. `kind` 를 읽는 코드가 없으면 그 규칙은 한 번도 안 돈다.
 * ⚠️ 주기를 아는지는 `lib/queue.js` 의 `cycleOf()` 가 판정한 것을 받아 그린다.
 * ══════════════════════════════════════════════════════════════════ */
export function Rules({ rows = [] }) {
  const [list, setList] = useState(rows);
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");

  const put = (id, k, v) =>
    setList((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));

  const save = async (id) => {
    const row = list.find((x) => x.id === id);
    setBusy(id); setSaid((s) => ({ ...s, [id]: null }));
    const r = await saveRule({ id, threshold: row?.threshold, active: row?.active });
    setBusy("");
    setSaid((s) => ({ ...s, [id]: { ok: r?.ok === true, text: r?.ok ? "저장했습니다" : (r?.why || "저장하지 못했습니다") } }));
  };

  if (!list.length)
    return (
      <p className="muted">
        되풀이 규칙이 <span className="num">0</span>줄입니다. 그래서 「몇 번째부터 재시험지」·
        「며칠이 지나면 미납」 같은 선이 아직 없습니다 — 규칙을 정하시면 한 줄로 넣습니다.
        ⚠️ 여기서 새로 만들면 <b>돌지 않는 규칙</b>이 생기므로 만들기 단추를 두지 않았습니다.
      </p>
    );

  return (
    <div className="stack">
      {list.map((r) => {
        const live = r.active === true;
        return (
          <div className="sunk stack" key={r.id}>
            <div className="row">
              <b className="grow">{r.name}</b>
              <span className="mono">{r.kind}</span>
              <span className={live ? "pill pillok" : "pill pilloff"}>{live ? "켜짐" : "꺼짐"}</span>
              {r.cycle
                ? <span className="chip">{r.cron}</span>
                : <span className="pill pillbad">주기를 몰라 한 번도 안 돕니다</span>}
            </div>
            <label>
              <span className="lbl">임계값 (JSON)</span>
              <textarea className="fld" rows={2} value={r.threshold}
                        onChange={(e) => put(r.id, "threshold", e.target.value)} />
            </label>
            <div className="row">
              <label className="row">
                <input type="checkbox" checked={live}
                       onChange={(e) => put(r.id, "active", e.target.checked)} />
                <span>이 규칙을 켠다</span>
              </label>
              <button type="button" className="btn" disabled={busy === r.id}
                      onClick={() => save(r.id)}>저장</button>
              <Said ok={said[r.id]?.ok} text={said[r.id]?.text} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ⑦ 누가 무엇을 보나 (원장님 2026-09-03)
 *
 * 「역할별로 페이지를 따로 만들지말고 원장이 학부모·학생·강사·조교에게 각각 페이지를
 *   어디까지 오픈할지 온오프 및 세부목록 관리하는 페이지 추가해.」
 * 그리고 곧바로 정정 —
 * 「그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해」
 *
 * ⚠️⚠️ **켬/끔 값이 이 파일에 한 줄도 없다.** 칸의 상태는 전부 서버가 준 `cells` 에서 온다.
 *    안 하면 무엇이 터지나: 여기 하나라도 박아 두면 원장님이 화면에서 끄셔도 다음 배포에
 *    되살아나고, 원장님은 껐다고 믿으신 채로 강사가 수강료를 계속 본다.
 *
 * ⚠️⚠️ **항목 목록을 여기 다시 적지 않는다** (원칙-1 · 검사-⑲). 이름·열쇠·「끄면 무엇이
 *    사라지나」는 전부 `lib/perm.js` 에서 받아 그린다. 적으면 항목을 더한 날 두 벌이 된다.
 *
 * ⚠️ 「아직 안 정함」을 **흐린 글씨로 말하지 않는다** (폰-9 — 글씨에 opacity 금지).
 *    색(노랑)과 글자(「아직 안 정하셨습니다」) 둘 다로 말한다.
 *
 * ⚠️ 폰 — 역할 넷을 **가로로 늘어놓지 않는다.** 역할 하나씩 접었다 편다.
 *    표로 늘어놓으면 폰에서 오른쪽이 잘리고, **잘린 칸은 없는 칸**이 된다.
 *    sticky 도 안 쓴다 — 조상에 overflow 가 있으면 오류 없이 그냥 안 붙는다(폰-3).
 *
 * ⚠️ `confirm()` 을 안 쓴다 (대전제-10). 「전부 끄기」는 **화면 안에서** 한 번 묻는다.
 * ══════════════════════════════════════════════════════════════════ */

/** 칸 하나를 가리키는 이름 — `lib/perm.js` 의 저장값 열쇠와 **같은 모양**이다 */
const 칸이름 = (role, key) => `${role}|${key}`;

/** 세 상태를 **눈으로** 가른다 — 색과 글자 둘 다로 말한다(폰-9) */
const 상태알약 = {
  on: { cls: "pill pillok", text: "켬 — 보입니다" },
  off: { cls: "pill pilloff", text: "끔 — 안 보입니다" },
  unset: { cls: "pill pillwarn", text: "아직 안 정하셨습니다" },
};

export function WhoSees({ roles = [], cells = [] }) {
  // ⚠️ 서버가 준 것으로만 시작한다. `?? "on"` 같은 것을 여기 두면 그것이 곧 박아 둔 기본값이다
  const [state, setState] = useState(() => {
    const m = {};
    for (const c of cells) m[칸이름(c.role, c.key)] = c.state;
    return m;
  });
  const [said, setSaid] = useState({});
  const [busy, setBusy] = useState("");
  const [펼친역할, set펼친역할] = useState("");
  const [묻는역할, set묻는역할] = useState("");     // 「전부 끄기」를 누르기 전에 한 번 묻는 자리

  const 그역할칸 = (role) => cells.filter((c) => c.role === role);
  const 세기 = (role, want) =>
    그역할칸(role).filter((c) => state[칸이름(c.role, c.key)] === want).length;

  /** 여러 칸을 한 번에 바꾼다. **실패하면 그 칸들만 되돌리고 까닭을 그 자리에 띄운다**(속도-5) */
  const 저장 = async (자리, 칸들, allowed, 부르기) => {
    const 되돌릴것 = {};
    for (const c of 칸들) 되돌릴것[칸이름(c.role, c.key)] = state[칸이름(c.role, c.key)];
    setBusy(자리);
    setSaid((s) => ({ ...s, [자리]: null }));
    setState((m) => {
      const next = { ...m };
      for (const c of 칸들) next[칸이름(c.role, c.key)] = allowed ? "on" : "off";
      return next;
    });
    const r = await 부르기();
    setBusy("");
    if (r?.ok) {
      setSaid((s) => ({ ...s, [자리]: { ok: true, text: `${r.n ?? 칸들.length}칸 저장했습니다` } }));
      return;
    }
    setState((m) => ({ ...m, ...되돌릴것 }));
    setSaid((s) => ({ ...s, [자리]: { ok: false, text: r?.why || "저장하지 못했습니다 — 값은 그대로입니다" } }));
  };

  const 한칸 = (c, allowed) =>
    저장(칸이름(c.role, c.key), [c], allowed, () => setRoleAccess(c.role, c.key, allowed));

  const 역할전부 = (role, allowed) => {
    set묻는역할("");
    return 저장(`전부:${role}`, 그역할칸(role), allowed, () => setRoleAll(role, allowed));
  };

  /* ── 원장님이 앞서 하신 말씀 — **안내와 단추일 뿐이다** ─────────────
   * ⚠️⚠️ 안 누르시면 **아무 일도 안 일어난다.** 그 값을 코드에 박는 것을 걷어낸 것이 이번 일이다.
   * ⚠️ 어느 항목인지·무슨 말씀이었는지는 `lib/perm.js` 의 `decided` 에서 온다 — 여기 손으로 안 적는다 */
  const 말씀칸 = cells.filter((c) => c.item?.decided);
  const 말씀 = 말씀칸[0]?.item?.decided ?? "";
  const 말씀남음 = 말씀칸.filter((c) => state[칸이름(c.role, c.key)] !== "off").length;

  if (!cells.length)
    return (
      <p className="muted">
        물어볼 칸이 <span className="num">0</span>개입니다 — <span className="mono">lib/perm.js</span> 의
        항목 목록이 비었다는 뜻입니다. 여기서 지어내지 않습니다.
      </p>
    );

  return (
    <div className="stack">
      {말씀칸.length > 0 && (
        <div className="sunk stack">
          <p style={{ margin: 0 }}>
            <b>{말씀}</b> 라고 하셨습니다.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            누르시면 {말씀칸.map((c) => `${roles.find((r) => r.id === c.role)?.name ?? c.role}의 「${c.item.name}」`).join(" · ")}
            {" "}를 <b>끔</b>으로 저장합니다 (<span className="num">{말씀칸.length}</span>칸).
            ⚠️ 「켜기」는 <b>그 말씀을 켠다</b>는 뜻이지 화면을 연다는 뜻이 아닙니다.
            <b> 안 누르시면 아무 일도 안 일어납니다.</b>
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={busy === "말씀"}
                    onClick={() => 저장("말씀", 말씀칸, false, () => applyDecided())}>
              그대로 켜기
            </button>
            {말씀남음 === 0
              ? <span className="pill pillok">이미 그렇게 정해져 있습니다</span>
              : <span className="pill pillwarn">아직 <span className="num">{말씀남음}</span>칸이 그 말씀과 다릅니다</span>}
            <Said ok={said["말씀"]?.ok} text={said["말씀"]?.text} />
          </div>
        </div>
      )}

      {roles.map((역할) => {
        const 칸들 = 그역할칸(역할.id);
        if (!칸들.length) return null;
        const 펴짐 = 펼친역할 === 역할.id;
        const 안정함 = 세기(역할.id, "unset");
        return (
          <div className={펴짐 ? "acc is-open" : "acc"} key={역할.id}>
            {/* ⚠️ `.btn` 은 글을 안 접는다(nowrap) — 그대로 두면 320px 에서 요약이 **화면 밖으로**
                나간다(검사-㉓). 그래서 이 단추만 접히게 하고 속 글자도 접게 한다.
                ⚠️ 요약을 알약 셋으로 늘어놓지 않는다 — 좁은 폰에서 줄이 세 줄로 뛴다. */}
            <button type="button" className="btn btnghost" aria-expanded={펴짐}
                    onClick={() => set펼친역할(펴짐 ? "" : 역할.id)}
                    style={{ width: "100%", justifyContent: "flex-start", gap: "var(--s2)",
                             flexWrap: "wrap", whiteSpace: "normal",
                             border: 0, borderRadius: "var(--r2)", textAlign: "left" }}>
              <span aria-hidden="true" style={{ color: "var(--mute)" }}>{펴짐 ? "▾" : "▸"}</span>
              <span style={{ whiteSpace: "normal", flex: "1 1 120px" }}>{역할.name}</span>
              <span className="chip">
                켬 <span className="num">{세기(역할.id, "on")}</span> ·
                끔 <span className="num">{세기(역할.id, "off")}</span>
              </span>
              {안정함 > 0
                ? <span className="pill pillwarn">아직 안 정함 <span className="num">{안정함}</span></span>
                : <span className="pill pillok">다 정하셨습니다</span>}
            </button>

            <div className="accbd">
              <div className="stack">
              {/* ⚠️ 역할마다 「지금 이게 진짜로 걸리나」를 `lib/perm.js` 가 적어 둔다.
                  ⚠️⚠️ **`inDb` 로만 가르지 않는다.** 그러면 lib 이 `inDb:true` 로 고치는 날
                  「조교 계정이 아직 한 줄도 없다」 같은 정직한 경고가 **말없이 사라진다**
                  (2026-09-03 에 실제로 그렇게 바뀌었다). 적힌 말이 있으면 그대로 띄운다. */}
              {역할.note ? (
                <p className="sunk" style={{ margin: 0, color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
                  ⚠️ {역할.note}
                </p>
              ) : null}

              {/* ── 전부 켜기 / 전부 끄기 (대전제-3 — 32칸을 하나씩 누르게 하지 않는다) ── */}
              <div className="row">
                <button type="button" className="btn" disabled={busy === `전부:${역할.id}`}
                        onClick={() => 역할전부(역할.id, true)}>
                  {역할.name} 전부 켜기 (<span className="num">{칸들.length}</span>칸)
                </button>
                <button type="button" className="btn btnghost" disabled={busy === `전부:${역할.id}`}
                        onClick={() => set묻는역할(묻는역할 === 역할.id ? "" : 역할.id)}>
                  {역할.name} 전부 끄기…
                </button>
                <Said ok={said[`전부:${역할.id}`]?.ok} text={said[`전부:${역할.id}`]?.text} />
              </div>

              {/* ⚠️ 되돌리기 어려운 쪽이라 **누르기 전에 몇 칸이 꺼지는지** 보여 준다.
                  ⚠️ confirm() 을 안 쓴다 (대전제-10) — 묻는 자리가 화면 안에 선다 */}
              {묻는역할 === 역할.id && (
                <div className="sunk stack">
                  <p style={{ margin: 0 }}>
                    <b>{역할.name}의 <span className="num">{칸들.length}</span>칸이 모두 꺼집니다.</b>{" "}
                    지금 켬 <span className="num">{세기(역할.id, "on")}</span>칸 ·
                    아직 안 정함 <span className="num">{안정함}</span>칸.
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    끄면 {역할.name}은(는) 아래 항목을 하나도 못 봅니다. 되돌리시려면 「전부 켜기」를 누르시면 됩니다.
                  </p>
                  <div className="row">
                    <button type="button" className="btn" disabled={busy === `전부:${역할.id}`}
                            onClick={() => 역할전부(역할.id, false)}>
                      네, {칸들.length}칸을 끕니다
                    </button>
                    <button type="button" className="btn btnghost" onClick={() => set묻는역할("")}>
                      그만두기
                    </button>
                  </div>
                </div>
              )}

              {/* ── 칸 하나씩 ─────────────────────────────────────────── */}
              {칸들.map((c) => {
                const 자리 = 칸이름(c.role, c.key);
                const 알약 = 상태알약[state[자리]] ?? 상태알약.unset;
                return (
                  <div className="sunk stack" key={자리}>
                    <div className="row">
                      <b style={{ flex: "1 1 140px", whiteSpace: "normal" }}>{c.item.name}</b>
                      <span className="mono">{c.key}</span>
                      <span className={알약.cls}>{알약.text}</span>
                    </div>
                    <div className="row">
                      <button type="button" className="btn" disabled={busy === 자리}
                              aria-label={`${c.item.name} 켜기`}
                              onClick={() => 한칸(c, true)}>켜기</button>
                      <button type="button" className="btn btnghost" disabled={busy === 자리}
                              aria-label={`${c.item.name} 끄기`}
                              onClick={() => 한칸(c, false)}>끄기</button>
                      <Said ok={said[자리]?.ok} text={said[자리]?.text} />
                    </div>
                    {/* ⚠️ 「끄면 무엇이 사라지나」를 **그 자리에** 띄운다 —
                        모르고 끄면 강사가 일을 못 하는데 아무도 까닭을 모른다 */}
                    <small className="muted" style={{ whiteSpace: "normal" }}>{c.item.cost}</small>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
