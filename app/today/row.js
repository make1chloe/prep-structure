"use client";
/** 학생 줄 — 목업 01 의 .row 그대로. 자주 누르는 것(출결 · ○△✕)은 낙관적: 화면 먼저, 저장은 뒤에서, 실패하면 되돌리고 그 자리에서 말한다(속도-5).
 *  마감·발송처럼 되돌릴 수 없는 것은 서버 답을 기다린다. 마감된 판은 읽기만 한다 */
import { useState, useTransition } from "react";
import { setAttend, check, rest, add, move, late, lateSend, comment, close, openSheet } from "./actions.js";
import { isUnchecked, CHECK } from "@/lib/status";
const ATTEND = [["present", "왔음"], ["late", "지각"], ["absent", "결석"], ["early", "조퇴"], ["online", "온라인"]];
const UPTO = ["시작만", "절반", "거의 다"];
const REST = [["class", "오늘 학습으로"], ["home", "다음 숙제로"], ["stay", "남아서"]];
const PLUS = [[20, "+20분"], [40, "+40분"], [60, "+1시간"]];
const plus = (min) => { const t = new Date(Date.now() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
const attendName = (v) => ATTEND.find(([k]) => k === v)?.[1] ?? v;

export default function Row({ student, sheet, classId, date, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const closed = Boolean(sheet?.closed);
  const fail = (r) => { if (r && !r.ok) setErr(r.msg); return r?.ok; };
  // 출결 — 낙관적
  const [attend, setAttendLocal] = useState(sheet?.attend ?? "present");
  const pickAttend = (v) => { if (closed) return; const prev = attend; setAttendLocal(v); setErr("");
    start(async () => { let id = sheet?.id; if (!id) { const r = await openSheet(student.id, classId, date); if (!fail(r)) { setAttendLocal(prev); return; } id = r.sheetId; } const r = await setAttend(id, v); if (!fail(r)) setAttendLocal(prev); }); };
  const nCheck = sheet?.check.length ?? 0, nLeft = sheet?.check.filter(isUnchecked).length ?? 0;
  const status = closed ? "마감됨" : attend === "absent" ? "결석 · 보강 안 잡힘" : nLeft ? `검사 ${nLeft}/${nCheck} 남음` : null;
  return (
    <div className={"row" + (closed ? " closed" : "")} data-open={open ? "1" : "0"} data-student={student.id}>
      <div className="rowtop">
        <span className="who">{student.name}</span><span className="meta">{student.grade ? `${student.grade}학년` : ""}</span>
        <div className="seg sm" data-g="att" aria-label={`${student.name} 출결`}>
          {ATTEND.map(([v, name]) => <button key={v} type="button" aria-pressed={attend === v} disabled={closed} onClick={() => pickAttend(v)}>{name}</button>)}
        </div>
        <span className="spacer" />
        {sheet && <span className="pill hw">학원 {sheet.class.length} · 숙제 {sheet.home.length}</span>}
        {status && <span className={"pill" + (closed ? "" : attend === "absent" ? " bad" : " warn")}>{status}</span>}
        <button type="button" className="open" onClick={() => setOpen(!open)}>{open ? "닫기" : "펴기"}</button>
      </div>
      {open && (
        <div className="panel">
          {err && <div className="lf warn" role="alert" style={{ margin: "0 0 8px" }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
          {!sheet && <div className="card"><p className="note">아직 판이 없습니다 — 출결을 누르면 섭니다.</p></div>}
          {sheet && <>
            <CheckCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <WorkCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <LateCard sheet={sheet} closed={closed} fail={fail} start={start} />
            <CommentCard sheet={sheet} closed={closed} fail={fail} />
          </>}
        </div>
      )}
    </div>
  );
}

function CheckCard({ sheet, closed, fail, start }) {
  const left = sheet.check.filter(isUnchecked).length;
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">1</span> 숙제 검사 · 집에서 해온 것{sheet.check.length ? <span className="auto">{left ? `${left}/${sheet.check.length} 남음` : "다 봤습니다"}</span> : null}</div>
      {!sheet.check.length && <p className="note">검사할 지난 숙제가 없습니다.</p>}
      {sheet.check.map((it) => <CheckItem key={it.id} it={it} closed={closed} fail={fail} start={start} />)}
    </div>
  );
}
function CheckItem({ it, closed, fail, start }) {
  const [st, setSt] = useState(isUnchecked(it) ? null : it.status);
  const [upto, setUpto] = useState(it.done_note ?? "");
  const [restTo, setRestTo] = useState(null);
  const pick = (v) => { if (closed) return; const prev = st; setSt(v); start(async () => { const r = await check(it.id, v, v === "weak" ? upto || null : null); if (!fail(r)) setSt(prev); }); };
  const pickUpto = (u) => { setUpto(u); start(async () => { fail(await check(it.id, "weak", u)); }); };
  const pickRest = (w) => { setRestTo(w); start(async () => { fail(await rest(it.id, w)); }); };
  return (
    <div className="hw">
      <div className="hwname"><b>{it.range_note || "(이름 없음)"}</b>{it.memo && <small>{it.memo}</small>}
        {st && st !== "done" && !closed && (
          <div className="partial">
            {st === "weak" && <div className="wv"><span className="fl" style={{ margin: 0 }}>어디까지</span><div className="seg sm" data-g="upto">{UPTO.map((u) => <button key={u} type="button" aria-pressed={upto === u} onClick={() => pickUpto(u)}>{u}</button>)}</div></div>}
            <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>나머지는</span><div className="seg sm" data-g="rest">{REST.map(([w, name]) => <button key={w} type="button" aria-pressed={restTo === w} onClick={() => pickRest(w)}>{name}</button>)}</div></div>
          </div>
        )}
      </div>
      <div className="chk" aria-label="검사">
        {CHECK.map(([v, g]) => <button key={v} type="button" data-v={v[0]} aria-pressed={st === v} disabled={closed} onClick={() => pick(v)}>{g}</button>)}
      </div>
    </div>
  );
}
function WorkCard({ sheet, closed, fail, start }) {
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">2</span>오늘 학습 · 학원 &nbsp;+&nbsp; <span className="stepno">3</span>오늘 숙제 · 집</div>
      <div className="load">
        <div className="ldn"><span>학원</span><b>{sheet.class.length}</b><small>오늘 여기서 할 것</small></div>
        <div className="ldn"><span>숙제</span><b>{sheet.home.length}</b><small>집에서 할 것 — 다음 시간 검사</small></div>
      </div>
      <div className="two">
        {[["class", "오늘 학습 · 학원", sheet.class, "home", "⏭ 숙제로 미루기"], ["home", "오늘 숙제 · 집", sheet.home, "class", "↩ 학원에서"]].map(([slot, title, items, other, moveLabel]) => (
          <div className="half" key={slot}>
            <div className="hh">{title}<span className="cnt">{items.length}개</span></div>
            {items.map((it, i) => <div className="li" key={it.id}><span className="n">{i + 1}</span><div><b>{it.range_note || "(이름 없음)"}</b>{it.carry_of && <small>지난 숙제의 나머지</small>}</div>{!closed && <button type="button" className="btn sm" onClick={() => start(async () => { fail(await move(it.id, other)); })}>{moveLabel}</button>}</div>)}
            {!closed && <form className="wv" action={async (f) => { fail(await add(f)); }}><input type="hidden" name="sheetId" value={sheet.id} /><input type="hidden" name="slot" value={slot} /><input type="text" name="text" placeholder="항목 더하기 — 예: 워크북 p.10 1-18" style={{ flex: "1 1 160px", minWidth: 0 }} /><button className="btn sm" type="submit">항목 더하기</button></form>}
          </div>
        ))}
      </div>
    </div>
  );
}
function LateCard({ sheet, closed, fail, start }) {
  const l = sheet.late;
  const [until, setUntil] = useState(l?.until_at ? String(l.until_at).slice(0, 5) : "");
  return (
    <div className="card">
      <div className="ctitle"><span className="stepno">3b</span> 늦귀가 — 남아서 하고 갑니다{l?.until_at && <span className="auto">예상 귀가 {String(l.until_at).slice(0, 5)}</span>}</div>
      <form className="lategrid" action={async (f) => { fail(await late(f)); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <div><label className="fl">사유</label><input type="text" name="reason" defaultValue={l?.reason ?? ""} placeholder="예: 워크북 나머지 10-18번" disabled={closed} /></div>
        <div><label className="fl">예상 귀가 시각</label><input type="text" name="untilAt" value={until} onChange={(e) => setUntil(e.target.value)} placeholder="예: 18:40" inputMode="numeric" disabled={closed} />
          <div className="seg sm" style={{ marginTop: 4 }}>{PLUS.map(([m, name]) => <button key={m} type="button" disabled={closed} onClick={() => setUntil(plus(m))}>{name}</button>)}</div></div>
        <div className="wv" style={{ marginBottom: 0 }}>
          <button className="btn sm" type="submit" disabled={closed}>적어 두기</button>
          <button className="btn sm pri" type="button" disabled={closed || !l?.until_at} onClick={() => start(async () => { fail(await lateSend(sheet.id)); })}>📨 학부모에게 지금 보내기</button>
          {l?.sent_at ? <span className="pill">보냄</span> : l?.until_at ? <span className="pill warn">보내야 함</span> : null}
        </div>
      </form>
    </div>
  );
}
function CommentCard({ sheet, closed, fail }) {
  return (
    <div className="card">
      <div className="ctitle"><span className="cemo">✉️</span>부모님께 나갈 글{closed && <span className="auto">마감됨</span>}</div>
      <form action={async (f) => { fail(await (f.get("how") === "close" ? close(f) : comment(f))); }}>
        <input type="hidden" name="sheetId" value={sheet.id} />
        <textarea name="comment" defaultValue={sheet.comment ?? ""} rows={3} placeholder="오늘 한 것 · 잘한 것 · 다음 시간에 할 것" disabled={closed} style={{ width: "100%" }} />
        {!closed && <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }}>
          <button className="btn sm" type="submit" name="how" value="save">임시 저장</button>
          <button className="btn sm pri" type="submit" name="how" value="close">저장하고 마감</button>
          <span className="note" style={{ margin: 0 }}>마감하면 학부모 화면에 보입니다 — 되돌리기는 원장님께</span>
        </div>}
      </form>
    </div>
  );
}
