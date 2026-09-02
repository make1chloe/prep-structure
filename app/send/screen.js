"use client";
/**
 * 발송 — **원장님이 매일 저녁 여는 화면.** 데일리리포트 · 하원 · 안내가 여기 다 있다.
 * (계획 ㉕ 고르고·한 번에·예약 · ⑫ AI 브리핑 · ⑭ 늦귀가 · §속도 · 사고 #7·#8·#21·#27 ·
 *  오류 대장 34 「부모님께 나갈 글을 처음부터 쓰게 되어 있다」 · 79 「고르기·예약이 없었다」)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *    「보낼 수 있나」는 `./read.js` 의 `blockOf()` 한 벌이 답하고(뿌리는 `lib/close.js`),
 *    「정말 나갔나」는 `lib/push.js` 의 `outcome()` 이 답한다. 갈래·글자는 `./kinds.js` 한 벌.
 *
 * ── ⚠️⚠️ **탭이 없다.** 지금 앱 발송은 **7탭**이고 탭 전환마다 **~30건이 다시 돈다**(§속도 1).
 *    여기는 묶음 셋을 **한 화면에 급한 순서로** 세우고 **접기로 줄인다** — 접기는 다시 조회하지 않는다.
 *
 * ── 화면 차례 (급한 것이 위)
 *      ⚠️ 닿는 길      — 「보내도 대부분 안 닿는다」를 **맨 위에서** 밝힌다
 *      📨 데일리리포트  — 그날 판이 선 아이 (마감한 것만 나갈 수 있다)
 *      🕘 하원          — 남아서 하고 가는 아이 (**안 보내면 학부모는 모른 채 기다린다**)
 *      📢 안내          — 공지
 *      [접기] 예약해 둔 것 · 읽음 · 안 보낸 판 · 이 화면이 못 하는 것
 *      [아래 붙는 줄] 고른 수 · 지금 보내기 · 예약
 *
 * ── ⚠️ 안 쓰는 것 — `alert`/`confirm` · `position:fixed` · `history.pushState` · `createPortal`.
 *    되돌릴 수 없는 것(발송)은 **화면 안에서 한 번 묻고** 서버 답을 기다린다 (§속도 5).
 * ── ⚠️ **투명도로 흐리게 하지 않는다** (계획 ㉑). 못 고르는 줄도 흐리지 않고 **까닭을 적는다.**
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { KIND, BLOCK_WHY, SINK_SAID, plain } from "./kinds";
import { sendNow, schedule, cancelSchedule, saveText, resetText, resendOne } from "./actions";

const has = (v) => String(v ?? "").trim() !== "";
/** 시각 한 줄 — ⚠️ 없으면 「—」다. 「방금」 같은 말을 지어내지 않는다 */
const when = (v) => (v ? new Date(v).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function Screen(props) {
  const {
    on, today, daily = [], late = [], notice = [], sched = [], reads = [], facts = {},
    text = {}, sink = "off", ready = null, lockBody = "", queries = 0, cap = 6, why = [],
  } = props;

  const [picked, setPicked] = useState(() => new Set());   // "daily:<아이디>" 꼴
  const [asking, setAsking] = useState(false);             // ⚠️ confirm() 대신 화면 안에서 묻는다
  const [said, setSaid] = useState(null);
  const [rows, setRows] = useState([]);                    // 방금 보낸 결과 줄들
  const [openEdit, setOpenEdit] = useState(null);          // 글을 고치고 있는 판
  const [draft, setDraft] = useState({});                  // 판마다 고치는 중인 글
  const [saved, setSaved] = useState({});                  // 저장된 글을 그 줄에만 반영 (§속도 5)
  const [at, setAt] = useState("");                        // 「직접」 예약 시각
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [gone, setGone] = useState(() => new Set());       // 방금 내린 예약
  const [busy, start] = useTransition();

  /** ⚠️ 데일리는 **판(sheetId)** 으로 고른다 — `lib/push.js` 의 `sendDaily` 가 그 열쇠를 받는다 */
  const groups = useMemo(() => ([
    { key: "daily",  rows: daily,  idOf: (r) => r.sheetId ?? `no-sheet:${r.studentId}` },
    { key: "late",   rows: late,   idOf: (r) => r.id },
    { key: "notice", rows: notice, idOf: (r) => r.id },
  ]), [daily, late, notice]);

  /** 아이디 → 이름. 보낸 뒤 답에 이름이 없어도 화면이 사람 이름으로 말한다 */
  const nameOf = useMemo(() => {
    const m = new Map();
    for (const g of groups) for (const r of g.rows) m.set(`${g.key}:${g.idOf(r)}`, r.name ?? r.title ?? null);
    return m;
  }, [groups]);

  /** 고를 수 있는 줄만 — 못 나가는 줄은 애초에 안 세고 안 골라진다 */
  const pickable = useMemo(() => {
    const out = [];
    for (const g of groups) for (const r of g.rows) if (!r.block) out.push(`${g.key}:${g.idOf(r)}`);
    return out;
  }, [groups]);

  const countOf = (k) => [...picked].filter((x) => x.startsWith(`${k}:`)).length;
  const total = picked.size;

  const toggle = (key) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const setMany = (keys, onOff) => setPicked((s) => {
    const n = new Set(s);
    for (const k of keys) { if (onOff) n.add(k); else n.delete(k); }
    return n;
  });
  const groupKeys = (g) => g.rows.filter((r) => !r.block).map((r) => `${g.key}:${g.idOf(r)}`);

  /** 고른 것을 서버가 받는 모양으로 */
  const picksOf = () => {
    const out = { daily: [], late: [], notice: [] };
    for (const k of picked) { const i = k.indexOf(":"); out[k.slice(0, i)].push(k.slice(i + 1)); }
    return out;
  };

  /* ── 보내기 · 예약 ────────────────────────────────────────────────
   * ⚠️ **되돌릴 수 없다 → 낙관 갱신을 안 한다.** 서버 답을 기다려서 그 답만 적는다 (§속도 5). */
  const doSend = () => start(async () => {
    const r = await sendNow({ on, picks: picksOf() });
    setAsking(false);
    setRows(r.rows ?? []);
    setSaid(r.ok
      ? `${r.rows.length}건을 눌렀습니다 — 그중 진짜로 나간 것 ${r.out}건 (도장 ${r.stamped}건).`
      : plain(r.msg) || "못 보냈습니다.");
    if (r.ok) setPicked(new Set());
  });

  const doResend = (kind, id) => start(async () => {
    const r = await resendOne({ kind, id });
    setRows((s) => [{ ...r, name: nameOf.get(`${kind}:${id}`) }, ...s]);
    setSaid(plain(r.msg) || (r.ok ? "다시 보냈습니다." : "다시 못 보냈습니다."));
  });

  const doSchedule = (w) => start(async () => {
    const r = await schedule({ on, picks: picksOf(), when: w, at: w === "at" ? at : null });
    setAsking(false);
    setSaid(r.ok ? `예약했습니다 — ${r.made.length}건 (${when(r.made[0]?.at)})` : (r.msg ?? "예약하지 못했습니다."));
    if (r.ok) setPicked(new Set());
  });

  const doCancel = (id) => start(async () => {
    const r = await cancelSchedule(id);
    if (r.ok) setGone((s) => new Set(s).add(id));
    setSaid(r.ok ? "예약을 내렸습니다 — 지운 것이 아니라 내린 것입니다." : (r.msg ?? "못 내렸습니다."));
  });

  /* ── 나갈 글 고치기 · 되돌리기 ────────────────────────────────────
   * ⚠️ **되돌리기를 반드시 같이 둔다** — 안 두면 고친 글이 굳어, 나중에 점수를 고쳐도 옛 글이 나간다. */
  const doSave = (sheetId) => start(async () => {
    const r = await saveText({ sheetId, text: draft[sheetId] ?? "" });
    if (r.ok) { setSaved((m) => ({ ...m, [sheetId]: r.comment })); setOpenEdit(null); }
    setSaid(r.ok ? "나갈 글을 고쳤습니다. 「원래대로 되돌리기」로 언제든 돌아갑니다." : (r.msg ?? "못 고쳤습니다."));
  });

  const doReset = (sheetId) => start(async () => {
    const r = await resetText({ sheetId });
    if (r.ok) {
      setSaved((m) => ({ ...m, [sheetId]: "" }));
      setDraft((m) => ({ ...m, [sheetId]: "" }));
      setOpenEdit(null);
    }
    setSaid(r.ok ? "원래대로 되돌렸습니다 — 고쳤던 글은 자취(v2.audit)에 남습니다." : (r.msg ?? "못 되돌렸습니다."));
  });

  const commentOf = (r) => (r.sheetId in saved ? saved[r.sheetId] : (r.comment ?? ""));

  /* ── 그리기 ─────────────────────────────────────────────────────── */
  const sk = SINK_SAID[sink] ?? SINK_SAID.off;
  const devices = Number(facts.devices ?? 0);
  const leftSched = sched.filter((s) => !gone.has(s.id));
  const heldRows = rows.filter((r) => r.why === "hole");
  const shownReads = unreadOnly ? reads.filter((r) => !r.firstAt) : reads;

  return (
    <main className="wrap">
      <div className="stack">

        <div className="sn-head">
          <h1>발송</h1>
          <span className="num">{on ?? "—"}</span>
          {on && today && on !== today ? <span className="pill pillwarn">오늘({today})이 아닌 날입니다</span> : null}
          {/* ⚠️ 닫는 길은 언제나 화면 안에 (대전제 10). 홈에 깐 앱엔 주소창도 뒤로가기도 없다 */}
          <Link className="btn btnghost" href="/">← 대시보드</Link>
          <Link className="btn btnghost" href={on ? `/today?on=${on}` : "/today"}>오늘 화면</Link>
          <form method="get" action="/send" className="row">
            <input type="date" name="on" defaultValue={on ?? ""} aria-label="볼 날짜" className="fld grow" />
            <button className="btn" type="submit">그날 보기</button>
          </form>
        </div>

        {/* ⚠️⚠️ 실측을 맨 위에 세운다 — 「보내도 대부분 안 닿는다」를 모르면 원장님이 헛기다린다 */}
        <div className="sn-reach">
          <span className={`pill ${sk.pill}`}>발송 스위치 {sk.what}</span>
          <span>{sk.why}</span>
          {ready && !ready.ok ? <b>{plain(ready.msg)}</b> : null}
          <span className="num">학부모 계정 {facts.parents ?? 0}</span>
          <span className="num">아이에 이어진 계정 {facts.linked ?? 0}</span>
          <span className="num">알림 켠 기기 {devices}대</span>
          {facts.revoked ? <span className="num">꺼진 기기 {facts.revoked}대</span> : null}
          {devices === 0
            ? <b>→ 지금 눌러도 닿는 집이 0곳입니다. 알림은 학부모가 앱을 한 번 열어 켜야 붙습니다.</b>
            : null}
          <span>잠금화면에는 「{lockBody}」만 뜹니다 — 내용은 안 실립니다.</span>
        </div>

        {why.length ? <ul className="sn-said">{why.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
        {said ? <p className="sn-said">{said}</p> : null}

        {rows.length ? (
          <section className="card">
            <div className="cardhd">방금 누른 것 <span className="num">{rows.length}건</span></div>
            {rows.map((r, i) => (
              <p className="sn-list" key={`${r.kind}:${r.key}:${i}`}>
                <b className="sn-main">{r.name ?? nameOf.get(`${r.kind}:${r.key}`) ?? r.key}</b>
                <span className="chip">{KIND[r.kind]?.name ?? r.kind}</span>
                <span className={`pill ${r.ok ? "pillok" : "pillbad"}`}>
                  {r.ok ? `폰으로 ${r.sent}대` : "폰으로는 안 나감"}
                </span>
                {/* ⚠️ 「왜 안 나갔나」는 `lib/push.js` 가 준 글 그대로다 — 화면이 다시 짓지 않는다 */}
                <span className="sn-side">{plain(r.msg ?? r.why)}</span>
                {r.stamped ? <span className="pill pillinfo">보냄 도장</span> : null}
              </p>
            ))}
          </section>
        ) : null}

        {/* ══ 묶음 셋 — 탭이 아니라 한 화면에 급한 순서로 ══════════════ */}
        {groups.map((g) => {
          const keys = groupKeys(g);
          const allOn = keys.length > 0 && keys.every((k) => picked.has(k));
          const t = text[g.key] ?? null;
          return (
            <section className="card" key={g.key}>
              <div className="cardhd">
                {KIND[g.key].icon} {KIND[g.key].name}
                <span className="num">{g.rows.length}줄</span>
                <span className="num">고른 것 {countOf(g.key)}</span>
              </div>

              <div className="sn-grouphd">
                {/* ㉕ — 묶음 선택 */}
                <label className="sn-pick">
                  <input type="checkbox" checked={allOn} disabled={keys.length === 0}
                         onChange={(e) => setMany(keys, e.target.checked)} />
                  <span>이 묶음 다 고르기 ({keys.length})</span>
                </label>
                {t ? (
                  t.fromTemplate
                    ? <>
                        <span className="chip">잠금화면 제목 「{t.title}」</span>
                        <span className="pill pillinfo">문구에서 옴</span>
                      </>
                    /* ⚠️ 문구가 없을 때 화면이 기본 글을 **지어내지 않는다** — 그 글은 lib 이 갖고 있다 */
                    : <span className="pill pillwarn">
                        문구가 없어 lib 의 기본 제목으로 나갑니다 — <b>제목에 아이 이름이 들어갑니다</b>
                        (잠금화면에 그대로 뜹니다)
                      </span>
                ) : (
                  <span className="chip">제목·본문은 안내 줄 자신입니다</span>
                )}
                {t?.hole ? <span className="pill pillbad">문구에 안 채운 자리 {t.hole} — 보내도 되돌아옵니다</span> : null}
              </div>

              {g.rows.length === 0 ? (
                /* ⚠️ 원장 화면에서는 **빈 것도 보인다** — 빠뜨린 것을 잡으려면 남아 있어야 한다 (⑮ 3) */
                <p className="sn-why">
                  {g.key === "daily" ? "그날 수업하는 아이도 판도 없습니다 — 날짜를 바꿔 보세요."
                   : g.key === "late" ? "남아서 하고 간 아이가 없습니다."
                   : "만들어 둔 안내가 없습니다."}
                </p>
              ) : null}

              <div className="sn-group">
                {g.rows.map((r) => {
                  const id = g.idOf(r);
                  const key = `${g.key}:${id}`;
                  const cmt = g.key === "daily" ? commentOf(r) : null;
                  return (
                    <div className="sn-row" key={key}>
                      {/* ㉕ — 줄 선택. ⚠️ 못 나가는 줄은 흐리게 하지 않고 **까닭을 적는다** */}
                      <label className="sn-pick">
                        <input type="checkbox" checked={picked.has(key)} disabled={Boolean(r.block)}
                               onChange={() => toggle(key)} aria-label={`${r.name ?? r.title ?? ""} 고르기`} />
                      </label>
                      <b className="sn-main">{r.name ?? r.title ?? "이름 없음"}</b>

                      {g.key === "daily" ? (
                        <span className="sn-side">
                          <span className={`pill ${r.visible ? "pillok" : "pillwarn"}`}>
                            {r.visible ? "마감함" : (r.familyLabel ?? "마감 전")}
                          </span>
                          <span className="chip">{has(cmt) ? "글 있음" : "글 없음"}</span>
                          <span className="num">닿는 집 {r.parents}명 · 기기 {r.devices}대</span>
                          {r.sentAt ? <span className="pill pillok">보냄 {when(r.sentAt)}</span> : null}
                          {r.firstOpen ? <span className="num">처음 읽음 {when(r.firstOpen)} · {r.opens}번</span>
                                       : <span className="pill pilloff">아직 안 읽음</span>}
                        </span>
                      ) : null}

                      {g.key === "late" ? (
                        <span className="sn-side">
                          <span className="grow">{has(r.reason) ? r.reason : "까닭 없음"}</span>
                          <span className="num">예상 귀가 {r.untilAt ?? "—"}</span>
                          <span className="num">실제 하원 {r.leftAt ?? "—"}</span>
                          <span className={`pill ${r.sentAt ? "pillok" : "pillbad"}`}>
                            {r.sentAt ? `보냄 ${when(r.sentAt)}` : "아직 안 보냄"}
                          </span>
                          <span className="num">닿는 집 {r.parents}명 · 기기 {r.devices}대</span>
                        </span>
                      ) : null}

                      {g.key === "notice" ? (
                        <span className="sn-side">
                          <span className="chip">{r.toRole === "both" ? "아이·학부모" : r.toRole === "parent" ? "학부모" : "아이"}</span>
                          <span className="chip">{r.ring ? "울림" : "안 울림"}</span>
                          <span className="chip">{r.place === "banner" ? "띠" : "앱 안"}</span>
                          <span className={`pill ${r.sentAt ? "pillok" : "pilloff"}`}>
                            {r.sentAt ? `보냄 ${when(r.sentAt)}` : "아직 안 보냄"}
                          </span>
                          {/* 읽음 셋이 다 있는 유일한 자리 — v2.notice_read 가 처음·마지막·횟수를 갖고 있다 */}
                          <span className="num">읽은 사람 {r.readers}명 · {r.opens}번</span>
                          <span className="num">처음 {when(r.firstAt)} · 마지막 {when(r.lastAt)}</span>
                        </span>
                      ) : null}

                      {r.block ? <span className="sn-why">{BLOCK_WHY[r.block] ?? r.block}</span> : null}

                      {/* ⚠️ 「다시 보내기」는 **그 줄에서 따로** 누른다 — 묶음으로 켜면 스무 집에 두 번 간다 */}
                      {r.block === "already_sent" && g.key !== "notice" ? (
                        <button className="btn btnghost" type="button" disabled={busy}
                                onClick={() => doResend(g.key, id)}>다시 보내기</button>
                      ) : null}

                      {/* ── 부모님께 나갈 글 (오류 34 · 계획 ⑫) ─────────────── */}
                      {g.key === "daily" && r.sheetId ? (
                        openEdit === r.sheetId ? (
                          <span className="sn-edit">
                            <label className="lbl" htmlFor={`t-${r.sheetId}`}>
                              부모님께 나갈 글 — 마감하면 이 글이 학부모 화면에 그대로 보입니다
                            </label>
                            <textarea id={`t-${r.sheetId}`} className="fld" rows={4}
                                      value={draft[r.sheetId] ?? cmt ?? ""}
                                      onChange={(e) => setDraft((m) => ({ ...m, [r.sheetId]: e.target.value }))} />
                            <span className="sn-why">
                              ⚠️ 키워드만 적으면 AI 가 살을 붙이는 자리는 <b>아직 없습니다</b> —
                              lib 에 AI 를 부르는 한 벌이 없어 만들지 않았습니다(대전제 0).
                              말투 본보기도 지금 {facts.samples ?? 0}줄입니다.
                              AI 가 붙는 날에도 <b>이 고치는 칸은 그대로 남습니다</b> — AI 글을 그대로 안 내보냅니다.
                            </span>
                            <span className="mdlf">
                              <button className="btn btnghost" type="button" onClick={() => setOpenEdit(null)}>닫기</button>
                              {/* ⚠️ 되돌리기를 **반드시** 같이 둔다 — 안 두면 고친 글이 굳어 옛 글이 나간다 */}
                              <button className="btn btnghost" type="button" disabled={busy}
                                      onClick={() => doReset(r.sheetId)}>원래대로 되돌리기</button>
                              <button className="btn btnmain" type="button" disabled={busy}
                                      onClick={() => doSave(r.sheetId)}>저장</button>
                            </span>
                          </span>
                        ) : (
                          <span className="sn-side">
                            <span className="grow">{has(cmt) ? cmt : "나갈 글이 비어 있습니다 — 숫자만 갑니다"}</span>
                            <button className="btn btnghost" type="button"
                                    onClick={() => { setDraft((m) => ({ ...m, [r.sheetId]: cmt ?? "" })); setOpenEdit(r.sheetId); }}>
                              글 고치기
                            </button>
                          </span>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* ══ 접기 — 탭이 아니다. 펴도 다시 조회하지 않는다 ════════════ */}

        <details className="sn-fold">
          <summary className="sn-foldhd">⏰ 예약해 둔 것 <span className="num">{leftSched.length}건</span></summary>
          <div className="sn-foldbd">
            <p className="sn-why">
              ⚠️ <b>크론이 아직 예약을 안 내보냅니다.</b> 크론은 때가 된 예약을 <b>세기만</b> 하고
              실제로 보내는 자리가 비어 있습니다. 그리고 예약 표에는
              <b> 어느 날 판인지 가리키는 칸이 없습니다</b> — 붙는 날 「그 아이의 어느 날」을 못 고릅니다.
            </p>
            {leftSched.length === 0 ? <p className="sn-kv">예약해 둔 것이 없습니다.</p> : null}
            {leftSched.map((s) => (
              <p className="sn-list" key={s.id}>
                <b className="sn-main">{s.name ?? "이름 없음"}</b>
                <span className="chip">{KIND[s.kind]?.name ?? s.kind}</span>
                <span className="num">{when(s.at)}</span>
                <button className="btn btnghost" type="button" disabled={busy} onClick={() => doCancel(s.id)}>내리기</button>
              </p>
            ))}
          </div>
        </details>

        <details className="sn-fold">
          <summary className="sn-foldhd">📖 읽음 <span className="num">자취 {facts.logs ?? 0}줄</span></summary>
          <div className="sn-foldbd">
            <label className="sn-pick">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              <span>안 읽은 집만 보기</span>
            </label>
            <p className="sn-why">
              ⚠️ 「봤나 안 봤나」로 끝내지 않습니다 — <b>처음 · 마지막 · 횟수</b>를 봅니다.
              그런데 <b>알림 자취에 「마지막으로 읽은 때」 칸이 없습니다</b>
              (처음과 횟수는 있는데 마지막이 없습니다). 안내(공지)는 읽음 표가 셋을 다 갖고 있어
              위 묶음에 그대로 보입니다.
              ⚠️ 그리고 <b>「만든 때」 칸도 없어</b> 안 나간 줄은 언제 누른 것인지 모릅니다.
            </p>
            {shownReads.length === 0
              ? <p className="sn-kv">{unreadOnly ? "안 읽은 줄이 없습니다." : "자취가 아직 없습니다."}</p> : null}
            {shownReads.map((l) => (
              <p className="sn-list" key={l.id}>
                <b className="sn-main">{l.studentName ?? "—"}</b>
                <span className="chip">{KIND[l.kind]?.name ?? l.kind}</span>
                <span className="chip">{l.toName ?? l.toRole ?? "—"}</span>
                <span className={`pill ${l.sentAt ? "pillok" : "pilloff"}`}>
                  {l.sentAt ? `나감 ${when(l.sentAt)}` : `안 나감 (스위치 ${l.sink})`}
                </span>
                <span className="num">처음 {when(l.firstAt)}</span>
                <span className="num">마지막 —</span>
                <span className="num">{l.opens ?? 0}번</span>
                {l.failedAt ? <span className="pill pillbad">실패 {l.failWhy}</span> : null}
              </p>
            ))}
          </div>
        </details>

        <details className="sn-fold">
          <summary className="sn-foldhd">🧾 안 보낸 판 <span className="num">{heldRows.length}건</span></summary>
          <div className="sn-foldbd">
            <p className="sn-why">
              안 채운 치환 자리가 있으면 발송이 <b>되돌립니다.</b>
              되돌린 것은 <b>「안 보낸 판」</b>으로 남아 <b>빠뜨린 것과 구별됩니다</b> — 자취에도 안 남습니다.
              ⚠️ 자리를 채워 주는 한 벌이 lib 에 아직 없어 화면이 대신 채우지 않습니다(대전제 0) —
              채우면 「치환 자리 이름」이 두 벌이 됩니다.
            </p>
            {heldRows.length === 0 ? <p className="sn-kv">이번에 되돌아온 판이 없습니다.</p> : null}
            {heldRows.map((r, i) => (
              <p className="sn-list" key={`${r.kind}:${r.key}:${i}`}>
                <b className="sn-main">{r.name ?? nameOf.get(`${r.kind}:${r.key}`) ?? r.key}</b>
                <span className="chip">{KIND[r.kind]?.name ?? r.kind}</span>
                <span className="pill pillbad">{plain(r.msg)}</span>
              </p>
            ))}
          </div>
        </details>

        <details className="sn-fold">
          <summary className="sn-foldhd">
            ⚙️ 이 화면이 지금 못 하는 것 <span className="num">조회 {queries}번 / 상한 {cap}</span>
          </summary>
          <div className="sn-foldbd">
            <ul>
              <li><b>키워드 → AI 브리핑이 없습니다.</b> 길이 넷(50·100·200·300자)과 상황 다섯도
                  부를 자리가 없어 안 그렸습니다. 있는 척하지 않습니다(대전제 0).</li>
              <li><b>안내(공지)는 lib 에 보내는 한 벌이 없습니다.</b> 데일리·하원은 lib 이 보내지만
                  안내만 이 화면이 직접 잇습니다 — 그 한 벌이 서면 이 자리를 지웁니다.</li>
              <li><b>안내(공지)는 예약이 안 됩니다.</b> 예약 표에 공지를 가리키는 칸이 없습니다.</li>
              <li><b>문구 고치기는 설정 화면 몫입니다.</b> 여기서는 「무엇이 나가나」만 보여 줍니다.</li>
              <li><b>「로그인한 적 있는 집」을 못 셉니다.</b> 로그인 표는 이 화면이 못 읽습니다
                  (실측 — permission denied). 그래서 위에는 <b>알림 켠 기기 수</b>만 적었습니다.</li>
            </ul>
            {queries > cap
              ? <p className="sn-why">⚠️ 조회 {queries}번으로 상한 {cap}을 넘었습니다 — 감추지 않고 적습니다.</p>
              : <p className="sn-kv">조회 {queries}번 · 상한 {cap} 안입니다.</p>}
          </div>
        </details>

        {/* ══ 아래 붙는 줄 — 고른 수가 **늘 보인다** (㉕) ═══════════════
            ⚠️ `position:fixed` 가 아니다. globals 의 `.barfix`(sticky)가 자리를 잡는다 */}
        <div className="barfix">
          <div className="sn-bar">
            <span className="sn-count">고른 것 {total}건</span>
            {/* ㉕ — 전체 선택 */}
            <label className="sn-pick">
              <input type="checkbox" checked={total > 0 && total === pickable.length}
                     disabled={pickable.length === 0}
                     onChange={(e) => setMany(pickable, e.target.checked)} />
              <span>다 고르기 ({pickable.length})</span>
            </label>

            {asking ? (
              /* ⚠️ `confirm()` 을 안 쓴다. **화면 안에서** 한 번 묻는다 — 되돌릴 수 없는 자리다 */
              <span className="sn-when">
                <span className="pill pillwarn">{total}건을 보냅니다 — {sk.why}</span>
                <button className="btn btnghost" type="button" onClick={() => setAsking(false)}>그만두기</button>
                <button className="btn btnmain" type="button" disabled={busy} onClick={doSend}>
                  {busy ? "보내는 중…" : "네, 보냅니다"}
                </button>
              </span>
            ) : (
              <button className="btn btnmain" type="button" disabled={total === 0 || busy}
                      onClick={() => setAsking(true)}>지금 보내기</button>
            )}

            <details className="sn-fold">
              <summary className="sn-foldhd">예약으로 보내기</summary>
              <div className="sn-foldbd">
                <span className="sn-when">
                  <button className="btn" type="button" disabled={total === 0 || busy}
                          onClick={() => doSchedule("tonight")}>오늘 21:00</button>
                  <button className="btn" type="button" disabled={total === 0 || busy}
                          onClick={() => doSchedule("tomorrow")}>내일 09:00</button>
                  <input type="datetime-local" className="fld grow" value={at} aria-label="예약 시각 직접"
                         onChange={(e) => setAt(e.target.value)} />
                  <button className="btn" type="button" disabled={total === 0 || busy || at === ""}
                          onClick={() => doSchedule("at")}>이때 예약</button>
                </span>
              </div>
            </details>
          </div>
        </div>

      </div>
    </main>
  );
}
