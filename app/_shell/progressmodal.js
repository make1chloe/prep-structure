"use client";
/** 진도 체크 모달 한 벌((어34) 소단원 고르기 · 여기까지 ○ · (어41) 대시보드 17 과 오늘 01 이 같은 부품 · 원장님 9/15 「누르면 팝업이든 모달이든 뜨고 저장 하면 페이지도 안 벗어나고」).
 *  손은 api 로 받는다 · open(bookId) · set(unitId, st) · setMany(ids, st) · upTo(bookId, unitId) · skip(bookId, chapter) · 01 은 수업 일지 기준(app/today/actions.js) · 대시보드는 아이·오늘 기준(_shell/progress-actions.js). 판단·쓰기는 lib/progress.js 한 벌
 *  (어49) 원장님 2026-09-16 「진도체크들어가면 버튼이 제대로 작동하지않음」: ○◐· 는 누르는 순간 바뀐다(화면 먼저 · 저장은 뒤 · 실패면 되돌리고 글은 모달 안에 · 속도-5) ·
 *  대단원 셈은 lib/progress-plan chapterSummary 한 벌로 다시 센다(서버와 같은 함수) · 손이 화면을 다시 안 그리므로 누름이 안 먹히는 것처럼 보이지 않는다 */
import { useEffect, useMemo, useState } from "react";
import { usePick, PickGroup, PickBox, PickBar } from "./pick.js";
import { useModalErr, call } from "./modalerr.js";
import { TRI, markText } from "@/lib/mark";   // (어43) 부호·말 한 곳
import { pagesText } from "@/lib/item-plan";
import { chapterSummary } from "@/lib/progress-plan";
import { icon } from "./icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
const isDone = (u) => u.status === "done" || u.status === "skip";
export default function ProgressModal({ b, api, closed = false, fail, start, onClose }) {
  const [t, setT] = useState(null);
  const [base, setBase] = useState(null);        // (어90) 마지막으로 **저장된** 모습 — 되돌리기·바뀐 것 세기의 기준
  const [skipSet, setSkipSet] = useState(() => new Set());   // (어90) 저장할 때 부를 「이 대단원 건너뛰기」(setMany 로는 못 보낸다 · 손이 따로다)
  const [asking, setAsking] = useState(false);   // (어90) 안 저장한 채 닫으려 할 때 한 번 더 묻는다(대전제-10 · 화면 안에서)
  const [open, setOpen] = useState(null);
  const [failM, errNode] = useModalErr();
  const allIds = useMemo(() => (t?.chapters ?? []).flatMap((c) => c.units.map((u) => u.id)), [t]);
  const pk = usePick(allIds);
  const load = async () => { const r = await call(() => api.open(b.book_id)); if (!r.ok) { fail?.(r); onClose(); return; } setT(r.tree); setBase(r.tree); setSkipSet(new Set()); setAsking(false); setOpen((o) => o ?? r.tree.now ?? r.tree.chapters[0]?.chapter ?? null); };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (body, close = onClose) => <div className="mdlov" role="dialog" aria-modal="true" aria-label="진도 체크" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><div className="mdl" style={{ width: "min(560px,100%)" }}>{body}</div></div>;
  if (!t) return shell(<div className="mdlb"><p className="note">읽는 중…</p></div>);
  const flat = () => t.chapters.flatMap((c) => c.units);
  const put = (pick, st) => { const before = t; const units = flat().map((u) => (pick(u) ? { ...u, status: st } : u)); setT({ ...t, ...chapterSummary(units, units.map((u) => ({ unit_id: u.id, status: u.status }))) }); return before; };   // 화면 먼저 · 셈은 서버와 같은 함수
  /** (어90) 원장님 2026-09-18 「저장버튼 누르지않으면 반영안되도록 변경해」.
   *  ○◐· 낱개 · 「여기까지 ○」 · 일괄 · 「이 대단원 건너뛰기」는 **화면만** 바꾼다(즉시 · 속도-3 의 「화면 먼저」는 그대로).
   *  DB 에 적는 것은 **「저장」을 누를 때** 한 번이다. 실패하면 마지막으로 저장된 모습으로 되돌린다(setT(base) · check-buttons ⑤b).
   *  ⚠️ 모달을 그냥 닫으면 안 적힌 것을 잃으므로 **닫기 전에 한 번 더 묻는다**(대전제-0 · 조용히 잃지 않는다). */
  const set = (u, st) => put((x) => x.id === u.id, st);
  const setMany = (st) => { const ids = new Set(pk.ids); put((x) => ids.has(x.id), st); pk.clear(); };
  const upTo = (u) => { const all = flat(); const i = all.findIndex((x) => x.id === u.id); const ids = new Set(all.slice(0, i + 1).filter((x) => !isDone(x)).map((x) => x.id)); put((x) => ids.has(x.id), "done"); };
  const skip = (chapter) => { put((x) => x.chapter === chapter && !isDone(x), "skip"); setSkipSet((s) => new Set(s).add(chapter)); };
  /** 바뀐 것 — 마지막으로 저장된 모습과 견준다. skip 은 손이 따로라 여기서 빼고 skipSet 이 나른다 */
  const changes = (() => { if (!base || !t) return [];
    const was = new Map(base.chapters.flatMap((c) => c.units).map((u) => [u.id, u.status]));
    return flat().filter((u) => was.get(u.id) !== u.status && u.status !== "skip").map((u) => ({ id: u.id, status: u.status })); })();
  const dirty = changes.length + skipSet.size;
  const revert = () => { setT(base); setSkipSet(new Set()); pk.clear(); setAsking(false); };
  const save = () => start(async () => {
    const before = base;
    for (const ch of skipSet) { const r = await call(() => api.skip(b.book_id, ch)); if (!failM(r)) { setT(before); return; } }   // 건너뛰기 먼저 — 서버가 대단원을 훑는다
    const byStatus = new Map(); for (const c of changes) { if (!byStatus.has(c.status)) byStatus.set(c.status, []); byStatus.get(c.status).push(c.id); }
    for (const [st, ids] of byStatus) { const r = await call(() => api.setMany(ids, st)); if (!failM(r)) { setT(before); return; } }
    await load();   // 서버가 적은 것으로 다시 읽는다 — 화면과 DB 가 어긋나지 않는다
  });
  const tryClose = () => { if (dirty > 0) { setAsking(true); return; } onClose(); };
  const undone = t.chapters.reduce((n, c) => n + (c.total - c.done - c.skip), 0);
  return shell(<>
    <div className="mdlh"><b>진도 체크</b><span className="pill">{t.book?.name} · {t.round}회독</span><span className="spacer" /><button type="button" className="x" {...icon("닫기")} onClick={tryClose}>✕</button></div>
    <div className="mdlb">
      {errNode}
      {!closed && <div className="wv" data-g="prog-all" style={{ marginBottom: 6 }}><PickGroup pick={pk} ids={allIds} label="전체" /><span className="fl" style={{ margin: 0 }}>전체</span></div>}
      <div className="tags" style={{ marginBottom: 8 }}><span className="tag on">끝낸 대단원 {t.finished} / {t.chapters.length}</span>{t.now && <span className="tag act">지금 {t.now}</span>}<span className="tag">안 끝난 소단원 {undone}</span>{t.memo_streak > 0 && <span className={"tag" + (t.memo_streak >= t.memo_rule ? " act" : "")} data-g="memo-streak">✍ 메모로만 {t.memo_streak}회 연속</span>}</div>
      {t.memo_streak >= t.memo_rule && <p className="note" data-g="memo-warn" style={{ margin: "0 0 8px", color: "var(--miss)" }}>⚠️ 메모로만 {t.memo_streak}회 연속</p>}
      {t.chapters.map((c) => { const isOpen = open === c.chapter; const fin = c.done + c.skip === c.total && c.total > 0; return (
        <div key={c.chapter} className={"acc" + (isOpen ? " open" : "")} data-chapter={c.chapter}>
          {/* (어90) 원장님 2026-09-18 「대단원선택은 **접힌 상태에서** 가능하도록」 — 전에는 펼쳐야만 네모가 보였다.
              머리(.acch)는 button 이라 그 **안**에 네모를 넣으면 단추 속 단추가 된다 → 옆(형제)에 둔다. */}
          {!closed && <span className="wv" data-g="chapter-pick" style={{ gap: 4, margin: 0, padding: "0 0 0 8px" }}><PickGroup pick={pk} ids={c.units.map((u) => u.id)} label={`${c.chapter} 전체`} /></span>}
          <button type="button" className="acch" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.chapter)}><span className="ar">›</span><b>{c.chapter}</b><span className="spacer" />
            {fin ? <span className="tag on">{c.done}/{c.total} 완료{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : c.chapter === t.now ? <span className="tag act">지금 · {c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : <span className="tag">{c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span>}</button>
          {isOpen && <div className="accb">
            {c.units.map((u) => { const auto = t.today.includes(u.id) && t.memo; return (
              <div key={u.id} className="ur" data-g="prog-unit" data-unit={u.id} style={auto ? { background: "var(--sunk)", borderLeft: "3px solid var(--amber)", margin: "0 -8px", padding: "8px 8px", borderRadius: 8 } : undefined}>
                {!closed && <PickBox pick={pk} id={u.id} label={`${u.short} 고르기`} />}
                <span className="nm">{auto ? <b>{u.short}</b> : u.short}<small>{u.activity}{pagesText(u) ? ` · ${pagesText(u)}` : ""}{u.q_count ? ` · ${u.q_count}문항` : ""}{u.status === "skip" ? " · 건너뜀" : ""}{t.partsOf?.[u.id] ? <> · <span data-g="parts">{t.partsOf[u.id]}</span></> : null}{auto ? <> · <b style={{ color: "var(--navy)" }}>✍ 메모로 자동 ○</b></> : null}</small></span>
                {!closed && <button type="button" className="btn sm gho" data-act="done-upto" aria-label={`${u.short} 까지 모두 완료`} onClick={() => upTo(u)}>여기까지 ○</button>}
                <div className="tri" data-g={u.id}>{TRI.map(([k, ch, css]) => <button key={k} type="button" data-p={css} aria-pressed={(u.status === "skip" ? "none" : u.status) === k} disabled={closed} onClick={() => u.status !== k && set(u, k)}>{ch}</button>)}</div>
              </div>); })}
            <div style={{ marginTop: 12 }}><label className="fl">학습 메모</label><input type="text" value={t.memo} readOnly placeholder="(없음)" /></div>
            {!fin && !closed && <div className="wv" style={{ marginTop: 8 }}><button type="button" className="btn sm" onClick={() => skip(c.chapter)}>이 대단원 건너뛰기</button></div>}
          </div>}
        </div>); })}
      {!closed && <PickBar pick={pk} unit="개">{TRI.map(([k, ch]) => <button key={k} type="button" className="btn sm" data-act={`pick-${k}`} onClick={() => setMany(k)}>{ch} {markText(k)}</button>)}</PickBar>}
    </div>
    <div className="mdlf" data-g="prog-foot">
      {dirty > 0 && <span className="pill warn" data-g="prog-dirty">안 저장 {dirty}</span>}
      {dirty > 0 && <button type="button" className="btn sm gho" data-act="prog-revert" onClick={revert}>되돌리기</button>}
      <span className="spacer" />
      {/* (어90) 안 저장한 채 닫으면 **조용히 잃는다** — 한 번 더 묻는다(대전제-0 · 대전제-10 화면 안에서) */}
      {asking && <><span className="note" data-g="prog-ask" style={{ margin: 0, color: "var(--miss)" }}>안 저장 {dirty}</span>
        <button type="button" className="btn sm gho" data-act="prog-discard" onClick={() => { setAsking(false); onClose(); }}>버리고 닫기</button></>}
      {dirty > 0 && <button type="button" className="btn pri" data-act="prog-save" onClick={save}>저장</button>}
      <button type="button" className="btn gho" data-act="prog-close" onClick={tryClose}>닫기</button>
    </div>
  </>, tryClose);
}
