"use client";

/**
 * 대시보드의 **손이 닿는 곳** — 접기 · 카드 차례 · 거르개 · 끄기.
 *
 * ⚠️ **판단은 한 줄도 없다.** 세어 나온 값은 전부 서버에서 `lib/` 이 준 것을 받아 그리기만 한다.
 *
 * 지키는 것 (계획 「속도」 5 · ⑮ · 대전제 8·10)
 *   · **누른 그 단추만 바뀐다.** 화면을 다시 그리지 않고, 서버로는 뒤에서 보낸다.
 *     실패하면 **그 단추만 되돌리고** 그 자리에 글로 알린다.
 *   · **탭이 없다.** 접기로 줄이고, **접기는 다시 조회하지 않는다.**
 *   · **거르개도 다시 조회하지 않는다** — 줄마다 「어느 거르개를 지나는지」가 이미 붙어 있다.
 *   · `alert`/`confirm` · `position:fixed` 잠금 · `createPortal` 을 안 쓴다.
 *   · **닫는 길은 늘 화면 안에** 있다 (펼친 것은 같은 단추로 접는다).
 *
 * ⚠️ 새 색·새 글씨 크기를 만들지 않는다. `app/globals.css` 의 토큰만 쓴다.
 * ⚠️ 한 낱말 상태 클래스(`open`·`on`·`sel`)를 쓰지 않는다 — `is-open` · `is-sel` 뿐이다.
 */

import { useState, useTransition } from "react";
import { turnProgressEditOff, saveCardOrder } from "./actions.js";

/* ══ 1. 접기 ══════════════════════════════════════════════════════════
 * ⚠️ 「끝낸 것은 아래로 접고 개수만 띄운다」(⑮ 2). **접힌 것도 분자에 그대로 들어간다** —
 *    접기는 보이는 것만 바꾸지 세는 것을 안 바꾼다.                                   */
export function Fold({ title, note = null, count = null, open = false, children }) {
  const [is, setIs] = useState(open);
  return (
    <div className={`acc${is ? " is-open" : ""}`}>
      <button
        type="button"
        className="btn btnghost"
        aria-expanded={is}
        onClick={() => setIs((v) => !v)}
        style={{ width: "100%", justifyContent: "flex-start", gap: "var(--s2)",
                 border: 0, borderRadius: "var(--r2)", textAlign: "left" }}
      >
        <span aria-hidden="true" style={{ color: "var(--mute)" }}>{is ? "▾" : "▸"}</span>
        {/* ⚠️ `.btn` 은 글을 안 접는다(nowrap). 긴 한글 제목은 여기서 다시 접게 한다 */}
        <span style={{ whiteSpace: "normal", flex: "1 1 120px" }}>{title}</span>
        {count != null && <span className="num chip">{count}</span>}
      </button>
      {note && (
        <div className="muted" style={{ padding: "0 var(--s3) var(--s2)", fontSize: "var(--fs2)" }}>
          {note}
        </div>
      )}
      <div className="accbd">{children}</div>
    </div>
  );
}

/* ══ 2. 맨 위 한 줄 — 진도 체크가 열려 있다 (절 ㊶) ════════════════════
 * ⚠️⚠️ **켜 놓고 잊는 것을 막는 장치가 이 한 줄뿐이다.** 지우지 마라.
 *    「며칠째」는 `v2.progress_open_days()` 가 센다 — 저장하지 않는다(원칙 5).       */
export function EditOpenLine({ days, from }) {
  const [gone, setGone] = useState(false);      // 눌린 그 줄만 바뀐다
  const [why, setWhy] = useState("");
  const [busy, start] = useTransition();

  if (gone && !why)
    return (
      <p className="sunk" style={{ margin: 0, color: "var(--ok-fg)", background: "var(--ok-bg)" }}>
        진도 체크를 껐습니다.
      </p>
    );

  return (
    <div
      className="row"
      style={{ background: "var(--warn-bg)", color: "var(--warn-fg)",
               border: "1px solid var(--warn)", borderRadius: "var(--r2)",
               padding: "var(--s2) var(--s3)" }}
    >
      <strong style={{ flex: "1 1 220px", whiteSpace: "normal" }}>
        진도 체크가{" "}
        <span className="num">{days == null ? "⚠️ 며칠째인지 모름" : `${days}일째`}</span>{" "}
        열려 있습니다
        {from && <span className="muted" style={{ color: "inherit" }}> (켠 날 {from})</span>}
      </strong>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => {
          setWhy("");
          setGone(true);                                  // 먼저 바꾸고
          start(async () => {
            const r = await turnProgressEditOff();        // 뒤에서 보낸다
            if (!r.ok) { setGone(false); setWhy(r.why); } // 실패하면 **이 단추만** 되돌린다
          });
        }}
      >
        {busy ? "끄는 중…" : "끄기"}
      </button>
      {why && <span style={{ flex: "1 1 100%", whiteSpace: "normal" }}>⚠️ 못 껐습니다 — {why}</span>}
    </div>
  );
}

/* ══ 3. 카드 차례 — ▲▼ (절 ⑮ 1) ══════════════════════════════════════
 * ⚠️ 끌기는 폰에서 스크롤과 부딪혀 자주 실패한다 → **▲▼ 를 같이 둔다**는 것이 계획인데,
 *    지금은 **▲▼ 만** 있다. 끌기는 아직 안 만들었다(보고에 적었다).
 * ⚠️ 차례를 바꿔도 **카드 속을 다시 안 그린다** — flex 의 `order` 만 바꾼다.
 *    다시 그리면 그 카드가 서버를 또 부른다(계획 「속도」 5).                        */
export function CardDeck({ ids, labels, initial, children }) {
  const known = ids.map(String);
  const start0 = (initial ?? []).filter((k) => known.includes(k));
  const [order, setOrder] = useState([...start0, ...known.filter((k) => !start0.includes(k))]);
  const [why, setWhy] = useState("");
  const [busy, start] = useTransition();

  const move = (id, d) => {
    const i = order.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    next[i] = next[j]; next[j] = id;
    setOrder(next);                                        // 먼저 바꾸고
    setWhy("");
    start(async () => {
      const r = await saveCardOrder(next);                 // 뒤에서 보낸다
      if (!r.ok) { setOrder(order); setWhy(r.why); }       // 실패하면 그 자리만 되돌린다
    });
  };

  return (
    <div className="stack">
      {why && (
        <p className="sunk" style={{ margin: 0, color: "var(--bad-fg)", background: "var(--bad-bg)" }}>
          ⚠️ 카드 차례를 못 저장했습니다 — {why} (지금 보이는 차례는 이 화면에서만 그렇습니다)
        </p>
      )}
      {known.map((id) => (
        <section key={id} className="card" style={{ order: order.indexOf(id) }}>
          <div className="cardhd">
            <span style={{ flex: "1 1 160px", whiteSpace: "normal" }}>{labels[id]}</span>
            <span className="row" style={{ gap: "var(--s1)" }}>
              <button type="button" className="btn btnghost" disabled={busy || order.indexOf(id) === 0}
                      onClick={() => move(id, -1)} style={{ padding: "0 var(--s3)" }}>
                <span aria-hidden="true">▲</span><span className="sronly">위로</span>
              </button>
              <button type="button" className="btn btnghost"
                      disabled={busy || order.indexOf(id) === known.length - 1}
                      onClick={() => move(id, 1)} style={{ padding: "0 var(--s3)" }}>
                <span aria-hidden="true">▼</span><span className="sronly">아래로</span>
              </button>
            </span>
          </div>
          {children[known.indexOf(id)]}
        </section>
      ))}
    </div>
  );
}

/* ══ 4. 내 할 일 — **바깥 축은 「할 일 종류」** (절 ㊴) ═════════════════
 * ⚠️ 학교는 **거르개 한 줄**이다. 학교를 바깥 축으로 두면 인쇄 목록이 다섯 군데로 흩어지고
 *    겹치는 것이 아홉 번 뜬다 (㊴ · ㉞ 실측).
 * ⚠️ 거르개를 눌러도 **서버를 다시 안 부른다** — 줄마다 `pass` 가 이미 붙어 있다.       */
export function TodoBoard({ groups, aside, filters, counts, moved, lateN }) {
  const [f, setF] = useState("all");
  const seen = (rows) => rows.filter((r) => (r.pass ?? []).includes(f));

  const shown = groups.map((g) => ({ ...g, seen: seen(g.rows) }));
  const nAll = shown.reduce((s, g) => s + g.seen.length, 0);
  const asideSeen = seen(aside?.rows ?? []);

  return (
    <div className="stack">
      {/* 거르개 한 줄 — 탭이 아니다. 누르면 보이는 것만 바뀐다.
          ⚠️ `.skinpick`·`.skinbtn` 을 빌려 쓰지 않는다 — 그 이름은 **배색 고르는 줄**의 것이다.
             이름 하나에 뜻 둘을 담으면 이 저장소에서 세 번 터진 그 자리가 다시 열린다. */}
      <div className="row" role="group" aria-label="학교 거르개">
        {filters.map((x) => (
          <button key={x.key} type="button" aria-pressed={f === x.key}
                  className={`btn${f === x.key ? " is-sel" : " btnghost"}`}
                  onClick={() => setF(x.key)}
                  style={f === x.key
                    ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 }
                    : undefined}>
            {x.label}
          </button>
        ))}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: "var(--fs2)" }}>
        보이는 것 <span className="num">{nAll}</span>개 · 안 끝난 것{" "}
        <span className="num">{counts?.open ?? 0}</span>개
        {lateN > 0 && <> · 마감이 지난 것 <span className="num">{lateN}</span>개</>}
        {moved > 0 && <> · 마감을 앞 수업일로 당긴 것 <span className="num">{moved}</span>개</>}
      </p>

      {/* ⚠️ **원장 화면에서는 빈 칸도 보인다**(⑮ 3 · 물음 T) — 「이 종류 0개」가 남아 있어야
          빠뜨린 것을 잡는다. 숨기는 것은 아이·학부모 화면뿐이다 */}
      {shown.map((g) => (
        <Fold key={g.key} open={g.seen.length > 0}
              title={`${g.icon ?? "•"} ${g.label}`} count={g.seen.length}>
          {g.seen.length === 0
            ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
            : <TodoRows rows={g.seen} />}
        </Fold>
      ))}

      {/* ⚠️ 옛 앱 학사일정은 **치우되 세어서 말한다** — 조용히 사라지면 아무도 못 알아챈다 */}
      {aside && (
        <Fold title={aside.label} count={asideSeen.length}
              note="원장님 할 일이 아니라 학교가 정한 날입니다 — 일정 화면에서 봅니다.">
          {asideSeen.length === 0
            ? <p className="muted" style={{ margin: 0 }}>없습니다.</p>
            : <TodoRows rows={asideSeen} />}
        </Fold>
      )}
    </div>
  );
}

function TodoRows({ rows }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr className="hdstick"><th>할 일</th><th>마감</th><th>왜 생겼나</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.title}
                {r.state === "done" && <> <span className="pill pillok">끝</span></>}
              </td>
              <td className="num">
                {r.due_on ?? "—"}
                {r.pulled && <> <span className="pill pillinfo">당김</span></>}
                {r.pullWarn && <> <span className="pill pillwarn">주말</span></>}
              </td>
              {/* ⚠️ 저절로 생긴 카드는 **왜 생겼는지를 앞면에 적는다** (자동화 뼈대 ③) */}
              <td className="muted">{r.why ?? "손으로 적은 것"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
