"use client";
/** 신규 상담 판(목업 18) — 머리(답 안 한 문의 N · + 전화 문의 받기) · 칸 다섯(🔥 오늘 답할 것 · 상담 잡힘 · 레벨 봄 · 등록 · 안 옴) · 카드(학년·학교 · 연락 가림 · 물음 · 방문 · 레벨 · 점수 · 제안 · 왜) · 📨 안내 보내기 · 방문·레벨 잡기 · 점수·제안 · 등록 전환(반 · 교재 · 아이디 → 일곱이 저절로) · 안 옴 사유 · 일곱 설명 카드. 세는 것은 lib/inquiry-plan 한 벌 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAct, setAct, answerAct, stageAct, convertAct } from "./actions.js";
import { columnsOf, WAYS, SEVEN, parseConvert } from "@/lib/inquiry-plan";
import { suggestLoginId } from "@/lib/student-plan";
import { classText } from "@/lib/schedule-plan";
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date;
  const [addOpen, setAddOpen] = useState(false); const [nf, setNf] = useState({ name: "", phone: "", studentPhone: "", school: "", grade: "", way: "phone", body: "" }); const [ed, setEd] = useState({}); const [conv, setConv] = useState(null); const [cv, setCv] = useState({ classId: "", bookIds: [], loginId: "", joinedOn: today }); const [steps, setSteps] = useState(null);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(r); router.refresh(); });
  const cols = useMemo(() => columnsOf(b.inquiries ?? [], today, new Date().toISOString()), [b, today]);
  const v = (id, k, dflt = "") => ed[`${id}|${k}`] ?? dflt; const setV = (id, k, val) => setEd({ ...ed, [`${id}|${k}`]: val });
  const toLocal = (ts) => ts ? new Date(new Date(ts).getTime() + 9 * 3600000).toISOString().slice(0, 16) : "";
  const fromLocal = (s) => (s ? new Date(`${s}:00+09:00`).toISOString() : null);
  const convCard = conv ? (b.inquiries ?? []).find((q) => q.id === conv) : null;
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head"><span className="pill" style={{ fontWeight: 700 }}>☎️ 신규 상담</span><span className={"pill" + (cols.unanswered ? " warn" : "")} data-g="unanswered">답 안 한 문의 {cols.unanswered}</span><span className="spacer" /><button className="btn pri sm" type="button" data-act="add-open" onClick={() => setAddOpen(!addOpen)}>+ 전화 문의 받기</button><a className="btn sm" href="/ops/students">🧑‍🎓 학생 ↗</a></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {addOpen && <div className="card" data-g="add-form"><div className="ctitle"><span className="cemo">☎️</span>전화 끊고 바로 — 이름 · 학부모 전화 · 학교 · 학년 · 어디서 · 물음</div>
      <div className="wv"><input type="text" value={nf.name} placeholder="이름" aria-label="이름" onChange={(x) => setNf({ ...nf, name: x.target.value })} style={{ maxWidth: 140 }} /><input type="text" inputMode="numeric" value={nf.phone} placeholder="학부모 전화" aria-label="학부모 전화" onChange={(x) => setNf({ ...nf, phone: x.target.value })} style={{ maxWidth: 150 }} /><input type="text" value={nf.school} placeholder="학교" aria-label="학교" onChange={(x) => setNf({ ...nf, school: x.target.value })} style={{ maxWidth: 140 }} /><input type="text" inputMode="numeric" className="scr" value={nf.grade} placeholder="학년" aria-label="학년" onChange={(x) => setNf({ ...nf, grade: x.target.value.replace(/\D/g, "") })} />
        <select value={nf.way} aria-label="어디서" onChange={(x) => setNf({ ...nf, way: x.target.value })} style={{ width: "auto" }}>{WAYS.map(([k, nm]) => <option key={k} value={k}>{nm}</option>)}</select></div>
      <div className="wv" style={{ marginTop: 6 }}><input type="text" value={nf.body} placeholder="물음 — 주 2회 되나요 · 수업료" aria-label="물음" onChange={(x) => setNf({ ...nf, body: x.target.value })} style={{ flex: "1 1 260px" }} /><button className="btn pri sm" type="button" disabled={pending || !nf.name.trim() || !nf.phone.trim()} data-act="add-save" onClick={() => run(() => addAct(nf), "문의를 받았습니다 — 🔥 오늘 답할 것", () => { setAddOpen(false); setNf({ name: "", phone: "", studentPhone: "", school: "", grade: "", way: "phone", body: "" }); })}>저장</button></div></div>}
    <div className="kb" data-g="kb">
      {cols.columns.map((col) => <div className={"col" + (col.urgent ? " urg" : "")} key={col.key} data-g="col" data-stage={col.key}><div className="colh">{col.label} <span className="n" data-g="col-count">{col.cards.length}</span></div>
        {col.cards.map((q) => <div className={"kc" + (q.hot ? " hot" : "")} key={q.id} data-g="card" data-id={q.id} data-hot={q.hot ? "1" : "0"}><b>{q.name}{q.stage === "new" ? " 어머니" : ""}</b>
          <div className="sub">{q.stage === "new" ? `${q.when} · ${q.wayText}` : q.stage === "joined" ? `${q.student ? `${q.student} · ` : ""}등록` : q.sub}</div>
          {q.stage === "new" && <div className="kv"><span>학년</span>{q.sub || "—"}</div>}
          <div className="kv"><span>연락</span>{q.phoneText || "—"}</div>
          {q.body && <div className="kv"><span>물음</span>{q.body}</div>}
          {["visit", "test"].includes(q.stage) && <><div className="kv"><span>방문</span>{q.visitText}</div><div className="kv"><span>레벨</span>{q.testText}</div></>}
          {q.stage === "test" && <><div className="kv"><span>점수</span>{q.level_note ?? "—"}</div><div className="kv"><span>제안</span>{q.suggest ?? "—"}</div></>}
          <div className="why" data-g="why">{q.why}</div>
          {q.stage === "new" && <>{!q.answered_at && <button className="btn pri sm" type="button" style={{ marginTop: 8, width: "100%" }} disabled={pending} data-act="answer" onClick={() => run(() => answerAct(q.id), "안내 보냄으로 적었습니다(문자는 아직 — 전화·카톡으로)")}>📨 안내 보내기</button>}
            <div className="wv" style={{ marginTop: 6, gap: 4 }}><input type="datetime-local" value={v(q.id, "visit", toLocal(q.visit_at))} aria-label={`${q.name} 방문`} onChange={(x) => setV(q.id, "visit", x.target.value)} style={{ width: "auto" }} /><button className="btn sm" type="button" disabled={pending || !v(q.id, "visit")} data-act="visit-save" onClick={() => run(() => setAct(q.id, { visitAt: fromLocal(v(q.id, "visit")) }, q.updated_at ?? null), "방문을 잡았습니다 — 상담 잡힘")}>방문 잡기</button><button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={() => run(() => stageAct(q.id, "dropped", v(q.id, "why", "")), "안 옴으로")}>안 옴</button></div></>}
          {q.stage === "visit" && <div className="wv" style={{ marginTop: 6, gap: 4 }}><input type="datetime-local" value={v(q.id, "test", toLocal(q.test_at))} aria-label={`${q.name} 레벨`} onChange={(x) => setV(q.id, "test", x.target.value)} style={{ width: "auto" }} /><button className="btn sm" type="button" disabled={pending || !v(q.id, "test")} data-act="test-save" onClick={() => run(() => setAct(q.id, { testAt: fromLocal(v(q.id, "test")) }, q.updated_at ?? null), "레벨테스트를 잡았습니다")}>레벨 잡기</button>
            <input type="text" value={v(q.id, "level", q.level_note ?? "")} placeholder="점수 — 단어 32/40 · 문법 18/25" aria-label={`${q.name} 점수`} onChange={(x) => setV(q.id, "level", x.target.value)} style={{ flex: "1 1 160px" }} /><button className="btn sm pri" type="button" disabled={pending || !v(q.id, "level")} data-act="level-save" onClick={() => run(() => setAct(q.id, { levelNote: v(q.id, "level") }, q.updated_at ?? null), "점수를 적었습니다 — 레벨 봄")}>점수</button><button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={() => run(() => stageAct(q.id, "dropped", v(q.id, "why", "")), "안 옴으로")}>안 옴</button></div>}
          {q.stage === "test" && <div className="wv" style={{ marginTop: 6, gap: 4 }}><input type="text" value={v(q.id, "suggest", q.suggest ?? "")} placeholder="제안 — 중등3800제2 · 수능딥독1" aria-label={`${q.name} 제안`} onChange={(x) => setV(q.id, "suggest", x.target.value)} style={{ flex: "1 1 160px" }} /><button className="btn sm" type="button" disabled={pending || !v(q.id, "suggest")} data-act="suggest-save" onClick={() => run(() => setAct(q.id, { suggest: v(q.id, "suggest") }, q.updated_at ?? null), "제안을 적었습니다")}>제안</button>
            <button className="btn sm pri" type="button" style={{ width: "100%" }} data-act="convert-open" onClick={() => { setConv(q.id); setSteps(null); setCv({ classId: "", bookIds: [], loginId: suggestLoginId({ phone: q.student_phone, parent_phone: q.phone }, today), joinedOn: today }); }}>등록 전환 ↗</button><button className="btn sm" type="button" disabled={pending} data-act="drop" onClick={() => run(() => stageAct(q.id, "dropped", v(q.id, "why", "")), "안 옴으로")}>안 옴</button></div>}
          {q.stage === "joined" && q.student_id && <a className="btn sm" style={{ marginTop: 8, width: "100%", display: "block", textAlign: "center" }} href={`/ops/students?s=${q.student_id}`} data-act="open-student">학생 화면 ↗</a>}
          {q.stage === "dropped" && <div className="wv" style={{ marginTop: 6, gap: 4 }}><input type="text" value={v(q.id, "why", q.why ?? "")} placeholder="사유 — 다른 학원 · 시간이 안 맞음" aria-label={`${q.name} 사유`} onChange={(x) => setV(q.id, "why", x.target.value)} style={{ flex: "1 1 160px" }} /><button className="btn sm" type="button" disabled={pending} data-act="why-save" onClick={() => run(() => setAct(q.id, { why: v(q.id, "why") }, q.updated_at ?? null), "사유를 적었습니다")}>사유</button></div>}
        </div>)}
        {!col.cards.length && <div className="kc" style={{ opacity: 0.6 }}><div className="sub">없음</div></div>}
      </div>)}
    </div>
    {convCard && <div className="mdlov" data-g="convert" onClick={(x) => { if (x.target === x.currentTarget) setConv(null); }}><div className="mdl" style={{ maxWidth: 560 }}>
      <div className="mdlh"><b>✅ 등록 전환 — {convCard.name}</b><span className="spacer" /><button className="btn sm" type="button" onClick={() => setConv(null)}>닫기</button></div>
      <div className="mdlb">
        {!steps && <>
          <div className="wv"><label className="fl" style={{ margin: 0 }}>반</label><select value={cv.classId} aria-label="반" data-g="conv-class" onChange={(x) => setCv({ ...cv, classId: x.target.value })} style={{ width: "auto" }}><option value="">반 고르기</option>{(b.classes ?? []).map((c) => <option key={c.id} value={c.id}>{classText({ nickname: c.nickname, weekdays: c.weekdays ?? [], start_time: c.start_time })}</option>)}</select>
            <label className="fl" style={{ margin: 0 }}>들어온 날</label><input type="date" className="dt" value={cv.joinedOn} aria-label="들어온 날" onChange={(x) => setCv({ ...cv, joinedOn: x.target.value })} style={{ width: "auto" }} /></div>
          <div className="fl">교재 잇기{convCard.suggest ? ` — 제안: ${convCard.suggest}` : ""}</div>
          <div className="tags" data-g="conv-books">{(b.books ?? []).map((bk) => <label key={bk.id} className="ckl"><input type="checkbox" className="ck" checked={cv.bookIds.includes(bk.id)} onChange={() => setCv({ ...cv, bookIds: cv.bookIds.includes(bk.id) ? cv.bookIds.filter((x) => x !== bk.id) : [...cv.bookIds, bk.id] })} /> {bk.name}</label>)}</div>
          <div className="wv" style={{ marginTop: 6 }}><label className="fl" style={{ margin: 0 }}>학생 아이디</label><input type="text" value={cv.loginId} aria-label="학생 아이디" data-g="conv-login" onChange={(x) => setCv({ ...cv, loginId: x.target.value })} style={{ maxWidth: 160 }} /><span className="note" style={{ margin: 0 }}>chloe + 숫자 넷 · 학부모 아이디는 전화번호 {convCard.phone} · 첫 비밀번호 0000</span></div>
          <p className="note k" style={{ margin: "8px 0 0" }}>한 번 누르면 일곱이 저절로 — {SEVEN.map(([, nm]) => nm).join(" · ")}</p>
        </>}
        {steps && <div className="seven" data-g="steps">{SEVEN.map(([key, nm, desc], i) => { const s = steps.find((x) => x.key === key); return <div className="sv" key={key} data-g="step" data-key={key} data-ok={s ? (s.ok ? "1" : "0") : "-"}><i>{i + 1}</i><b>{nm} {s ? (s.ok ? "✓" : "✕") : ""}</b><span>{s ? s.text : desc}</span></div>; })}</div>}
      </div>
      <div className="mdlf">{steps && convCard.student_id ? <a className="btn" href={`/ops/students?s=${convCard.student_id}`}>학생 화면 ↗</a> : null}<span className="spacer" />{!steps && <button className="btn pri" type="button" disabled={pending || !cv.classId || !cv.loginId} data-act="convert-save" onClick={() => { try { parseConvert(cv); } catch (e) { setErr(String(e.message)); return; } run(() => convertAct(convCard.id, cv), (r) => `등록 전환 — 일곱 중 ${r.done} 됐습니다`, (r) => setSteps(r.steps)); }}>등록 전환</button>}{steps && <button className="btn" type="button" onClick={() => setConv(null)}>닫기</button>}</div>
    </div></div>}
    <div className="card" style={{ marginTop: 12 }} data-g="seven-card"><div className="ctitle"><span className="cemo">✅</span>등록 전환 — 한 번 누르면 일곱이 저절로</div>
      <div className="seven">{SEVEN.map(([key, nm, desc], i) => <div className="sv" key={key}><i>{i + 1}</i><b>{nm}</b><span>{desc}</span></div>)}</div></div>
  </>;
}
