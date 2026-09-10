"use client";
/** 🔌 연동 열쇠(설정 · (터) 원장님 2026-09-10 「웹앱 자체에서 솔라피 연동정보를 바꿀수있어야해 매번 코드바꿀수없어」 · 확정-72) —
 *  원장만 봅니다. 넣어 둔 열쇠는 **가려서만** 보이고(●●●● · 앞 넉 자), 고칠 칸만 적어 저장합니다(빈 칸은 그대로 · 「-」 한 글자면 지웁니다).
 *  (퍼) 원장님 2026-09-10 「저장이안돼 뭔가 자동완성같은데 · 고쳐도 다시 보면 계속 저 화면으로바뀌어」 —
 *  범인은 브라우저 **자동완성**이었다. 비밀 칸을 감추려고 쓰던 것이 짝(아이디+비밀번호)으로 보여서, 크롬이 위 칸에
 *  로그인 이메일(bdyj10@gmail.com)을 · 아래 칸에 로그인 비밀번호를 넣어 열쇠를 덮었다. 그래서
 *  ① 어느 칸도 짝으로 보이지 않게 하고(가리기는 -webkit-text-security 로 한다) ② 칸마다 자동완성 끄기를 붙이고
 *  ③ 틀린 꼴(이메일 · 너무 짧음 · 번호 아님)은 **적는 그 자리에서** 빨갛게 말한다(저장도 막힌다 · lib/integration-plan.js fieldWhyBad). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldNag } from "@/lib/integration-plan";
import { md, seoulDate } from "@/lib/dash-plan";
import { seoulTime } from "@/lib/day-plan";   // 「고침 9/10 23:41」 — 저장이 됐는지 줄에서 바로 보이게(원장님 9/10 「저장눌러도 저장안됨」 — 사실은 저장돼 있었다)
import { saveKeysAct, testSmsAct } from "./actions.js";
/** 자동완성 끄기 한 벌 — 크롬·사파리(autoComplete) · 1Password · LastPass · 대시레인 */
const NOFILL = { autoComplete: "off", spellCheck: false, autoCorrect: "off", autoCapitalize: "off", "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other" };
export default function Keys({ rows = [] }) {
  const router = useRouter(); const [open, setOpen] = useState(null); const [form, setForm] = useState({}); const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [to, setTo] = useState("");
  const edit = (r) => { setOpen(open === r.id ? null : r.id); setForm(Object.fromEntries(r.fields.filter((f) => f.editable).map((f) => [f.k, f.editable]))); setMsg(""); setErr(""); };   // 비밀 아닌 칸(발신번호)은 지금 값을 채워 둔다 — 빈 칸이면 저장한 줄 모르신다
  const save = (id) => start(async () => { setErr(""); setMsg(""); const x = await saveKeysAct(id, form); if (!x.ok) { setErr(x.msg); return; } setMsg(x.text); setOpen(null); setForm({}); router.refresh(); });
  const test = () => start(async () => { setErr(""); setMsg(""); const x = await testSmsAct(to); if (!x.ok) { setErr(x.msg); return; } setMsg(x.sent ? `보냈습니다 — ${x.to}` : x.sink === "off" ? `리허설(NOTIFY_SINK=off)이라 자취만 — ${x.to}` : `못 보냈습니다 — ${x.why}`); router.refresh(); });
  return (<div className="card" data-card="keys" id="keys"><div className="ctitle"><span className="cemo">🔌</span>연동 열쇠 — 여기서 넣고 고칩니다</div>
    <p className="note">넣어 둔 열쇠는 <b>가려서만</b> 보입니다(●●●●). 고칠 칸만 적고 저장하세요 — <b>빈 칸은 그대로</b> 둡니다. 지우려면 그 칸에 <b>-</b> 한 글자.</p>
    {err && <p className="note" role="alert" style={{ color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="keys-msg" style={{ color: "var(--on-ok)" }}>{msg}</p>}
    <div className="left">{rows.map((r) => (<div key={r.id} data-g="key-row" data-key={r.id} data-ready={r.ready ? "1" : "0"}>
      <div className="lf"><span className="ln">{r.emo}</span>
        <div><b>{r.name}</b><small data-g="key-sum">{r.ready ? r.fields.map((f) => `${f.label} ${f.shown}`).join(" · ") : `아직: ${r.missing.join(" · ")}`}</small>
          {r.bad?.length > 0 && <small data-g="key-bad" role="alert" style={{ color: "var(--miss)" }}>{r.bad.join(" · ")}</small>}</div>
        {r.updated_at && <span className="tag" data-g="key-saved" title="마지막으로 저장한 때">고침 {md(seoulDate(r.updated_at))} {seoulTime(r.updated_at)}</span>}
        <span className={"tag" + (r.bad?.length ? "" : r.ready ? " on" : "")} data-g="key-state" style={r.bad?.length ? { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" } : undefined}>{r.bad?.length ? "고쳐야 함" : r.ready ? "켜짐" : "안 켜짐"}</span>
        <button className="btn sm" type="button" data-act="key-edit" aria-pressed={open === r.id} onClick={() => edit(r)}>{open === r.id ? "닫기" : "고치기"}</button></div>
      {open === r.id && <div className="card" style={{ margin: "4px 0 8px" }} data-g="key-form">
        <p className="note k" style={{ marginTop: 0 }}>{r.why} {r.site && <a href={r.site} target="_blank" rel="noreferrer">{r.site} ↗</a>}</p>
        {r.fields.map((f) => { const v = form[f.k] ?? "", why = fieldNag(f, v); return (<div className="wv" key={f.k}><label className="fl" style={{ margin: 0, minWidth: 90 }}>{f.label}</label>
          <input type={f.k === "from" ? "tel" : "text"} value={v} {...NOFILL} aria-label={f.label} name={`key-${f.k}`} aria-invalid={why ? "true" : undefined}
            placeholder={f.secret || f.peek ? (f.filled ? "넣어 두었습니다 — 바꿀 때만 적으세요" : f.hint || "") : f.hint || ""} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
            style={{ flex: "1 1 200px", ...(f.secret ? { WebkitTextSecurity: "disc" } : null), ...(why ? { borderColor: "var(--miss)" } : null) }} />
          {v !== "" && <button className="btn sm" type="button" data-act="key-clear" aria-label={`${f.label} 비우기`} onClick={() => setForm({ ...form, [f.k]: "" })}>✕</button>}
          {why && <small className="note" role="alert" data-g="key-why" style={{ flexBasis: "100%", margin: 0, color: "var(--miss)" }}>{why}</small>}
        </div>); })}
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
