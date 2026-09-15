"use client";
/** 진도 체크 모달 한 벌((어34) 소단원 고르기 · 여기까지 ○ · (어41) 대시보드 17 과 오늘 01 이 같은 부품 · 원장님 9/15 「누르면 팝업이든 모달이든 뜨고 저장 하면 페이지도 안 벗어나고」).
 *  손은 api 로 받는다 · open(bookId) · set(unitId, st) · setMany(ids, st) · upTo(bookId, unitId) · skip(bookId, chapter) · 01 은 수업 일지 기준(app/today/actions.js) · 대시보드는 아이·오늘 기준(_shell/progress-actions.js). 판단·쓰기는 lib/progress.js 한 벌 */
import { useEffect, useMemo, useState } from "react";
import { usePick, PickGroup, PickBox, PickBar } from "./pick.js";
import { TRI, markText } from "@/lib/mark";   // (어43) 부호·말 한 곳
import { pagesText } from "@/lib/item-plan";
export default function ProgressModal({ b, api, closed = false, fail, start, onClose }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(null);
  const allIds = useMemo(() => (t?.chapters ?? []).flatMap((c) => c.units.map((u) => u.id)), [t]);
  const pk = usePick(allIds);
  const load = async () => { const r = await api.open(b.book_id); if (!fail(r)) { onClose(); return; } setT(r.tree); setOpen((o) => o ?? r.tree.now ?? r.tree.chapters[0]?.chapter ?? null); };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const shell = (body) => <div className="mdlov" role="dialog" aria-modal="true" aria-label="진도 체크" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="mdl" style={{ width: "min(560px,100%)" }}>{body}</div></div>;
  if (!t) return shell(<div className="mdlb"><p className="note">읽는 중…</p></div>);
  const set = (u, st) => start(async () => { if (fail(await api.set(u.id, st))) await load(); });
  const setMany = (st) => start(async () => { if (fail(await api.setMany(pk.ids, st))) { pk.clear(); await load(); } });
  const upTo = (u) => start(async () => { if (fail(await api.upTo(b.book_id, u.id))) await load(); });
  const skip = (chapter) => start(async () => { if (fail(await api.skip(b.book_id, chapter))) await load(); });
  const undone = t.chapters.reduce((n, c) => n + (c.total - c.done - c.skip), 0);
  return shell(<>
    <div className="mdlh"><b>진도 체크</b><span className="pill">{t.book?.name} · {t.round}회독</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
    <div className="mdlb">
      <div className="tags" style={{ marginBottom: 8 }}><span className="tag on">끝낸 대단원 {t.finished} / {t.chapters.length}</span>{t.now && <span className="tag act">지금 {t.now}</span>}<span className="tag">안 끝난 소단원 {undone}</span>{t.memo_streak > 0 && <span className={"tag" + (t.memo_streak >= t.memo_rule ? " act" : "")} data-g="memo-streak">✍ 메모로만 {t.memo_streak}회 연속</span>}</div>
      {t.memo_streak >= t.memo_rule && <p className="note" data-g="memo-warn" style={{ margin: "0 0 8px", color: "var(--miss)" }}>⚠️ 메모로만 {t.memo_streak}회 연속</p>}
      {t.chapters.map((c) => { const isOpen = open === c.chapter; const fin = c.done + c.skip === c.total && c.total > 0; return (
        <div key={c.chapter} className={"acc" + (isOpen ? " open" : "")} data-chapter={c.chapter}>
          <button type="button" className="acch" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.chapter)}><span className="ar">›</span><b>{c.chapter}</b><span className="spacer" />
            {fin ? <span className="tag on">{c.done}/{c.total} 끝냄{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : c.chapter === t.now ? <span className="tag act">지금 · {c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span> : <span className="tag">{c.done}/{c.total}{c.skip ? ` · 건너뜀 ${c.skip}` : ""}</span>}</button>
          {isOpen && <div className="accb">
            {!closed && <div className="wv" style={{ margin: "0 0 4px" }}><PickGroup pick={pk} ids={c.units.map((u) => u.id)} label="이 대단원 전체" /></div>}
            {c.units.map((u) => { const auto = t.today.includes(u.id) && t.memo; return (
              <div key={u.id} className="ur" data-g="prog-unit" data-unit={u.id} style={auto ? { background: "var(--sunk)", borderLeft: "3px solid var(--amber)", margin: "0 -8px", padding: "8px 8px", borderRadius: 8 } : undefined}>
                {!closed && <PickBox pick={pk} id={u.id} label={`${u.short} 고르기`} />}
                <span className="nm">{auto ? <b>{u.short}</b> : u.short}<small>{u.activity}{pagesText(u) ? ` · ${pagesText(u)}` : ""}{u.q_count ? ` · ${u.q_count}문항` : ""}{u.status === "skip" ? " · 건너뜀" : ""}{t.partsOf?.[u.id] ? <> · <span data-g="parts">{t.partsOf[u.id]}</span></> : null}{auto ? <> · <b style={{ color: "var(--navy)" }}>✍ 메모로 자동 ○</b></> : null}</small></span>
                {!closed && <button type="button" className="btn sm gho" data-act="done-upto" aria-label={`${u.short} 까지 모두 끝냄`} onClick={() => upTo(u)}>여기까지 ○</button>}
                <div className="tri" data-g={u.id}>{TRI.map(([k, mark]) => <button key={k} type="button" data-p={k} aria-pressed={(u.status === "skip" ? "none" : u.status) === k} disabled={closed} onClick={() => u.status !== k && set(u, k)}>{mark}</button>)}</div>
              </div>); })}
            <div style={{ marginTop: 12 }}><label className="fl">학습 메모</label><input type="text" value={t.memo} readOnly placeholder="(없음)" /></div>
            {!fin && !closed && <div className="wv" style={{ marginTop: 8 }}><button type="button" className="btn sm" onClick={() => skip(c.chapter)}>이 대단원 건너뛰기</button></div>}
          </div>}
        </div>); })}
      {!closed && <PickBar pick={pk} unit="개">{TRI.map(([k, ch]) => <button key={k} type="button" className="btn sm" data-act={`pick-${k}`} onClick={() => setMany(k)}>{ch} {markText(k)}</button>)}</PickBar>}
    </div>
    <div className="mdlf"><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
  </>);
}
