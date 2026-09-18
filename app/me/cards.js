"use client";
/** 아이 화면의 누르는 카드 — 등원·하원(걸음 셋 · 반 고르기 · 집에 가요) · 「다 했어요」. 되돌릴 수 없는 것(등원 찍기)은 서버 답을 기다린다 */
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { arrive, said, startItem, endItem, stage as setStageAct, due as setDueAct, submitScore, seen as seenAct, drop as dropAct } from "./actions.js";
import Upload from "../_shell/upload.js";
import Rec from "../_shell/rec.js";          // (어76) 🎙 음성으로 내기
import Play from "../_shell/play.js";        // (어76) 🎧 낸 음성을 듣는다(막대를 끈다)
import { icon } from "../_shell/icon.js";
import { ACT, FACE } from "@/lib/emoji";
import { isAudio } from "@/lib/files-plan";
import { REJECT_MARK } from "@/lib/status";   // (어82) 반려 기호는 한 곳에서 — 상자 색을 입는 글자다
import { srcId, submitted, rejectOf, rejectText, nextStep } from "@/lib/item-plan";
import { CC_URL } from "@/lib/cc-plan";   // (어77) 🃏 클래스카드가 사는 곳 — 확장과 같은 곳(check-cc 가 견준다)
import Photo from "../_shell/photo.js";
import { myUploads } from "@/lib/files-plan";
import { md } from "@/lib/dash-plan";
import { STAGES, dueText, dueBad } from "@/lib/material-plan";
import { STEPS, LEAVE, timerText } from "@/lib/arrival-plan";
import { seoulTime } from "@/lib/day-plan";
export function ArrivalCard({ arrival, choice, off }) {
  const [err, setErr] = useState(""); const [pending, start] = useTransition(); const [cls, setCls] = useState(choice.classId ?? null);
  const go = (step) => start(async () => { setErr(""); const r = await arrive(step, cls); if (!r.ok) setErr(r.msg); });
  const pill = arrival.left ? `${seoulTime(arrival.leftAt)} 집에 감` : arrival.arrived ? `${seoulTime(arrival.arrivedAt)} 출석` : "아직";
  return (
    <div className="task" data-card="arrival" style={{ borderColor: "var(--navy)" }}>
      <div className="h"><b><span className="cemo">🕘</span>등원 · 하원</b><span className="spacer" /><span className={"pill" + (arrival.arrived ? " hw" : "")} data-g="arrival-pill">{pill}</span></div>
      {off && <p className="note" style={{ margin: "8px 0 0" }}>오늘은 휴강이에요</p>}
      {!off && choice.none && !arrival.arrived && <p className="note" style={{ margin: "8px 0 0" }}>오늘은 수업이 없어요</p>}
      {!off && choice.pick && !arrival.done.has(2) && <div className="lenrow" style={{ marginTop: 8 }}><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>어느 반</span>
        <div className="seg sm" data-g="pick-class">{choice.options.map((o) => <button key={o.id} type="button" aria-pressed={cls === o.id} onClick={() => setCls(o.id)}>{o.name} {o.start}</button>)}</div></div>}
      {!off && <div className="tags" style={{ marginTop: 8 }}>
        {STEPS.map(([n, name]) => arrival.done.has(n)
          ? <span key={n} className="tag on" data-step={n}>✓ {name}</span>
          : <button key={n} type="button" className="tag" data-step={n} disabled={pending || choice.none || arrival.left} onClick={() => go(n)}>{name}</button>)}
      </div>}
      {!off && arrival.arrived && !arrival.left && <button type="button" className="btn pri" style={{ width: "100%", marginTop: 8 }} data-step={LEAVE} disabled={pending} onClick={() => go(LEAVE)}>🏠 집에 가요</button>}
      {err && <div className="lf warn" role="alert" style={{ marginTop: 8 }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
    </div>
  );
}
/** 「완료」 — 학원 줄은 차례대로(지금 할 것만 누른다), 숙제 줄은 아무 때나. 무를 수 있다.
 *  (어77) 원장님 2026-09-17 「다했어요를 완료로 수정」 — 원장 검사의 「완료」와 같은 말이다(한 가지를 두 이름으로 부르지 않는다) */
function SaidButton({ item }) {   // 마감 뒤에도 누른다 — 숙제는 마감 뒤 저녁에 한다(DB 문은 내 판이면 열려 있다)
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const on = Boolean(item.said_done_at);
  const flip = () => start(async () => { setErr(""); const r = await said(item.id, !on); if (!r.ok) setErr(r.msg); });
  return (<>
    <button type="button" className={"btn sm" + (on ? "" : " pri")} data-act="said" aria-pressed={on} disabled={pending} onClick={flip}>{on ? "완료 ✓ · 취소" : "완료"}</button>
    {err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}
  </>);
}
/** (어77) 🔒 앞엣것부터 — 원장님 2026-09-17 「오늘학습 앞엣것부터를 자물쇠 이모지로 바꿔주고 3초누르면 자물쇠여도 시작가능하게 해줘」.
 *  잠금은 **화면의 안내**다(서버는 원래 안 막는다 · lib/arrival-plan 이 셈만 한다) — 그러니 아이가 3초 길게 누르면 열어 준다.
 *  3초를 누르는 동안 밑줄이 차오른다(무엇이 일어나는지 보이게 · 대전제-0) · 손을 떼면 처음으로 돌아간다 */
function LockHold({ ms = 3000, onFree = null }) {
  const [held, setHeld] = useState(0); const tick = useRef(null), from = useRef(0);
  const stop = () => { if (tick.current) { clearInterval(tick.current); tick.current = null; } setHeld(0); };
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  const down = () => { if (tick.current || !onFree) return; from.current = Date.now();
    tick.current = setInterval(() => { const p = Math.min(1, (Date.now() - from.current) / ms); setHeld(p); if (p >= 1) { stop(); onFree(); } }, 50); };
  return <button type="button" className="btn sm gho lockb" data-g="locked" data-act="lock-hold" aria-pressed={held > 0}
    onPointerDown={down} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") down(); }} onKeyUp={stop} onBlur={stop}
    {...icon("앞엣것부터", "앞엣것부터 · 3초 길게 누르면 열려요")} style={{ "--hold": `${Math.round(held * 100)}%` }}>{ACT.lock}</button>;
}
/** (어77) 한 줄이 내는 손 한 벌 — 잠금·타이머·완료를 **한 곳**에서 낸다.
 *  전에는 SaidButton 과 TimerButton 이 저마다 잠금을 그려 같은 말이 두 번 나거나, 하나만 열려 어긋났다(원칙-1).
 *  hands: "timer" 학원 줄(끝이 곧 완료) · "both" 숙제 줄(타이머 + 완료) · "said" 완료만 */
export function DoRow({ item, state = "now", hands = "both" }) {
  const [freed, setFreed] = useState(false);
  if (state === "locked" && !freed) return <LockHold onFree={() => setFreed(true)} />;
  if (hands === "timer") return <TimerButton item={item} />;   // 학원 줄 — 「■ 끝」이 곧 완료다(단추를 둘로 안 나눈다)
  return (<>{hands === "both" && <TimerButton item={item} said={false} />}<SaidButton item={item} /></>);
}

/** (어35) 학원 줄의 타이머(원장님 9/15 「학생페이지 타이머 짓는다」) · 차례대로(지금 할 것만) · 「▶ 시작」 → 「▶ m:ss · ■ 끝」 → 「⏱ N분 · 했어요 ✓ · 취소」 · 끝 = 다 했어요(said_done_at) · 취소하면 다시 하는 중(타이머는 이어진다) · 시각은 DB 문지기가 서버 시계로(0167) · 마감 뒤에도 누른다.
 *  처음 그릴 땐 시작 시각으로 세고(서버·브라우저가 같은 글) 붙은 뒤에 1초마다 다시 센다 · 글은 lib/arrival-plan timerText 한 벌(01 도 같은 글) */
function TimerButton({ item, said: withSaid = true }) {   // (어75) withSaid=false 면 ▶/■ 만 — 「다 했어요」는 곁에 따로 선다(타이머는 도움이지 문이 아니다)
  const [err, setErr] = useState(""); const [pending, start] = useTransition(); const [now, setNow] = useState(null);
  const done = Boolean(item.said_done_at), running = Boolean(item.started_at) && !done;
  useEffect(() => { if (!running) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  const run = (fn) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) setErr(r.msg); });
  const base = item.started_at ? new Date(item.started_at).getTime() : 0;
  return (<>
    {item.started_at && <span className={"tag" + (done ? " on" : " act")} data-g="timer">{timerText(item, now ?? base)}</span>}
    {done && withSaid ? <button type="button" className="btn sm" data-act="said" aria-pressed={true} disabled={pending} onClick={() => run(() => said(item.id, false))}>완료 ✓ · 취소</button>
      : running ? <button type="button" className="btn sm pri" data-act="end" disabled={pending} onClick={() => run(() => endItem(item.id))}>■ 끝</button>
      : done ? null
      : <button type="button" className={"btn sm" + (withSaid ? " pri" : "")} data-act="start" disabled={pending} onClick={() => run(() => startItem(item.id))}>▶ 시작</button>}
    {err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}
  </>);
}

/** 📚 받을 교재·학습지 · 유형별 · 단계 넷(아직·받음·하는 중·완료) · 스스로 정한 마감(선생님 달력에도) · 끝낸 것은 접힘 */
export function MaterialCard({ gives, today, fold = null, folded = false }) {
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const total = gives.groups.reduce((n, g) => n + g.items.length, 0) + gives.done.length;
  const run = (fn) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) setErr(r.msg); });
  const Item = ({ it, dim = false }) => (
    <div className="task" style={{ marginTop: 4, padding: 8, background: dim ? "var(--sunk)" : undefined }} data-material={it.material_id}>
      <div className="h"><b style={{ fontSize: "var(--fs-3)" }}>{it.material?.title}</b><span className="spacer" />
        {it.due_on && it.stage !== "done" && <span className={"pill" + (dueBad(it.due_on, today) ? " bad" : " warn")} data-g="due">{dueText(it.due_on, today)}</span>}
        {it.stage === "done" && <span className="tag on">제출함</span>}</div>
      <div className="stage" data-g="stage">{STAGES.map(([k, name]) => <button key={k} type="button" aria-pressed={it.stage === k} disabled={pending} onClick={() => run(() => setStageAct(it.material_id, k))}>{name}</button>)}</div>
      {it.stage !== "done" && <div className="wv" style={{ marginTop: 4, marginBottom: 0 }}><label className="fl" style={{ margin: 0 }}>내가 정한 마감</label>
        <input type="date" defaultValue={it.due_on ?? ""} min={today} aria-label="내가 정한 마감" style={{ width: "auto" }} onChange={(e) => run(() => setDueAct(it.material_id, e.target.value))} />
        </div>}
    </div>);
  return (
    <div className="task" data-card="material" data-folded={folded ? "1" : "0"}>
      <div className="h"><b><span className="cemo">📚</span>받을 교재·학습지</b><span className="spacer" /><span className="pill">{total ? `${gives.done.length}/${total}` : "없음"}</span>{fold}</div>
      {!total && <p className="note" style={{ margin: "8px 0 0" }}>아직 받을 학습지가 없어요</p>}
      {gives.groups.map((g, i) => <div key={g.name}><div style={{ marginTop: i ? 12 : 8, fontSize: "var(--fs-2)", fontWeight: 700, color: "var(--faint)" }}>{i + 1} {g.name}</div>{g.items.map((it) => <Item key={it.material_id} it={it} />)}</div>)}
      {gives.done.length > 0 && <details style={{ marginTop: 8 }}><summary className="donehead" style={{ cursor: "pointer", listStyle: "none" }}><span className="ar">›</span>끝낸 것 <b>{gives.done.length}</b><span className="spacer" /></summary>{gives.done.map((it) => <Item key={it.material_id} it={it} dim />)}</details>}
      {err && <div className="lf warn" role="alert" style={{ marginTop: 8 }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
    </div>
  );
}

/** 📈 성적 — 원장님이 공개한 시험만 보인다 · 내가 넣은 것은 「확인 기다리는 중」 · 본 회차가 있으면 원점수·틀린 번호를 넣는다(목업 16 「아이가 넣고 원장님이 확인」 · 9/5 ⑯) */
export function ScoreCard({ scores = [], entry = [], fold = null, folded = false }) {
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [pending, start] = useTransition(); const [f, setF] = useState({});
  if (!scores.length && !entry.length) return null;   // 빈 카드는 숨긴다(확정-⑮)
  const v = (id, k, d = "") => f[id]?.[k] ?? d, setV = (id, k, val) => setF({ ...f, [id]: { ...(f[id] ?? {}), [k]: val } });
  const go = (e) => start(async () => { setErr(""); setMsg(""); const r = await submitScore(e.id, v(e.id, "raw"), v(e.id, "full", "100"), v(e.id, "wrongs")); if (!r.ok) { setErr(r.msg); return; } setMsg(`넣었어요. 선생님이 확인하면 굳어요`); setF({}); });
  return <div className="task" data-card="scores" data-folded={folded ? "1" : "0"}><div className="h"><b><span className="cemo">📈</span>성적</b><span className="spacer" />{scores.length > 0 && <span className="pill">{scores[0].title}</span>}{fold}</div>
    {scores.map((s) => <div className="li" key={s.id} data-g="score-line" data-pending={s.pending ? "1" : "0"}><div><b>{s.title}</b><small>{s.small}</small></div>{s.deltaText && <span className={"tag" + (s.delta > 0 ? " on" : "")} data-g="score-delta">{s.deltaText}</span>}{s.pending && <span className="tag act">확인 기다리는 중</span>}</div>)}
    {entry.map((e) => <div className="li" key={e.id} data-g="score-entry" data-exam={e.id}><div><b>{e.school} {e.name} · 점수를 넣어요</b><small>{md(e.on)} 본 시험</small>
      <div className="wv" style={{ marginTop: 6 }}><input type="text" inputMode="numeric" className="scr" placeholder="원점수" aria-label="원점수" value={v(e.id, "raw")} onChange={(x) => setV(e.id, "raw", x.target.value)} /><span className="note" style={{ margin: 0 }}>/</span><input type="text" inputMode="numeric" className="scr sm2" placeholder="100" aria-label="만점" value={v(e.id, "full")} onChange={(x) => setV(e.id, "full", x.target.value)} />
        <input type="text" placeholder="틀린 번호 (예: 3, 7, 11)" aria-label="틀린 번호" value={v(e.id, "wrongs")} onChange={(x) => setV(e.id, "wrongs", x.target.value)} style={{ flex: "1 1 160px" }} />
        <button className="btn sm pri" type="button" disabled={pending || !String(v(e.id, "raw")).trim()} data-act="score-submit" onClick={() => go(e)}>넣기</button></div></div></div>)}
    {err && <p className="note" role="alert" style={{ margin: "6px 0 0", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="score-msg" style={{ margin: "6px 0 0", color: "var(--on-ok)" }}>{msg}</p>}
  </div>;
}

/** 📎 숙제 줄에 붙은 파일 — 💾 저장(폰에 내려받는다 · 앱 안에 두면 1달 뒤 사라져서 「저장」이 아니게 된다) · ✓ 안 보기(그 줄에서만 치운다). 둘 다 「지난 것 보기」에서 1달간(목업 20) */
export function AttachLines({ links = [] }) {
  const router = useRouter(); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  if (!links.length) return null;
  const mark = (l, how) => start(async () => { setErr(""); const r = await seenAct(l.file_id, l.day_item_id, how); if (!r.ok) { setErr(r.msg); return; } router.refresh(); });
  return (<>
    {links.map((l) => <div className="lf" key={`${l.file_id}-${l.day_item_id}`} data-g="attach" data-file={l.file_id} style={{ marginTop: 4 }}>{/^image\//.test(l.file?.mime ?? "") ? <Photo id={l.file_id} name={l.name} /> : <span className="ln">{l.icon}</span>}
      <div><b>📎 {l.name}</b><small>{l.size}{l.file?.note ? ` · 💬 ${l.file.note}` : ""} · {l.until}까지 보여요</small></div>
      <a className="btn sm pri" href={`/api/files/${l.file_id}?dl=1`} data-act="save" onClick={() => mark(l, "saved")}>💾 저장</a>
      <button type="button" className="btn sm" data-act="skip" disabled={pending} onClick={() => mark(l, "skip")}>✓ 안 보기</button></div>)}
    {err && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{err}</p>}
  </>);
}
/** 📎 자료 — 사진 보내기(학교 종이를 찍어 원장님께) · 지난 것 보기(1달 안에 처리한 붙임) · 1달 지난 것은 개수만 */
export function FilesCard({ past = [], hidden = 0, rules = {}, sent = [], fold = null, folded = false }) {
  const router = useRouter(); const mine = myUploads(sent);
  return (
    <div className="task" data-card="files" data-folded={folded ? "1" : "0"}>
      <div className="h"><b><span className="cemo">📎</span>자료</b><span className="spacer" /><span className="pill">{past.length ? `지난 것 ${past.length}` : mine.length ? `보낸 것 ${mine.length}` : "보내기"}</span>{fold}</div>
      <Upload rules={rules} hint="" compact onDone={() => router.refresh()} />
      {mine.length > 0 && <div className="hh" style={{ marginTop: 8 }}>내가 보낸 것 · 원장님 답</div>}
      {mine.map((f) => <div className="lf" key={f.id} data-g="mine" data-file={f.id} data-replied={f.replied ? "1" : "0"} style={{ marginTop: 4 }}>{f.photo ? <Photo id={f.id} name={f.orig_name} /> : <span className="ln">{f.icon}</span>}
        <div><b>{f.orig_name}</b><small>{f.when} · {f.size}{f.note ? ` · 💬 ${f.note}` : ""}</small><small data-g="reply" style={{ color: f.replied ? "var(--on-ok)" : undefined }}>{f.replied ? "✓ " : "⏳ "}{f.reply}</small></div></div>)}
      {past.length > 0 && <details style={{ marginTop: 8 }} data-g="past"><summary className="donehead" style={{ cursor: "pointer", listStyle: "none" }}><span className="ar">›</span>지난 것 보기 <b>{past.length}</b><span className="spacer" /><span className="tag on">1달간</span></summary>
        {past.map((l) => <div className="lf" key={`${l.file_id}-${l.day_item_id}`} data-g="past-row" data-file={l.file_id}><span className="ln">{l.icon}</span><div><b>{l.name}</b><small>{l.seen}{l.on ? ` · ${md(l.on)} 숙제` : ""}{l.item ? ` · ${l.item}` : ""} · {l.until}까지</small></div><a className="btn sm" href={`/api/files/${l.file_id}?dl=1`}>⬇</a></div>)}</details>}
      {hidden > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>1달 지난 것 {hidden}개는 안 보여요</p>}
    </div>
  );
}
/** (어76)(어77) 완료 뒤 다음 걸음 · 내가 낸 것 — 원장님 2026-09-17 「알림이 떠야해. 그다음 기존사진 확인가능하게 해서 본인이 보고 그다음 삭제&다시 제출하게」.
 *  세 걸음을 한 줄에 둔다: **반려 글** → **내가 낸 것**(누르면 크게 · 음성은 막대를 끈다) → **지우기 · 다시 내기**.
 *  올리는 길은 원장·학부모와 같은 한 곳(Upload) · 녹음만 제 부품(Rec). 낸 것은 원래 숙제 줄에 붙는다(lib/item-plan srcId).
 *  (어77) 원장님 2026-09-17 「다했어요 누르면 클래스카드 숙제는 클래스카드 라고 버튼 누르고 넘어가규 교재숙제는 사진으로 제출」 —
 *  **완료를 누르기 전에는 이 줄이 통째로 안 뜬다**(대전제-15 · 할 일이 안 끝났는데 낼 것부터 묻지 않는다).
 *  다만 **반려받았거나 이미 낸 것이 있으면** 완료와 상관없이 뜬다 — 그것이 「지우고 다시 내는」 길이라서다((어76) 세 걸음). */
export function SubmitLine({ item, rules = {} }) {
  const router = useRouter(); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const [gone, setGone] = useState([]);
  const id = srcId(item), rj = rejectOf(item), mine = submitted(item).filter((f) => !gone.includes(f.id));
  const kill = (fid) => start(async () => { setErr(""); setGone((g) => [...g, fid]); const r = await dropAct(fid); if (!r.ok) { setErr(r.msg); setGone((g) => g.filter((x) => x !== fid)); return; } router.refresh(); });
  const step = nextStep(item);                                   // (어77) 완료를 눌러야 다음 걸음이 뜬다 · 클래스카드 숙제인가 교재 숙제인가는 lib/item-plan 한 곳
  const send = step === "photo" || Boolean(rj) || mine.length > 0;   // 반려받았거나 이미 낸 것이 있으면 완료 전에도 낼 수 있다(다시 내는 길)
  if (!id || (!send && step !== "cc")) return null;
  return (
    <div data-g="submit" data-item={id} style={{ marginTop: 4 }}>
      {rj && <p className="note" data-g="rejected" style={{ margin: "0 0 4px", color: "var(--miss)" }}>{REJECT_MARK} {rejectText(rj)} · 지우고 다시 내 줘요</p>}
      {mine.length > 0 && <div className="wv" data-g="mine-files" style={{ marginBottom: 0, gap: 4 }}>
        {mine.map((f) => <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }} data-g="mine-file" data-file={f.id}>
          {isAudio(f.mime) ? <Play id={f.id} name={f.orig_name} size={180} /> : <Photo id={f.id} name={f.orig_name} size={44} />}
          <button type="button" className="btn sm gho" data-act="drop" disabled={pending} {...icon(`${f.orig_name} 지우기`)} onClick={() => kill(f.id)}>✕</button></span>)}
      </div>}
      {step === "cc" && <a className="btn sm pri" data-g="go-cc" href={CC_URL} target="_blank" rel="noreferrer">{FACE.cc} 클래스카드</a>}
      {send && <><Upload rules={rules} itemId={id} label="사진으로 내기" hint="" compact onDone={() => router.refresh()} />
      <Rec rules={rules} itemId={id} onDone={() => router.refresh()} /></>}
      {err && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{err}</p>}
    </div>
  );
}
