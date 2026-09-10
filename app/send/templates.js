"use client";
/** ✉️ 문자 문구(발송 10 · (커) 원장님 2026-09-10 「기본 틀은 너가 짜 돼 내가 자유롭게 내용을 추가 수정 할 수 있게 해 줘」 · 확정-71) —
 *  틀을 펼쳐 고치고 저장한다. 글자 수·갈래(SMS/LMS)는 서버와 같은 셈(lib/sms-plan) · 치환 자리는 눌러서 넣는다 · 「덧붙임」은 비면 그 줄이 사라진다 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplateAct, smsKindsAct } from "./actions.js";
import { lenText, templateName, SMS_ALSO } from "@/lib/sms-plan";
export default function Templates({ items = [], ready = false, placeholders = [], kinds = [] }) {
  const router = useRouter(); const [open, setOpen] = useState(null); const [text, setText] = useState(""); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const edit = (t) => { setOpen(open === t.kind ? null : t.kind); setText(t.body ?? ""); setErr(""); setMsg(""); };
  const save = (kind) => start(async () => { setErr(""); setMsg(""); const r = await saveTemplateAct(kind, text); if (!r.ok) { setErr(r.msg); return; } setMsg(`${templateName(kind)} 문구를 저장했습니다`); setOpen(null); router.refresh(); });
  const put = (tag) => setText((t) => `${t}${t.endsWith("\n") || !t ? "" : "\n"}${tag}`);
  const len = lenText(text);
  return (<div className="sgrp" data-card="templates">
    <div className="sgh"><b>✉️ 문자 문구 — 고쳐서 쓰십니다</b><span className="spacer" />
      {ready ? <span className="pill" data-g="sms-ready">문자 길 켜짐(솔라피)</span>
             : <Link prefetch={false} className="pill warn" href="/settings#keys" data-g="sms-ready" data-act="to-keys">문자 길 없음 — 설정에서 넣기 ↗</Link>}</div>
    <div className="wv" style={{ margin: "0 0 8px" }} data-g="sms-kinds">
      <span className="note" style={{ margin: 0 }}>앱 알림과 <b>함께 문자로도</b> 보낼 것 —</span>
      {SMS_ALSO.map(([k, name]) => { const on = kinds.includes(k);
        return <button key={k} className={"btn sm" + (on ? " pri" : "")} type="button" data-act="sms-kind" data-kind={k} aria-pressed={on} disabled={pending}
          onClick={() => start(async () => { setErr(""); setMsg(""); const next = on ? kinds.filter((x) => x !== k) : [...kinds, k];
            const r = await smsKindsAct(next); if (!r.ok) { setErr(r.msg); return; } setMsg(r.kinds.length ? `문자로도: ${r.kinds.map((x) => SMS_ALSO.find(([y]) => y === x)?.[1] ?? x).join(" · ")}` : "문자로도 보내는 갈래가 없습니다(앱 알림만)"); router.refresh(); })}>{on ? "✓ " : ""}{name}</button>; })}
      <span className="note k" style={{ margin: 0 }}>학부모 전화가 있고 문자 길이 켜져 있을 때만 나갑니다 · 앱 알림은 늘 그대로</span></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="tpl-msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {!items.length && <p className="note" style={{ margin: 0 }}>문구가 없습니다 — 표 0154 를 넣으면 기본 틀이 섭니다.</p>}
    {items.map((t) => (<div key={t.kind} data-g="tpl-row" data-kind={t.kind}>
      <div className="srow"><span className="si">✉️</span><div className="sn"><b>{t.title || templateName(t.kind)}</b><small>{lenText(t.body ?? "").text} · {String(t.body ?? "").split("\n")[0].slice(0, 40)}…</small></div>
        <button className="btn sm" type="button" data-act="tpl-edit" aria-pressed={open === t.kind} onClick={() => edit(t)}>{open === t.kind ? "닫기" : "고치기"}</button></div>
      {open === t.kind && <div className="card" style={{ margin: "4px 0 8px" }} data-g="tpl-form">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} aria-label={`${t.title || t.kind} 문구`} name="tpl-body" style={{ width: "100%", fontFamily: "inherit" }} />
        <div className="wv" style={{ marginTop: 6 }}><span className={"pill" + (len.over ? " warn" : "")} data-g="tpl-len">{len.text}</span>
          <span className="note" style={{ margin: 0 }}>90바이트까지 단문(SMS) · 넘으면 장문(LMS)으로 나갑니다</span></div>
        <div className="tags" style={{ marginTop: 6 }} data-g="tpl-tags">{(placeholders ?? []).map((p) => <button key={p.key} className="tag" type="button" data-act="tpl-put" title={`${p.note}${p.example ? ` (예: ${p.example})` : ""}`} onClick={() => put(`{{${p.key}}}`)}>{`{{${p.key}}}`}</button>)}</div>
        <p className="note k" style={{ margin: "4px 0 0" }}>칩을 누르면 그 자리가 글 끝에 들어갑니다 · <b>{"{{덧붙임}}"}</b> 은 아이마다 다른 말(등록 전환에서 적습니다 — 비면 그 줄이 사라집니다)</p>
        <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><button className="btn pri" type="button" disabled={pending || !text.trim() || len.over} data-act="tpl-save" onClick={() => save(t.kind)}>저장</button>
          <button className="btn" type="button" onClick={() => setOpen(null)}>닫기</button></div>
      </div>}
    </div>))}
  </div>);
}
