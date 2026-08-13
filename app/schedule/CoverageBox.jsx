"use client";

/**
 * **학교별 시험 회차 점검** (원장님, 2026-08-09 — 「지금 중학교에서는 은송중하고
 * 신정중만 2학기 중간 시험 일정이 나오는데 이게 맞아? 네가 의도한 거야?」).
 *
 * 목록에 **없는 것은 안 보인다.** 「박문중 2학기 중간」 이 없을 때 까닭은
 * 셋인데 화면은 똑같다 —
 *
 *   1. 그 학교가 정말 안 본다 (요즘 중학교는 학기당 지필 한 번인 곳이 많다)
 *   2. 학교가 학사일정에 아직 안 올렸다
 *   3. 받아왔는데 우리가 시험으로 못 알아봤다  ← **이것만 앱 잘못이다**
 *
 * 그래서 원장님이 「이게 맞아?」 를 물으실 수밖에 없었다. 이 상자가 셋을
 * 갈라 준다 — 회차가 없는 학교에 대해, **그 학교 나이스 일정에 시험처럼
 * 보이는 줄이 있었는지**를 같이 보여준다.
 */

import { useState, useTransition } from "react";
import { shortName } from "@/lib/schoolName";
import { examCoverage } from "./neisActions";

export default function CoverageBox({ from, to }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  function load() {
    setErr("");
    startTransition(async () => {
      const res = await examCoverage(from, to);
      if (res?.error) { setErr(res.error); return; }
      setRows(res.rows || []);
    });
  }

  if (rows === null) {
    return (
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={load}>
          {pending ? "세는 중…" : "학교별 시험 회차 점검"}
        </button>
        {err && <span className="err" style={{ fontSize: 13 }}>{err}</span>}
      </div>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14.5 }}>학교별 시험 회차</b>
        <span className="hint" style={{ fontSize: 12.5 }}>{from} ~ {to}</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={load}>다시 세기</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setRows(null)}>닫기</button>
      </div>

      <p className="hint" style={{ margin: "6px 0 8px", fontSize: 12.5, lineHeight: 1.7 }}>
        회차가 없는 학기가 있어도 <b>바로 문제는 아닙니다</b> — 요즘 중학교는
        학기당 지필을 한 번만(기말만) 보는 곳이 많습니다.
        <br />
        <b className="amber">학교 일정엔 있는데 회차가 없는 날</b>이 뜨면, 그건 학교가
        올린 것을 앱이 아직 안 만든 것입니다 — <b>학사일정 받아오기</b> 를 다시 눌러주세요.
        아무것도 안 뜨면 <b>그 학기에 학교가 시험을 안 올린 것</b>이라 앱이 할 일은 없습니다.
      </p>

      <div className="stack" style={{ gap: 2 }}>
        {rows.map((r) => (
          <div className="unitrow" key={r.name} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14, minWidth: 78 }}>{shortName(r.name)}</b>
            {!r.code && <span className="tag tag-amber">나이스 코드 없음</span>}
            {r.code && r.neisRows === 0 && (
              <span className="tag tag-amber">받아온 일정 없음</span>
            )}
            {r.terms.length === 0 ? (
              <span className="tag tag-muted">시험 회차 없음</span>
            ) : (
              r.terms.map((t) => <span key={t} className="tag tag-mint">{t}</span>)
            )}
            {/* **못 알아본 줄** — 학교 일정엔 있는데 회차가 안 된 것. 앱 잘못이다 */}
            {r.missed.length > 0 && (
              <span className="hint" style={{ flexBasis: "100%", color: "var(--amber)", fontSize: 12.5 }}>
                학교 일정엔 있는데 회차가 없는 날: {r.missed.map((m) => `${m.due_on.slice(5)} ${m.title}`).join(" · ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
