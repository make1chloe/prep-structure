"use client";
/** (어64) 설정 › 👤 직원 계정 판 — 원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한」 · 「근데 선생님조교어디서추가해」.
 *  여기서 하는 것은 셋뿐이다: 계정 내기 · 역할 바꾸기 · 닫기·복구. **볼 것**은 옆의 🔐 「누가 무엇을 보나」가 이미 정한다(원칙-1).
 *  역할 세그는 누르면 먼저 바뀌고 실패면 되돌린다(속도-3) · 지우는 단추는 없다(대전제-6). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_NAME } from "@/lib/roles";
import { STAFF_ROLES, staffIdNag, staffState } from "@/lib/staff-plan";
import { FIRST_PW } from "@/lib/student-plan";   // 첫 비밀번호는 한 곳((어65))
import { staffIssue, staffRole, staffOpen } from "./actions.js";
const EMO = { [ROLES.PRINCIPAL]: "👑", [ROLES.INSTRUCTOR]: "🧑‍🏫", [ROLES.ASSISTANT]: "🧰" };

export default function Board({ rows = [], meId = null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(""); const [made, setMade] = useState(null);
  const [open, setOpen] = useState(false); const [f, setF] = useState({ name: "", loginId: "", role: ROLES.INSTRUCTOR });
  const [roleOf, setRoleOf] = useState({});   // 누른 즉시 바뀌는 역할(속도-3)
  const nag = staffIdNag(f.loginId);
  const roleAt = (p) => roleOf[p.id] ?? p.role;

  const run = (fn, then) => start(async () => { setErr(""); const r = await fn(); if (!r?.ok) { setErr(r?.msg ?? "안 됨"); return false; } then?.(r); router.refresh(); return true; });
  const pickRole = (p, k) => { const prev = roleAt(p); if (prev === k) return; setRoleOf((o) => ({ ...o, [p.id]: k }));
    start(async () => { setErr(""); const r = await staffRole(p.id, k); if (!r?.ok) { setErr(r?.msg ?? "안 됨"); setRoleOf((o) => ({ ...o, [p.id]: prev })); return; } router.refresh(); }); };
  const issue = () => run(() => staffIssue({ name: f.name, loginId: f.loginId, role: f.role }),
    (r) => { setMade(r); setF({ name: "", loginId: "", role: ROLES.INSTRUCTOR }); setOpen(false); });

  return (<div className="card" data-card="staff">
    <div className="ctitle"><span className="cemo">👤</span>직원 계정</div>
    {err && <p className="note" role="alert" data-g="staff-err" style={{ color: "var(--miss)" }}>{err}</p>}
    {made && <p className="note" data-g="staff-made" style={{ color: "var(--on-ok)" }}>{made.name} · {ROLE_NAME[made.role]} · 아이디 <b>{made.login_id}</b> · {made.password ? <>첫 비밀번호 <b>{made.password}</b></> : <>이어 붙임 · 비밀번호는 쓰던 것 그대로</>}</p>}
    <div className="left" data-g="staff-list">
      {rows.map((p) => { const boss = p.role === ROLES.PRINCIPAL, shut = p.state !== "active"; return (
        <div className="lf" key={p.id} data-g="staff-row" data-staff={p.id} data-role={roleAt(p)} data-state={p.state}>
          <span className="ln">{EMO[roleAt(p)] ?? "🧑"}</span>
          <div><b style={shut ? { textDecoration: "line-through", color: "var(--mute)" } : undefined}>{p.name}</b><small>{p.login_id ?? ""}</small></div>
          <span className="spacer" />
          {boss ? <span className="tag" data-g="staff-role">{ROLE_NAME[p.role]}</span>
            : <div className="seg sm" role="group" aria-label={`${p.name} 역할`}>
                {STAFF_ROLES.map(([k, nm]) => <button key={k} type="button" data-act="staff-role" data-r={k} disabled={pending || shut} aria-pressed={roleAt(p) === k} onClick={() => pickRole(p, k)}>{nm}</button>)}
              </div>}
          {!boss && <>
            <span className={"tag" + (shut ? "" : " on")} data-g="staff-state">{staffState(p)}</span>
            <button className="btn sm" type="button" data-act="staff-open" disabled={pending || p.id === meId}
              onClick={() => run(() => staffOpen(p.id, shut ? "active" : "left"))}>{shut ? "복구" : "닫기"}</button></>}
        </div>); })}
    </div>
    <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}>
      <button className="btn pri" type="button" data-act="staff-new" aria-pressed={open} onClick={() => { setOpen(!open); setMade(null); setErr(""); }}>{open ? "닫기" : "+ 직원"}</button>
    </div>
    {open && <div className="card" style={{ margin: "8px 0 0" }} data-g="staff-form">
      <div className="wv"><label className="fl" htmlFor="staff-name" style={{ margin: 0, minWidth: 60 }}>이름</label>
        <input id="staff-name" name="staff-name" value={f.name} autoComplete="off" onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 140px" }} /></div>
      <div className="wv"><label className="fl" htmlFor="staff-id" style={{ margin: 0, minWidth: 60 }}>아이디</label>
        <input id="staff-id" name="staff-id" value={f.loginId} autoComplete="off" placeholder="park1" aria-invalid={nag ? "true" : undefined}
          onChange={(e) => setF({ ...f, loginId: e.target.value })} style={{ flex: "1 1 140px", ...(nag ? { borderColor: "var(--miss)" } : null) }} />
        {nag && <small className="note" role="alert" data-g="staff-nag" style={{ flexBasis: "100%", margin: 0, color: "var(--miss)" }}>{nag}</small>}</div>
      <div className="wv"><span className="fl" style={{ margin: 0, minWidth: 60 }}>역할</span>
        <div className="seg sm" role="group" aria-label="역할">
          {STAFF_ROLES.map(([k, nm]) => <button key={k} type="button" data-act="staff-pick" data-r={k} aria-pressed={f.role === k} onClick={() => setF({ ...f, role: k })}>{nm}</button>)}</div></div>
      <div className="wv" style={{ marginBottom: 0 }}>
        <button className="btn pri" type="button" data-act="staff-issue" disabled={pending || !f.name.trim() || !f.loginId.trim() || !!nag} onClick={issue}>계정 발급</button>
        <span className="tag" data-g="staff-firstpw">첫 비밀번호 {FIRST_PW}</span></div>
    </div>}
  </div>);
}
