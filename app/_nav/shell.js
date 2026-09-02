"use client";
/**
 * **어느 화면에서든 늘 손에 닿는 껍데기** (0-10).
 *
 * `app/layout.js` 가 이것을 **한 번** 그린다. 화면마다 붙이지 않는다 —
 * 화면마다 붙이면 새 화면을 만든 날 그 화면만 메뉴가 없다(그게 지금까지 벌어진 일이다:
 * `<Nav>` 를 부르는 곳이 **0곳**이라 대시보드에서 아무 데도 못 갔다).
 *
 * ⚠️ **퀵메모 창은 화면 안에서 연다.** `createPortal` 도 `position:fixed` 도 안 쓴다(대전제-9),
 *    `alert`/`confirm` 도 안 쓴다(대전제-10). **닫기 단추가 언제나 있다.**
 * ⚠️ **저장 중이라고 닫기를 잠그지 않는다**(대전제-10) — 네트워크가 매달리면 빠져나갈 길이 없다.
 * ⚠️ 메뉴 줄 자체는 `sticky` 라 스크롤로 접히지 않는다(0-10 · `.nv` 의 주석).
 */
import { useRef, useState, useTransition } from "react";
import Nav from "../nav.js";
import { QUICK, canQuick } from "@/lib/menu";
import { saveQuick } from "./actions.js";

export default function Shell({ role, children }) {
  const 쓸수있나 = canQuick(role);
  const [열림, set열림] = useState(false);
  const [글, set글] = useState("");
  const [말, set말] = useState(null);          // { ok, msg }
  const [저장중, 시작] = useTransition();
  const 칸 = useRef(null);

  function 열기() {
    set열림(true); set말(null);
    // ⚠️ `autoFocus` 를 안 건다(폰-2) — 열릴 때 키보드가 튀어 화면이 뛴다.
    //    **누른 뒤**에 옮긴다: 원장님이 스스로 연 자리이므로 놀라지 않는다.
    setTimeout(() => 칸.current?.focus(), 0);
  }
  function 닫기() { set열림(false); set말(null); }

  function 저장() {
    const t = 글.trim();
    if (!t) { set말({ ok: false, msg: "빈 메모는 저장하지 않습니다" }); return; }
    시작(async () => {
      const r = await saveQuick(t);
      set말(r);
      if (r?.ok) { set글(""); }            // ⚠️ 실패하면 **적은 글을 안 지운다**
    });
  }

  return (
    <>
      <Nav role={role} onQuick={쓸수있나 ? 열기 : undefined} />

      {열림 && (
        <div className="card qk" role="dialog" aria-label={QUICK.name}>
          <div className="cardhd">
            <span>{QUICK.icon} {QUICK.name}</span>
            <span className="muted qk-hint">{QUICK.hint}</span>
            {/* ⚠️ 닫는 길은 **언제나** 있다. 저장 중에도 잠그지 않는다(대전제-10) */}
            <button type="button" className="btn btnghost qk-x" onClick={닫기}>
              닫기<span className="sronly"> — {QUICK.name}</span>
            </button>
          </div>
          <textarea
            ref={칸} className="fld qk-ta" value={글} maxLength={QUICK.max}
            onChange={(e) => set글(e.target.value)}
            placeholder="한 줄 적어 두면 할 일에 섭니다"
            style={{ fontSize: QUICK.minFont }}   /* 폰-1 — 그 밑이면 아이폰이 확대하고 안 돌아온다 */
          />
          <div className="row">
            <button type="button" className="btn btnmain" disabled={저장중} onClick={저장}>
              {저장중 ? "…" : "할 일에 세우기"}
            </button>
            <span className="muted num">{글.length}/{QUICK.max}</span>
            {말 && (
              <span className={"sunk qk-say " + (말.ok ? "qk-ok" : "qk-bad")} role="status">
                {말.ok ? "✅ " : "⚠️ "}{말.msg}
              </span>
            )}
          </div>
        </div>
      )}

      {children}
    </>
  );
}
