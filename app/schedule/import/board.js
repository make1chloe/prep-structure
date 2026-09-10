"use client";
/** 받아오기 판(목업 12b) — 전국(학교를 안 붙인다) · 학교별(학교 × 학년 · 영어 시험일은 손으로) · 나이스에 없는 학교(찾아서 코드 붙이기 · 홈페이지 주소) · 손으로 넣기 · 덮지 않는다 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importAct, examWordAct, siteUrlAct, englishOnAct, examAct, searchSchoolsAct, schoolCodeAct, cancelExamAct } from "../actions.js";
import { md, seoulDate, changeText } from "@/lib/dash-plan";
import { weekdayName } from "@/lib/day-plan";
import { LEVEL_CHAR } from "@/lib/neis-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
const srcTag = (e) => (e.source === "neis" ? <span className="tag on">나이스</span> : e.source === "site" ? <span className="tag act">홈페이지에서</span> : <span className="tag" style={MISS}>손으로</span>);
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board; const [word, setWord] = useState(""); const [urls, setUrls] = useState({}); const [eng, setEng] = useState({}); const [manual, setManual] = useState(false);
  const [exam, setExam] = useState({ scope: "school", schoolId: b.schools?.[0]?.id ?? "", grade: "", name: "", termFrom: d.date, termTo: d.date, englishOn: "" });
  const [find, setFind] = useState({ schoolId: "", q: "", rows: null });
  const run = (fn, okMsg = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); router.refresh(); });
  const nat = (b.exams ?? []).filter((e) => e.scope === "national"), sch = (b.exams ?? []).filter((e) => e.scope === "school");
  const noNeis = (b.schools ?? []).filter((s) => !s.neis_code || Number(s.neis_exams ?? 0) === 0);
  const gradeText = (e, s) => (e.grade ? `${LEVEL_CHAR[s?.level] ?? ""}${e.grade}` : "전 학년");
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }} data-g="last">나이스 · {b.last_neis_at ? `${md(seoulDate(b.last_neis_at))} 받음` : "아직 안 받음"}</span>
      <span className="pill">학교 {(b.schools ?? []).length}곳</span>
      <span className="spacer" />
      <Link prefetch={false} className="btn sm" href="/schedule">📅 일정 ↗</Link><Link prefetch={false} className="btn sm" href="/schedule/exams">🏫 시험 회차 ↗</Link>
      <button className="btn sm pri" type="button" disabled={pending || !b.neis_key} data-act="import" title={b.neis_key ? "코드 있는 학교 전부 · 이 학년도" : "나이스 열쇠가 없습니다 — 연동(neis)의 key"} onClick={() => run(() => importAct(), (r) => `받았습니다 — 학교 ${r.r.schools}곳 · 회차 ${r.r.put}줄${r.r.changed?.length ? ` · 📡 날짜 바뀐 회차 ${r.r.changed.length}(${r.r.changed.map((c) => `${c.school ? c.school + " " : ""}${c.name} ${changeText(c)}`).join(" / ")}) — 시험 회차에서 보고 「봤음」` : ""} · 건너뜀(쉬는 날 ${r.r.skipped.off} · 행사 ${r.r.skipped.event} · 평가 ${r.r.skipped.assess})${r.r.failed.length ? ` · 못 받음: ${r.r.failed.join(" / ")}` : ""}`)}>🔄 다시 받기</button>
    </div>
    {!b.neis_key && <p className="note" data-g="no-key">나이스 열쇠가 없습니다 — <Link prefetch={false} href="/settings#keys" data-act="to-keys"><b>설정 → 🔌 연동 열쇠 ↗</b></Link> 에서 넣으면 「다시 받기」가 켜집니다((터)).</p>}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="nsplit">
      <div className="nbox nat" data-g="national">
        <div className="nh2"><span className="ai">🌏</span><b>전국 — 학교를 안 붙입니다</b><span className="spacer" /><span className="tag on">한 줄이 전 학생에게</span></div>
        {!nat.length && <p className="note">아직 없습니다 — 받아오거나 손으로 넣으세요.</p>}
        {nat.map((e) => <div key={e.id} className="nrow" data-g="nat-row"><span className="nd2">{md(e.term_from ?? e.english_on)} {weekdayName(e.term_from ?? e.english_on)}</span><div><b>{e.name}</b><small>{e.grade ? `고${e.grade}` : "전 학년"}</small></div><span className="tag">전국</span></div>)}
        <div className="wv" style={{ margin: "8px 0 0" }} data-g="words"><span className="fl" style={{ margin: 0 }}>전국으로 볼 이름</span>{(b.words ?? []).map((w) => <span key={w.word} className="tag">{w.word}</span>)}
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="+ 낱말" aria-label="전국 낱말" name="word" style={{ width: 120 }} /><button className="btn sm" type="button" disabled={pending || !word.trim()} data-act="word-add" onClick={() => run(() => examWordAct(word), (r) => (r.added ? "낱말을 더했습니다 — 다음 받아오기부터 전국으로 봅니다" : "이미 있는 낱말입니다"))}>더하기</button></div>
      </div>
      <div className="nbox" data-g="school">
        <div className="nh2"><span className="ai">🏫</span><b>학교별 — 학교 × 학년</b><span className="spacer" /><span className="tag">중간·기말</span></div>
        {!sch.length && <p className="note">아직 없습니다 — 받아오거나 손으로 넣으세요.</p>}
        {sch.map((e) => { const s = (b.schools ?? []).find((x) => x.id === e.school_id); return <div key={e.id} className={"nrow" + (e.english_on ? "" : " warnrow2")} data-g="school-row" data-exam={e.id}><span className="nd2">{e.term_from ? `${md(e.term_from)}~${md(e.term_to)}` : "—"}</span>
          <div><b>{e.school ?? "?"} {e.name}</b><small>{gradeText(e, s)} · {e.english_on ? `영어 ${md(e.english_on)}` : <b>영어일 없음</b>}
            {!e.english_on && <span className="wv" style={{ display: "inline-flex", marginLeft: 6, gap: 4 }}><input type="date" value={eng[e.id] ?? ""} onChange={(x) => setEng({ ...eng, [e.id]: x.target.value })} aria-label="영어 시험일" style={{ width: "auto" }} /><button className="btn sm" type="button" disabled={pending || !eng[e.id]} data-act="english-on" onClick={() => run(() => englishOnAct(e.id, eng[e.id]), "영어 시험일을 적었습니다 — 전날 등원·안내·마감이 섭니다")}>영어일</button></span>}</small></div>
          {srcTag(e)}<button className="btn sm gho" type="button" disabled={pending} data-act="exam-cancel" onClick={() => run(() => cancelExamAct(e.id), "시험을 물렀습니다")}>물리기</button></div>; })}
      </div>
    </div>
    <div className="card" style={{ marginTop: 8 }} data-g="no-neis">
      <div className="ctitle"><span className="cemo">🧩</span>나이스에 없는 것 — 학교 찾기 · 홈페이지 주소 · 손으로 넣기</div>
      {(b.schools ?? []).map((s) => <div key={s.id} className="li" data-g="school-line" data-school={s.id}><span className="n">{s.neis_code ? "✓" : "?"}</span><div style={{ flex: "1 1 auto", minWidth: 0 }}><b>{s.name}</b><small>{s.students}명 · {s.neis_code ? `나이스 코드 ${s.neis_code} · 받은 시험 ${s.neis_exams}` : "나이스 코드 없음 — 찾아서 붙이세요"}{s.site_url ? <> · <a href={s.site_url} target="_blank" rel="noreferrer" data-g="site-link">홈페이지 ↗</a></> : " · 홈페이지 주소 없음"}</small>
        <div className="wv" style={{ marginTop: 4 }}>
          <input value={urls[s.id] ?? s.site_url ?? ""} onChange={(e) => setUrls({ ...urls, [s.id]: e.target.value })} placeholder="https:// 학교 홈페이지" aria-label="홈페이지 주소" name="site" style={{ flex: "1 1 200px" }} /><button className="btn sm" type="button" disabled={pending} data-act="site-save" onClick={() => run(() => siteUrlAct(s.id, urls[s.id] ?? ""), "주소를 적었습니다")}>🔗 주소 저장</button>
          <button className="btn sm gho" type="button" disabled={pending || !b.neis_key} data-act="find-open" title={b.neis_key ? "" : "나이스 열쇠가 없습니다"} onClick={() => setFind({ schoolId: s.id, q: s.name, rows: null })}>학교 찾기</button></div>
        {find.schoolId === s.id && <div className="wv" style={{ marginTop: 4 }} data-g="find"><input value={find.q} onChange={(e) => setFind({ ...find, q: e.target.value })} aria-label="찾을 이름" style={{ width: 160 }} /><button className="btn sm" type="button" disabled={pending} onClick={() => start(async () => { setErr(""); const r = await searchSchoolsAct(find.q); if (!r.ok) setErr(r.msg); else setFind({ ...find, rows: r.rows }); })}>나이스에서 찾기</button>
          {find.rows && (find.rows.length ? find.rows.map((r) => <button key={r.schul} className="btn sm" type="button" disabled={pending} onClick={() => run(() => schoolCodeAct(s.id, r.atpt, r.schul), `${r.name} 코드를 붙였습니다`)}>{r.name} · {r.atptName} · {r.address}</button>) : <span className="note" style={{ margin: 0 }}>찾은 학교가 없습니다</span>)}</div>}
      </div></div>)}
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
        <button className="btn pri sm" type="button" data-act="manual-open" onClick={() => setManual(!manual)}>+ 손으로 넣기</button>
        <span className="spacer" /><span className={"pill" + (noNeis.length ? " warn" : "")} data-g="no-neis-count">나이스에 없는 학교 {noNeis.length}곳</span></div>
      {manual && <div className="card" style={{ marginTop: 8 }} data-g="exam-form"><div className="wv">
        <div className="seg sm" data-g="exam-scope">{[["school", "학교(중간·기말)"], ["national", "전국(수능·모의)"]].map(([k, name]) => <button key={k} type="button" aria-pressed={exam.scope === k} onClick={() => setExam({ ...exam, scope: k })}>{name}</button>)}</div>
        {exam.scope === "school" && <select value={exam.schoolId} onChange={(e) => setExam({ ...exam, schoolId: e.target.value })} aria-label="학교" style={{ width: "auto" }}>{(b.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <input value={exam.grade} onChange={(e) => setExam({ ...exam, grade: e.target.value })} placeholder="학년(비면 전체)" aria-label="학년" inputMode="numeric" style={{ width: 110 }} />
        <input value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} placeholder="이름 (예: 2학기 중간)" aria-label="시험 이름" name="exam-name" style={{ flex: "1 1 160px" }} />
        <span className="note" style={{ margin: 0 }}>기간</span><input type="date" value={exam.termFrom} onChange={(e) => setExam({ ...exam, termFrom: e.target.value })} aria-label="시작" style={{ width: "auto" }} /><input type="date" value={exam.termTo} onChange={(e) => setExam({ ...exam, termTo: e.target.value })} aria-label="끝" style={{ width: "auto" }} />
        <span className="note" style={{ margin: 0 }}>영어일</span><input type="date" value={exam.englishOn} onChange={(e) => setExam({ ...exam, englishOn: e.target.value })} aria-label="영어 시험일" style={{ width: "auto" }} />
        <button className="btn pri sm" type="button" disabled={pending} data-act="exam-save" onClick={() => run(() => examAct(exam), "시험을 넣었습니다(손으로 — 받아와도 안 덮습니다)")}>저장</button><button className="btn sm gho" type="button" onClick={() => setManual(false)}>닫기</button></div></div>}
    </div>
    <div className="card" style={{ marginTop: 8 }} data-g="rules">
      <div className="ctitle"><span className="cemo">🛡️</span>받아온 것을 덮지 않습니다</div>
      <div className="rl"><span className="k">두 번 안 들어옴</span><span className="v"><b>출처 + 출처 열쇠</b>를 짝으로 둡니다. 다시 받아도 같은 줄이 하나입니다</span></div>
      <div className="rl"><span className="k">손으로 넣은 것</span><span className="v">출처가 「손으로」인 줄은 받아오기가 <b>안 건드립니다</b> — 원장님이 고친 것을 지우지 않습니다</span></div>
      <div className="rl"><span className="k">학년이 빈 채로</span><span className="v">나이스는 <b>학년을 안 주는 일이 많습니다.</b> 한 학년만 보는 회차에만 학년을 적습니다</span></div>
      <div className="rl"><span className="k">영어 시험일</span><span className="v"><b>안 옵니다.</b> 위에서 한 줄 넣으면 전날 등원·안내·마감이 한꺼번에 섭니다(다음 단계)</span></div>
      <div className="rl"><span className="k">브라우저 확장</span><span className="v">학교 홈페이지에서 날짜를 찾아 보내는 확장은 <b>아직</b> — 그때까지는 홈페이지 주소를 열어 손으로 넣습니다</span></div>
    </div>
  </>;
}
