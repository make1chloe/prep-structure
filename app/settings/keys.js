"use client";
/** 🔌 연동 열쇠(설정 · (터) 원장님 2026-09-10 「웹앱 자체에서 솔라피 연동정보를 바꿀수있어야해 매번 코드바꿀수없어」 · 확정-72) —
 *  원장만 봅니다. 넣어 둔 열쇠는 **가려서만** 보이고(●●●● · 앞 넉 자), 고칠 칸만 적어 저장합니다(빈 칸은 그대로 · 「-」 한 글자면 지웁니다) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveKeysAct, testSmsAct } from "./actions.js";
export default function Keys({ rows = [] }) {
  const router = useRouter(); const [open, setOpen] = useState(null); const [form, setForm] = useState({}); const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [to, setTo] = useState("");
  const edit = (r) => { setOpen(open === r.id ? null : r.id); setForm({}); setMsg(""); setErr(""); };
  const save = (id) => start(async () => { setErr(""); setMsg(""); const x = await saveKeysAct(id, form); if (!x.ok) { setErr(x.msg); return; } setMsg(x.text); setOpen(null); setForm({}); router.refresh(); });
  const test = () => start(async () => { setErr(""); setMsg(""); const x = await testSmsAct(to); if (!x.ok) { setErr(x.msg); return; } setMsg(x.sent ? `보냈습니다 — ${x.to}` : x.sink === "off" ? `리허설(NOTIFY_SINK=off)이라 자취만 — ${x.to}` : `못 보냈습니다 — ${x.why}`); router.refresh(); });
  return (<div className="card" data-card="keys" id="keys"><div className="ctitle"><span className="cemo">🔌</span>연동 열쇠 — 여기서 넣고 고칩니다</div>
    <p className="note">넣어 둔 열쇠는 <b>가려서만</b> 보입니다(●●●●). 고칠 칸만 적고 저장하세요 — <b>빈 칸은 그대로</b> 둡니다. 지우려면 그 칸에 <b>-</b> 한 글자.</p>
    {err && <p className="note" role="alert" style={{ color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="keys-msg" style={{ color: "var(--on-ok)" }}>{msg}</p>}
    <div className="left">{rows.map((r) => (<div key={r.id} data-g="key-row" data-key={r.id} data-ready={r.ready ? "1" : "0"}>
      <div className="lf"><span className="ln">{r.emo}</span>
        <div><b>{r.name}</b><small>{r.ready ? r.fields.map((f) => `${f.label} ${f.shown}`).join(" · ") : `아직: ${r.missing.join(" · ")}`}</small></div>
        <span className={"tag" + (r.ready ? " on" : "")} data-g="key-state">{r.ready ? "켜짐" : "안 켜짐"}</span>
        <button className="btn sm" type="button" data-act="key-edit" aria-pressed={open === r.id} onClick={() => edit(r)}>{open === r.id ? "닫기" : "고치기"}</button></div>
      {open === r.id && <div className="card" style={{ margin: "4px 0 8px" }} data-g="key-form">
        <p className="note k" style={{ marginTop: 0 }}>{r.why} {r.site && <a href={r.site} target="_blank" rel="noreferrer">{r.site} ↗</a>}</p>
        {r.fields.map((f) => (<div className="wv" key={f.k}><label className="fl" style={{ margin: 0, minWidth: 90 }}>{f.label}</label>
          <input type={f.secret ? "password" : "text"} value={form[f.k] ?? ""} autoComplete="off" aria-label={f.label} name={`key-${f.k}`}
            placeholder={f.filled ? "넣어 두었습니다 — 바꿀 때만 적으세요" : f.hint || ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} style={{ flex: "1 1 200px" }} />
        </div>))}
        <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><button className="btn pri" type="button" disabled={pending} data-act="key-save" onClick={() => save(r.id)}>저장</button>
          <button className="btn" type="button" onClick={() => setOpen(null)}>닫기</button></div>
      </div>}
      {r.id === "solapi" && <div className="wv" style={{ margin: "0 0 8px 26px" }} data-g="sms-test">
        <input type="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="시험 보낼 번호 010…" aria-label="시험 보낼 번호" name="test-to" style={{ maxWidth: 170 }} />
        <button className="btn sm" type="button" disabled={pending || !r.ready || !to.trim()} data-act="sms-test" onClick={test}>✉️ 시험 한 통</button>
        {r.last_ok_at && <span className="tag on" data-g="last-ok">마지막 성공 {String(r.last_ok_at).slice(0, 16).replace("T", " ")}</span>}
        {r.last_error && <span className="tag" data-g="last-error" style={{ background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" }}>{r.last_error}</span>}
      </div>}
    </div>))}</div>
  </div>);
}
