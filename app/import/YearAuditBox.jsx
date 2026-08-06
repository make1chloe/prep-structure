"use client";

import { useState, useTransition } from "react";
import { auditYears } from "./yearAudit";

/**
 * **연도 점검** — 24·25·26년이 섞여 들어가지 않았나 (2026-08-06).
 *
 * 원장님 — 「노션자료에서 24,25,26년이 서로 구별되지 않게 적혀서 혼용된 거
 * 없나 싹 확인해줘」
 *
 * **아무것도 바꾸지 않는다.** 세어서 보여주기만 한다. 고치는 것은 바로 아래
 * 「연도 되돌리기」 에서 범위를 눈으로 확인하고 하신다 — 날짜를 잘못 옮기면
 * 되돌리기가 더 어렵다.
 */
export default function YearAuditBox() {
  const [res, setRes] = useState(null);
  const [pending, start] = useTransition();

  function look() {
    start(async () => setRes(await auditYears()));
  }

  const TONE = { bad: "err", warn: "notice", muted: "hint" };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>연도 점검</h2>
        <span className="hint" style={{ flex: 1, minWidth: 240 }}>
          이미 들어간 자료에 <b>24 · 25 · 26년이 섞이지 않았는지</b> 훑어봅니다.
          아무것도 바꾸지 않아요.
        </span>
        <button className="btn btn-sm" disabled={pending} onClick={look}>
          {pending ? "훑는 중…" : "훑어보기"}
        </button>
      </div>

      <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
        노션은 날짜를 <b>「12/30」 처럼 연도 없이</b> 적어둔 것이 많습니다 (제목이 특히
        그렇습니다). 옮길 때 그런 줄에는 <b>위 연도 칸</b> 값을 붙이는데, 기본값이
        올해라서 <b>지난 해 자료를 그냥 올리면 통째로 올해가 됩니다.</b>
        오류가 안 나고 「몇 줄 옮겼습니다」 라고 멀쩡히 뜨기 때문에 눈으로는 못 찾습니다.
      </p>

      {res?.error && <div className="err" style={{ marginTop: 10 }}>{res.error}</div>}

      {res && !res.error && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>전체 연도별</b>
            {Object.entries(res.sum.years).sort().map(([y, n]) => (
              <span className="tag tag-muted" key={y}>{y}년 {n}건</span>
            ))}
            {res.sum.bad > 0 ? (
              <span className="tag tag-red">걸리는 것 {res.sum.bad}</span>
            ) : res.sum.warn > 0 ? (
              <span className="tag tag-amber">살펴볼 것 {res.sum.warn}</span>
            ) : (
              <span className="tag tag-mint">이상 없음</span>
            )}
          </div>

          {res.audits.map((a) => (
            <div className="card card-tight" key={a.label} style={{ padding: "10px 12px" }}>
              <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ fontSize: 12.5 }}>{a.label}</b>
                <span className="hint">{a.total}건</span>
                {Object.entries(a.years).sort().map(([y, n]) => (
                  <span className="tag tag-muted" key={y} style={{ fontSize: 11 }}>
                    {y} · {n}
                  </span>
                ))}
                {a.notes.length === 0 && <span className="tag tag-mint">이상 없음</span>}
              </div>
              {a.notes.map((n, i) => (
                <div key={i} className={TONE[n.tone]} style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7 }}>
                  {n.text}
                  {n.sample?.length > 0 && (
                    <>
                      <br />
                      <span className="hint">예: {n.sample.join(" · ")}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}

          {res.sum.bad > 0 && (
            <div className="notice" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <b>고치는 방법</b> — 아래 <b>「연도 되돌리기」</b> 에서 범위를 정하고
              몇 건이 바뀌는지 눈으로 확인한 뒤 옮기세요. 옮긴 날(들어온 날)로 좁히면
              <b> 이번에 올린 것만</b> 골라 되돌릴 수 있습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
