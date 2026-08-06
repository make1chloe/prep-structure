"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { planYearFix, applyYearFix } from "./yearFixActions";

/**
 * **연도 다시 맞추기** (2026-08-06).
 *
 * 원장님 — 「올해인지 작년인지 재작년인지 모르는데 뭘 돌린다는거야」
 *
 * 그래서 범위를 찍어 미는 대신 **줄마다 따진다.** 미래 · 반 요일 · 재원 기간
 * 으로 후보를 지워서, **하나만 남은 줄만** 고친다. 둘 이상 남으면 손대지 않고
 * 보여드린다 — 반쯤 아는 것으로 고치면 지금보다 나빠진다.
 */
export default function YearFixBox() {
  const [res, setRes] = useState(null);
  const [done, setDone] = useState(null);
  const [open, setOpen] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function look() {
    start(async () => { setDone(null); setRes(await planYearFix()); });
  }
  function apply(table, count) {
    if (!confirm(`${count}건의 날짜를 옮깁니다. 후보가 하나로 좁혀진 줄만 옮겨요. 계속할까요?`)) return;
    start(async () => {
      const r = await applyYearFix(table);
      setDone(r);
      if (!r.error) { setRes(await planYearFix()); router.refresh(); }
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>연도 다시 맞추기</h2>
        <span className="hint" style={{ flex: 1, minWidth: 240 }}>
          줄마다 <b>따져서</b> 연도를 정합니다. 범위를 찍어 통째로 밀지 않아요.
        </span>
        <button className="btn btn-sm" disabled={pending} onClick={look}>
          {pending ? "따져보는 중…" : "따져보기"}
        </button>
      </div>

      <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
        「08/14」 가 <b>2024 · 2025 · 2026 중 어느 해인지</b> 파일은 말해주지 않습니다.
        대신 <b>아닌 것을 지웁니다</b> —
        <br />
        ① <b>앞으로의 날짜는 아닙니다</b> (지난 기록이 미래일 수 없어요)
        <br />
        ② <b>요일이 그 아이 반과 맞아야 합니다</b> — 한 해는 52주+1일이라 연도가
        바뀌면 요일이 하루씩 밀립니다. 월·수반 아이의 수업이 금요일에 있을 수 없어요
        <br />
        ③ <b>그때 다니고 있어야 합니다</b> (등록일 · 퇴원일)
        <br />
        <b>하나만 남으면 그게 답입니다.</b> 둘 이상 남으면 손대지 않고 보여드려요.
      </p>

      {res?.error && <div className="err" style={{ marginTop: 10 }}>{res.error}</div>}
      {done?.error && <div className="err" style={{ marginTop: 10 }}>{done.error}</div>}
      {done && !done.error && (
        <div className="notice" style={{ marginTop: 10 }}>
          {done.moved}건 옮겼습니다.
          {done.clashed?.length > 0 && (
            <>
              <br />
              <b>옮기지 못한 것 {done.clashed.length}건</b> — 그 자리에 이미 기록이 있어요.
              <br />
              <span className="hint">{done.clashed.slice(0, 5).join(" / ")}</span>
            </>
          )}
        </div>
      )}

      {res && !res.error && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {res.tables.map((t) => (
            <div className="card card-tight" key={t.table} style={{ padding: "10px 12px" }}>
              <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 12.5 }}>{t.label}</b>
                <span className="hint">{t.total}건</span>
                <span className="tag tag-mint">그대로 {t.keep}</span>
                {t.fix.length > 0 && <span className="tag tag-amber">옮길 것 {t.fix.length}</span>}
                {t.ask.length > 0 && <span className="tag tag-sky">고르셔야 {t.ask.length}</span>}
                {t.none.length > 0 && <span className="tag tag-muted">알 수 없음 {t.none.length}</span>}
                <span className="spacer" />
                {t.fix.length > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending}
                    onClick={() => apply(t.table, t.fix.length)}
                  >
                    {t.fix.length}건 옮기기
                  </button>
                )}
                {(t.fix.length > 0 || t.ask.length > 0 || t.none.length > 0) && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOpen(open === t.table ? null : t.table)}
                  >
                    {open === t.table ? "접기" : "펴보기"}
                  </button>
                )}
              </div>

              {/* **옮기기 전에 눈으로 본다.** 날짜를 잘못 옮기면 되돌리기가 더 어렵다 */}
              {open === t.table && (
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {t.fix.length > 0 && (
                    <div>
                      <b style={{ fontSize: 12 }}>옮길 것 — 후보가 하나로 좁혀졌습니다</b>
                      <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                        {t.fix.slice(0, 40).map((x) => (
                          <div className="hint" key={x.id} style={{ fontSize: 11.5 }}>
                            {x.name} · <b>{x.date}</b> → <b>{x.to}</b>
                          </div>
                        ))}
                        {t.fix.length > 40 && (
                          <span className="hint" style={{ fontSize: 11 }}>… 그 밖 {t.fix.length - 40}건</span>
                        )}
                      </div>
                    </div>
                  )}
                  {t.ask.length > 0 && (
                    <div>
                      <b style={{ fontSize: 12 }}>고르셔야 하는 것 — 후보가 둘 이상 남았습니다</b>
                      <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                        {t.ask.slice(0, 20).map((x) => (
                          <div className="hint" key={x.id} style={{ fontSize: 11.5 }}>
                            {x.name} · {x.date} → {x.options.join(" 또는 ")}
                          </div>
                        ))}
                        {t.ask.length > 20 && (
                          <span className="hint" style={{ fontSize: 11 }}>… 그 밖 {t.ask.length - 20}건</span>
                        )}
                      </div>
                    </div>
                  )}
                  {t.none.length > 0 && (
                    <div>
                      <b style={{ fontSize: 12 }}>알 수 없는 것 — 어느 해로도 안 맞습니다</b>
                      <p className="hint" style={{ margin: "2px 0 0", fontSize: 11.5 }}>
                        그때는 반 요일이 달랐거나(반이 바뀌었거나), 보강·특강처럼
                        정규 요일이 아닌 날일 수 있어요. 손대지 않습니다.
                      </p>
                      <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                        {t.none.slice(0, 10).map((x) => (
                          <div className="hint" key={x.id} style={{ fontSize: 11.5 }}>
                            {x.name} · {x.date} — {x.why[0]}
                          </div>
                        ))}
                        {t.none.length > 10 && (
                          <span className="hint" style={{ fontSize: 11 }}>… 그 밖 {t.none.length - 10}건</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {t.shaky > 0 && (
                <p className="hint" style={{ margin: "6px 0 0", fontSize: 11.5 }}>
                  그대로 둔 {t.keep}건 중 {t.shaky}건은 다른 해도 가능하지만,
                  <b> 지금 연도도 후보 안에 있어서 건드리지 않았습니다.</b>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
