"use client";
/** 교재 판(목업 15) + 엑셀 올리기 모달(15b — 저장 전에 보여준다). 목록(영역 거르기 · 단원 수 · 쓰는 아이) · 고른 교재(교재ID · 영역 · 배정 겹 · 차례 기준 · 단원평가 · 다른 이름 · 활동 차례 · 단원 표 · 문법 분류) · + 교재 · ⬇ 엑셀 · ⬆ 올리기. 세는 것은 화면이 센다(원칙-5) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBookAct, setBookAct, aliasAct, topicsAct, addTopicAct, previewAct, applyAct, applyBooksAct, undoRunAct, unitAct, unitStateAct } from "./actions.js";
import { AREA_NAMES, CHUNK, BASIS, MODES, listRows, counts, activityOrder, pagesText, runLine, undoText } from "@/lib/book-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, book = b.book ?? null, rows = listRows(b.books ?? [], d.area), c = counts(b.books ?? []);
  const [adding, setAdding] = useState(false); const [nb, setNb] = useState({ name: "", area: "", code: "" }); const [alias, setAlias] = useState(""); const [code, setCode] = useState(null); const [topicName, setTopicName] = useState(""); const [up, setUp] = useState(false);
  const [uedit, setUedit] = useState({});   // 단원 한 줄 손질(쪽·문항) — 저장 전 값(4단계-4)
  const ue = (u, k, fb) => (uedit[u.id] && k in uedit[u.id] ? uedit[u.id][k] : fb), setUe = (u, k, v) => setUedit({ ...uedit, [u.id]: { ...(uedit[u.id] ?? {}), [k]: v } });
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(r); router.refresh(); });
  const q = (bid, area = d.area) => `/books?${[bid ? `b=${bid}` : "", area ? `a=${encodeURIComponent(area)}` : ""].filter(Boolean).join("&")}`;
  const acts = book ? activityOrder(book.units ?? []) : [];
  const topicsOf = (uid) => (book?.topics ?? []).filter((t) => t.unit_id === uid);
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }} data-g="count">교재 {c.total}권</span>
      <select value={d.area ?? ""} onChange={(x) => { window.location.href = q(book?.id, x.target.value || null); }} aria-label="영역으로 거르기" data-g="areas" style={{ width: "auto" }}><option value="">전체 {c.total}</option>{AREA_NAMES.map((a) => <option key={a} value={a}>{a} {c.byArea[a] ?? 0}</option>)}</select>
      <span className="spacer" />
      <span className={"pill" + (c.noUnits ? " warn" : "")} data-g="no-units">단원 없음 {c.noUnits}</span>
      {c.noArea > 0 && <span className="pill warn" data-g="no-area">영역 없음 {c.noArea}</span>}
      <a className="btn sm" href="/books/videos" data-act="videos">🎬 영상</a>
      <a className="btn sm" href="/api/books/xlsx" data-act="export-all">⬇ 엑셀</a>
      <a className="btn sm" href="/api/books/xlsx?s=books" data-act="export-books">⬇ 교재 시트</a>
      <button className="btn sm" type="button" data-act="upload-open" onClick={() => setUp(true)}>⬆ 올리기</button>
      <button className="btn pri sm" type="button" data-act="add-open" aria-pressed={adding} onClick={() => setAdding(!adding)}>+ 교재</button>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {adding && <div className="card" style={{ marginBottom: 8 }} data-g="add-form"><div className="wv">
      <input value={nb.name} onChange={(x) => setNb({ ...nb, name: x.target.value })} placeholder="교재 이름" aria-label="교재 이름" name="book-name" style={{ flex: "1 1 200px" }} />
      <select value={nb.area} onChange={(x) => setNb({ ...nb, area: x.target.value })} aria-label="영역" style={{ width: "auto" }}><option value="">영역 없음</option>{AREA_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
      <input value={nb.code} onChange={(x) => setNb({ ...nb, code: x.target.value })} placeholder="교재ID (예: G023)" aria-label="교재ID" style={{ width: 150 }} />
      <button className="btn pri sm" type="button" disabled={pending || !nb.name.trim()} data-act="add-save" onClick={() => run(() => addBookAct(nb), "교재를 더했습니다 — 단원은 엑셀로 올리세요", (r) => { setAdding(false); setNb({ name: "", area: "", code: "" }); window.location.href = q(r.id); })}>저장</button>
      <button className="btn sm" type="button" onClick={() => setAdding(false)}>닫기</button></div></div>}
    <div className="bkw">
      <div className="bklist" data-g="list">
        {!rows.length && <p className="note" style={{ margin: 8 }}>교재가 없습니다 — + 교재 또는 ⬆ 올리기</p>}
        {rows.map((r) => <a key={r.id} className={"bkr" + (book?.id === r.id ? " on" : "") + (r.noUnits || r.noArea ? " warn" : "")} href={q(r.id)} data-g="book-row" data-book={r.id} style={{ textDecoration: "none", color: "inherit" }}>
          <div><b>{r.name}{r.state !== "active" ? ` (${r.state === "paused" ? "쉼" : "안 씀"})` : ""}</b><small>{r.sub}{r.noArea ? <> · <b className="warnv">영역 없음</b></> : ""}</small></div>
          {r.noUnits ? <span className="tag" style={MISS}>단원 0</span> : <span className="tag on">{r.units}단원</span>}<span className="tag">{r.students}명</span></a>)}
      </div>
      {book ? <div className="bkdet" data-g="detail" data-book={book.id}>
        <div className="ctitle"><span className="cemo">📕</span><span data-g="book-name">{book.name}</span><span className="spacer" /><span className="tag">{book.import_batch === "import" ? "이관" : book.import_batch === "excel" ? "엑셀" : book.import_batch ?? ""}</span></div>
        <p className="note k" style={{ margin: "0 0 6px" }} data-g="book-meta">{[book.publisher, book.pub_year ? `${book.pub_year}년` : null, book.level ? `레벨 ${book.level}` : null, book.price != null ? `교재비 ${Number(book.price).toLocaleString("ko-KR")}원` : null].filter(Boolean).join(" · ") || "출판사 · 연도 · 레벨 · 교재비 없음"}{book.buy_url ? <> · <a href={book.buy_url} target="_blank" rel="noreferrer">구매 링크</a></> : null} — 교재 시트(⬆ 올리기)로 고칩니다</p>
        <div className="tune" style={{ marginBottom: 8 }} data-g="tune">
          <div><label className="fl">교재ID</label><div className="wv"><input value={code ?? book.code ?? ""} onChange={(x) => setCode(x.target.value)} aria-label="교재ID" style={{ width: 120 }} /><button className="btn sm" type="button" disabled={pending || code == null || code === (book.code ?? "")} data-act="code-save" onClick={() => run(() => setBookAct(book.id, { code }), "교재ID 를 적었습니다", () => setCode(null))}>저장</button></div></div>
          <div><label className="fl">영역</label><select value={book.area ?? ""} aria-label="영역" data-g="area" disabled={pending} onChange={(x) => run(() => setBookAct(book.id, { area: x.target.value || null }), x.target.value ? `영역 ${x.target.value}` : "영역 없음")} style={{ width: "auto" }}><option value="">영역 없음</option>{AREA_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <div><label className="fl">배정 겹 — 한 번에 나가는 덩어리</label><div className="seg sm" data-g="chunk">{CHUNK.map(([k, nm]) => <button key={k} type="button" aria-pressed={book.chunk_depth === k} disabled={pending} onClick={() => run(() => setBookAct(book.id, { chunk_depth: k }), `배정 겹 ${nm}`)}>{nm}</button>)}</div></div>
          <div><label className="fl">도는 차례</label><div className="seg sm" data-g="basis">{BASIS.map(([k, nm]) => <button key={k} type="button" aria-pressed={book.order_basis === k} disabled={pending} onClick={() => run(() => setBookAct(book.id, { order_basis: k }), `${nm}`)}>{nm}</button>)}</div></div>
          <div><label className="fl">단원평가 · 상태</label><div className="wv"><label className="ckl"><input type="checkbox" className="ck" checked={Boolean(book.unit_test)} disabled={pending} data-g="unit-test" onChange={(x) => run(() => setBookAct(book.id, { unit_test: x.target.checked }), x.target.checked ? "단원평가를 보는 교재" : "단원평가 없음")} /> 단원평가</label>
            <div className="seg sm" data-g="state">{[["active", "쓰는 중"], ["paused", "쉼"], ["stopped", "안 씀"]].map(([k, nm]) => <button key={k} type="button" aria-pressed={book.state === k} disabled={pending} onClick={() => run(() => setBookAct(book.id, { state: k }), `상태 ${nm}(지우지 않습니다)`)}>{nm}</button>)}</div></div></div>
        </div>
        <div className="wv" data-g="aliases"><span className="fl" style={{ margin: 0 }}>다른 이름</span>
          {(book.aliases ?? []).map((a) => <span key={a.alias} className="tag" data-g="alias">{a.alias}</span>)}
          <input value={alias} onChange={(x) => setAlias(x.target.value)} placeholder="+ 이름 더하기" aria-label="다른 이름" style={{ width: 160 }} /><button className="btn sm" type="button" disabled={pending || !alias.trim()} data-act="alias-add" onClick={() => run(() => aliasAct(book.id, alias), (r) => (r.added ? "다른 이름을 더했습니다" : "이미 있는 이름입니다"), () => setAlias(""))}>더하기</button>
          <span className="note k" style={{ margin: 0 }}>잇는 것은 언제나 <b>교재ID</b>입니다 — 이름은 어느 것도 다른 것을 덮지 않습니다</span></div>
        <div className="wv" style={{ marginTop: 8 }} data-g="acts"><span className="fl" style={{ margin: 0 }}>활동 차례</span>
          {acts.map((a, i) => <span key={a} className="wv" style={{ gap: 4 }}>{i > 0 && <span className="uma">→</span>}<span className="tag">{a}</span></span>)}
          {!acts.length && <span className="note" style={{ margin: 0 }}>단원이 없습니다</span>}
          <span className="note k" style={{ margin: 0 }}>엑셀 줄 순서에서 <b>저절로 나왔습니다</b></span></div>
        <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">🧱</span>단원 · 대 › 중 › 소<span className="spacer" /><span className="tag" data-g="unit-count">{(book.units ?? []).length}단원</span></div>
        <div className="tblwrap"><table data-g="unit-table"><thead><tr><th>대단원</th><th>중단원</th><th>소단원</th><th>활동명</th><th>학습유형</th><th>쪽</th><th>문항</th><th>문법 분류</th><th>손질</th></tr></thead><tbody>
          {(book.units ?? []).map((u) => <tr key={u.id} data-g="unit-row" data-unit={u.id} data-state={u.state} style={u.state === "hidden" ? { opacity: 0.55 } : undefined}><td className="sch">{u.chapter}</td><td>{u.mid ?? "—"}</td><td>{u.sub ?? "—"}</td><td>{u.activity}</td><td><span className={"tag" + (u.is_workbook ? "" : " type")}>{u.is_workbook ? "워크북" : "본책"}</span></td>
            <td className="num"><input type="text" className="scr" value={ue(u, "pages", (pagesText(u) ?? "").replace(/^p\./, ""))} aria-label={`${u.sub ?? u.chapter} 쪽`} placeholder="10-12" disabled={pending || u.state === "hidden"} style={{ width: 72 }} onChange={(x) => setUe(u, "pages", x.target.value)} /></td>
            <td className="num"><input type="text" className="scr" inputMode="numeric" value={ue(u, "qCount", u.q_count ?? "")} aria-label={`${u.sub ?? u.chapter} 문항`} disabled={pending || u.state === "hidden"} style={{ width: 56 }} onChange={(x) => setUe(u, "qCount", x.target.value.replace(/\D/g, ""))} /></td>
            <td><span className="wv" style={{ gap: 4 }}>{topicsOf(u.id).map((t) => <span key={t.topic_id} className="um hit"><b>{t.name}</b> <button type="button" className="btn sm gho" disabled={pending} data-act="topic-remove" onClick={() => run(() => topicsAct(u.id, topicsOf(u.id).filter((x) => x.topic_id !== t.topic_id).map((x) => x.topic_id)), "분류를 뗐습니다")}>✕</button></span>)}
              <select value="" aria-label={`${u.sub ?? u.chapter} 문법 분류`} disabled={pending} data-g="topic-pick" onChange={(x) => x.target.value && run(() => topicsAct(u.id, [...topicsOf(u.id).map((t) => t.topic_id), x.target.value]), "분류를 이었습니다")} style={{ width: "auto" }}><option value="">+ 잇기</option>{(b.topics_all ?? []).filter((t) => !topicsOf(u.id).some((x) => x.topic_id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></span></td>
            <td><span className="wv" style={{ gap: 4 }}>{uedit[u.id] && <button className="btn sm pri" type="button" disabled={pending} data-act="unit-save" onClick={() => run(() => unitAct(u.id, { pages: ue(u, "pages", (pagesText(u) ?? "").replace(/^p\./, "")), qCount: ue(u, "qCount", u.q_count ?? ""), gist: u.gist ?? "" }), "단원을 고쳤습니다(쪽·문항 — 조절·회차가 새 값으로 셉니다)", () => setUedit((st) => ({ ...st, [u.id]: undefined })))}>저장</button>}
              <button className="btn sm gho" type="button" disabled={pending} data-act="unit-state" onClick={() => run(() => unitStateAct(u.id, u.state === "hidden" ? "active" : "hidden"), u.state === "hidden" ? "되살렸습니다" : "숨겼습니다 — 깔기·회차·범위에서 빠집니다(지우지 않았습니다)")}>{u.state === "hidden" ? "되살리기" : "숨김"}</button></span></td></tr>)}
          {!(book.units ?? []).length && <tr><td colSpan={9} className="note">단원이 없습니다 — ⬆ 올리기로 엑셀을 올리세요</td></tr>}
        </tbody></table></div>
        <div className="wv" style={{ marginTop: 8 }} data-g="topics"><span className="fl" style={{ margin: 0 }}>문법 분류</span>{(b.topics_all ?? []).map((t) => <span key={t.id} className="um">{t.name}</span>)}
          <input value={topicName} onChange={(x) => setTopicName(x.target.value)} placeholder="+ 분류 (예: 관계사)" aria-label="문법 분류 이름" style={{ width: 160 }} /><button className="btn sm" type="button" disabled={pending || !topicName.trim()} data-act="topic-add" onClick={() => run(() => addTopicAct(topicName), "분류를 더했습니다", () => setTopicName(""))}>더하기</button>
          <span className="note k" style={{ margin: 0 }}>단원평가를 <b>볼지 말지는 학생 루틴</b>에서 정합니다</span></div>
        <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }} data-g="bar">
          <a className="btn sm" href={`/api/books/xlsx?b=${book.id}`} data-act="export-one">⬇ 이 교재 단원 엑셀</a>
          <span className="spacer" />
          <span className="pill" data-g="students">쓰는 학생 {(book.students ?? []).length}명{(book.students ?? []).length ? ` — ${book.students.join(", ")} · 지우지 못합니다` : ""}</span>
        </div>
      </div> : <div className="bkdet"><p className="note" style={{ margin: 0 }}>왼쪽에서 교재를 고르세요.</p></div>}
    </div>
    <Runs runs={b.runs ?? []} run={run} pending={pending} />
    {up && <Upload close={() => setUp(false)} run={run} pending={pending} />}
  </>;
}
/** 📦 올린 묶음(0057 · 0142) — 최근 8 · 되돌릴 수 있는 것(같은 표의 마지막 살아 있는 묶음 — SQL 이 정한다)만 「되돌리기」 · 두 번 눌러야 한다(되돌릴 수 없는 낙관 갱신은 안 한다 — 속도-5) */
function Runs({ runs, run, pending }) {
  const [arm, setArm] = useState(null);
  if (!runs.length) return null;
  return <div className="card" style={{ marginTop: 8 }} data-g="runs">
    <div className="ctitle"><span className="cemo">📦</span>올린 묶음<span className="spacer" /><span className="note k" style={{ margin: 0 }}>잘못 올렸으면 묶음째 되돌립니다 — 같은 표는 마지막 것부터 · 진도가 걸린 줄은 지우지 않고 숨깁니다</span></div>
    {runs.map((r) => { const l = runLine(r); return <div key={r.id} className="wv" style={{ padding: "4px 0", opacity: l.state === "undone" ? 0.6 : 1 }} data-g="run" data-run={r.id} data-state={l.state}>
      <b data-g="run-title">{l.title}</b><span className="note k" style={{ margin: 0 }}>{l.when}</span><span data-g="run-note">{l.note}</span>
      {l.state === "undone" && <span className="tag" data-g="run-undone">되돌림 {l.undoneAt}</span>}
      {l.canUndo && <button className={"btn sm" + (arm === r.id ? " pri" : " gho")} type="button" disabled={pending} data-act="run-undo" aria-pressed={arm === r.id} onClick={() => { if (arm !== r.id) { setArm(r.id); return; } run(() => undoRunAct(r.id), (x) => undoText(x.res), () => setArm(null)); }}>{arm === r.id ? "정말 되돌리기" : "되돌리기"}</button>}
    </div>; })}
  </div>;
}
/** 15b — 저장 전에 보여줍니다: 파일 읽기 → 맞은 교재마다 덮어쓰기/지우고 새로/건너뛰기 → 올리면 이렇게 됩니다 → 보류 풀기(다른 이름 등록 · 새 교재 · 건너뛰기) → 저장 */
function Upload({ close, run, pending }) {
  const [plan, setPlan] = useState(null); const [modes, setModes] = useState({}); const [holds, setHolds] = useState({}); const [err, setErr] = useState("");
  const read = (fd) => run(async () => { const r = await previewAct(fd); if (r.ok) { setPlan(r); setModes({}); setHolds({}); } return r; });
  const t = plan ? totalsFor(plan.perBook, modes) : null;
  const holdsLeft = plan?.holds ? plan.holds.filter((h) => !holds[h.key] || holds[h.key].act === "skip").reduce((n, h) => n + h.lines, 0) : 0;   // 교재 시트 계획엔 보류 목록이 없다(줄마다 act)
  return <div className="mdlov" data-g="upload"><div className="mdl" style={{ width: "min(640px, 100%)" }}>
    <div className="mdlh"><b>⬆ 엑셀 올리기 — 저장 전에 보여줍니다</b>{plan && <span className="pill" data-g="lines">{plan.lines}줄</span>}<button className="x" type="button" aria-label="닫기" onClick={close}>✕</button></div>
    <div className="mdlb">
      {!plan && <form action={read} className="wv" data-g="upload-form"><input type="file" name="file" accept=".xlsx,.xls,.csv" aria-label="단원 엑셀" style={{ width: "auto" }} /><button className="btn pri sm" type="submit" disabled={pending} data-act="upload-read">읽기</button>
        <span className="note k" style={{ margin: 0 }}>단원 시트 열: 교재명 · 대단원 · 중단원 · 소단원 · 활동명 · 시작페이지 · 끝페이지 · 문항수 · 문항범위(⬇ 엑셀 양식) — 교재 시트(교재명 · 영역 · 출판사 · 연도 · 레벨 · 교재비 · 구매링크 — ⬇ 교재 시트 양식)도 여기로. <b>첫 줄 열 이름</b>으로 알아봅니다</span></form>}
      {plan && plan.kind === "books" && <BooksPlan plan={plan} />}
      {plan && plan.kind !== "books" && <>
        <div className="ctitle"><span className="cemo">❓</span>이미 있는 교재를 어떻게 할까요</div>
        <div className="ovr" data-g="books">{plan.perBook.map((p) => { const m = modes[p.book_id] ?? "overwrite"; const u = plan.usage?.[p.book_id]; return <div key={p.book_id} className={"ovl" + (m !== "skip" ? " on" : "")} data-g="plan-book" data-book={p.book_id}>
          <div style={{ flex: 1, minWidth: 0 }}><b>{p.name}{p.file_name !== p.name ? ` ← 「${p.file_name}」(${p.how})` : ""}</b><small>파일 {p.rows.length || p.added + p.changed + p.same}줄 · 기존 {p.existing}줄</small>
            <div className="seg sm" data-g="mode">{MODES.map(([k, nm]) => <button key={k} type="button" aria-pressed={m === k} onClick={() => setModes({ ...modes, [p.book_id]: k })}>{nm}</button>)}</div>
            {m === "replace" && u && <div className="dngr" style={{ marginTop: 6 }} data-g="danger"><b>②를 고르면 이만큼이 같이 사라집니다 — {p.name}</b><div className="dgrid"><div><span>단원</span><b>{u.units}</b></div><div><span>학생 진도</span><b>{u.progress}</b></div><div><span>숙제 배정</span><b>{u.items}</b></div><div><span>시험 범위</span><b>{u.scopes}</b></div><div><span>쓰는 학생</span><b>{u.students}명</b></div></div><small>진도·숙제·범위가 걸려 있으면 표가 막아 <b>이 교재는 통째로 실패</b>합니다 — 개정판이라 단원이 통째로 바뀐 것이 아니면 ①을 권합니다</small></div>}
          </div></div>; })}{!plan.perBook.length && <p className="note" style={{ margin: 0 }}>맞은 교재가 없습니다 — 아래 보류를 푸세요.</p>}</div>
        <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">👀</span>올리면 이렇게 됩니다</div>
        <div className="upr ok" data-g="sum-added"><i>＋</i><div><b>새로 생김 {t.added}줄</b><small>없던 단원</small></div></div>
        <div className="upr ok" data-g="sum-changed"><i>✎</i><div><b>바뀜 {t.changed}줄</b><small>쪽수·문항수·내용이 다른 것</small></div></div>
        <div className="upr keep" data-g="sum-same"><i>=</i><div><b>손대지 않음 {t.same}줄</b><small>파일과 같습니다</small></div></div>
        <div className="upr keep" data-g="sum-untouched"><i>🔒</i><div><b>파일에 없는 기존 줄 {t.untouched}개 — 손대지 않음</b><small>엑셀에서 지워도 앱에서는 안 지워집니다(②만 지웁니다)</small></div></div>
        {plan.mangled.length > 0 && <div className="upr warn" data-g="sum-mangled"><i>📅</i><div><b>날짜 꼴이 된 문항범위 {plan.mangled.length}줄</b><small>{plan.mangled.slice(0, 8).join(", ")}행 — 엑셀이 「1-25」를 날짜로 바꿨습니다. 파일에서 고쳐 다시 올리세요(개수는 안 셌습니다)</small></div></div>}
        <div className={"upr" + (holdsLeft ? " warn" : " keep")} data-g="sum-holds"><i>⏸</i><div><b>보류 {holdsLeft}줄</b><small>교재 이름이 안 맞습니다 — 아래에서 풉니다</small></div></div>
        {plan.holds.length > 0 && <div className="hold" data-g="holds">{plan.holds.map((h) => { const hv = holds[h.key] ?? { act: "skip" }; return <div key={h.key} className="holdr" data-g="hold" data-name={h.name}><b>「{h.name}」</b><small>{h.first}행부터 {h.lines}줄 · {h.candidates.length ? `후보가 ${h.candidates.length}입니다 — ${h.candidates.map((c) => c.name).join(" / ")}` : "이 이름의 교재가 없습니다"}</small>
          <div className="wv" style={{ margin: "8px 0 0" }}>
            {h.candidates.length > 0 && <div className="seg sm">{h.candidates.map((c) => <button key={c.id} type="button" aria-pressed={hv.act === "alias" && hv.book_id === c.id} onClick={() => setHolds({ ...holds, [h.key]: { act: "alias", book_id: c.id } })}>{c.name}</button>)}</div>}
            {!h.candidates.length && <><select value={hv.act === "alias" ? hv.book_id ?? "" : ""} aria-label={`${h.name} 의 교재`} onChange={(x) => setHolds({ ...holds, [h.key]: x.target.value ? { act: "alias", book_id: x.target.value } : { act: "skip" } })} style={{ width: "auto" }}><option value="">…의 다른 이름으로 등록</option>{plan.books.map((bk) => <option key={bk.id} value={bk.id}>{bk.name}</option>)}</select>
              <button className="btn sm" type="button" aria-pressed={hv.act === "new"} data-act="hold-new" onClick={() => setHolds({ ...holds, [h.key]: { act: "new", area: hv.area ?? null } })}>새 교재로 만들기</button>
              {hv.act === "new" && <select value={hv.area ?? ""} aria-label="새 교재 영역" onChange={(x) => setHolds({ ...holds, [h.key]: { act: "new", area: x.target.value || null } })} style={{ width: "auto" }}><option value="">영역 없음</option>{AREA_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}</select>}</>}
            <button className="btn sm gho" type="button" aria-pressed={hv.act === "skip"} data-act="hold-skip" onClick={() => setHolds({ ...holds, [h.key]: { act: "skip" } })}>건너뛰기</button></div></div>; })}</div>}
        {plan.unknown.length > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>모르는 열은 무시했습니다 — {plan.unknown.join(" · ")}</p>}
      </>}
      {err && <p className="note" role="alert" style={{ margin: "8px 0 0", color: "var(--miss)" }}>{err}</p>}
    </div>
    <div className="mdlf">{plan && plan.kind === "books" && <button className="btn pri" type="button" disabled={pending || !plan.rows.length} data-act="upload-save" onClick={() => run(() => applyBooksAct(plan.rows, plan.name), (r) => `저장했습니다 — ${r.note}${r.held ? ` · 보류 ${r.held}` : ""}${r.failed.length ? ` · 실패: ${r.failed.join(" / ")}` : ""} · 묶음 #${r.run}(아래 「올린 묶음」에서 되돌릴 수 있습니다)`, close)}>{plan.bad.length ? `고칠 줄 ${plan.bad.length}을 뺀 나머지 저장` : "저장"}</button>}
      {plan && plan.kind !== "books" && <button className="btn pri" type="button" disabled={pending} data-act="upload-save" onClick={() => run(() => applyAct(plan.rows, { modes, holds }, plan.name), (r) => `저장했습니다 — 교재 ${r.books}권 · 줄 ${r.put + r.replaced}${r.skipped ? ` · 건너뜀 ${r.skipped}권` : ""}${r.holds ? ` · 보류 ${r.holds}권` : ""}${r.failed.length ? ` · 실패: ${r.failed.join(" / ")}` : ""} · 묶음 #${r.run}(아래 「올린 묶음」에서 되돌릴 수 있습니다)`, close)}>{holdsLeft ? `보류 ${holdsLeft}줄을 뺀 나머지 저장` : "저장"}</button>}
      <button className="btn gho" type="button" onClick={close}>닫기</button><span className="spacer" /><span className="pill">지우지 않습니다 — ②만 지우고, 그것도 진도가 걸리면 막힙니다 · 묶음 번호로 되돌릴 수 있습니다</span></div>
  </div></div>;
}
/** 교재 시트 미리보기 — 줄마다 새로 만듦 · 고침(어느 칸) · 같음 · 보류(후보 둘) · 고칠 줄(영역 밖 · 링크 꼴 · 같은 교재 두 줄) — 판단은 lib/book-plan planBookUpload·parseBookRows */
function BooksPlan({ plan }) {
  const ACT = { new: ["＋", "새로 만듦", "ok"], update: ["✎", "고침", "ok"], same: ["=", "같음", "keep"], hold: ["⏸", "보류", "warn"] };
  return <>
    <div className="ctitle"><span className="cemo">📕</span>교재 시트 — 올리면 이렇게 됩니다<span className="spacer" /><span className="pill" data-g="books-totals">새로 {plan.totals.new} · 고침 {plan.totals.update} · 같음 {plan.totals.same}{plan.totals.hold ? ` · 보류 ${plan.totals.hold}` : ""}{plan.bad.length ? ` · 고칠 줄 ${plan.bad.length}` : ""}</span></div>
    {plan.perRow.map((p) => { const [i, nm, cls] = ACT[p.act]; return <div key={p.line} className={"upr " + cls} data-g="book-plan" data-kind={p.act}><i>{i}</i><div><b>{p.name}{p.book && p.book.name !== p.name ? ` ← 「${p.book.name}」(${p.how})` : ""} — {nm}{p.act === "update" ? `: ${p.labels.join(" · ")}` : ""}</b><small>{p.line}행{p.act === "hold" ? ` · 후보가 ${p.candidates.length}입니다 — ${p.candidates.map((c) => c.name).join(" / ")} · 교재ID 열로 가르세요` : p.act === "new" ? ` · ${[p.area ?? "영역 없음", p.level, p.price != null ? `${p.price}원` : null].filter(Boolean).join(" · ")}` : p.act === "same" ? " · 시트와 같습니다(빈 칸은 지우지 않습니다)" : ""}</small></div></div>; })}
    {plan.bad.map((x) => <div key={x.line} className="upr warn" data-g="book-bad"><i>✕</i><div><b>{x.name} — 고칠 줄</b><small>{x.line}행 · {x.why} — 이 줄은 저장하지 않습니다</small></div></div>)}
    {plan.unknown.length > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>모르는 열은 무시했습니다 — {plan.unknown.join(" · ")}</p>}
  </>;
}
function totalsFor(perBook = [], modes = {}) { const live = perBook.filter((p) => (modes[p.book_id] ?? "overwrite") !== "skip"); return { added: live.reduce((n, p) => n + p.added, 0), changed: live.reduce((n, p) => n + p.changed, 0), same: live.reduce((n, p) => n + p.same, 0), untouched: live.reduce((n, p) => n + ((modes[p.book_id] ?? "overwrite") === "overwrite" ? p.untouched : 0), 0) }; }
