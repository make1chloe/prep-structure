"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { waiveWarning, settleWarnings } from "./stayActions";

/**
 * 경고 상태 한 학생 분.
 *
 * 경고는 저장돼 있지 않고 지난 리포트에서 계산된 것이다.
 * 여기서 하는 일은 **판단을 남기는 것**뿐이다.
 *   · 이 날은 빼주기   → 그날 경고를 없던 것으로
 *   · 반성문 씀        → 정산하고 새로 센다
 *   · 이번엔 넘어가기  → 정산은 하되 '유예' 로 기록에 남는다
 */
export default function WarnBox({ studentId, warn, date }) {
  // 누르는 순간 화면이 준다 — 서버 답 + 재계산을 기다리면 한 박자 늦다
  // (원장님 2026-08-21 「버튼이 작동이 너무 늦어」). 실패하면 되살리고 alert.
  // 성공 alert 은 없앤다 — 화면이 이미 바뀌었는데 alert 까지 뜨면 먹통처럼 보인다.
  const [waived, setWaived] = useState(() => new Set());   // 방금 빼준 날짜
  const [settled, setSettled] = useState(false);           // 방금 반성문/유예로 정산함
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, undo) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        if (undo) undo();   // 실패 — 먼저 바꾼 화면을 되돌린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!warn || warn.count === 0 || settled) {
    return <span className="hint">쌓인 경고가 없습니다.</span>;
  }

  const at = warn.rule?.reflectionAt || 3;
  const today = date; // 화면에 열어둔 날짜 (서버가 한국 기준으로 준 값)
  // 경고 수 = 날짜 줄 수 (lib/warnings: count = list.length) — 빼준 만큼 바로 준다
  const list = warn.list.filter((w) => !waived.has(w.date));
  const count = Math.max(0, warn.count - (warn.list.length - list.length));

  return (
    <div style={{ flex: 1 }}>
      <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 6 }}>
        <span className={`tag ${warn.need ? "tag-red" : "tag-amber"}`}>
          경고 {count} / {at}
        </span>
        {warn.need && <b style={{ fontSize: 14.5 }}>반성문 대상입니다</b>}
        {warn.deferred && (
          <span className="tag tag-muted" title="지난번에 한 번 봐줬습니다">
            지난번 유예함
          </span>
        )}
      </div>

      <div className="stack" style={{ gap: 3, marginBottom: 8 }}>
        {list.map((w) => (
          <div className="unitrow" key={w.date}>
            <span className="hint" style={{ minWidth: 52 }}>
              {w.date.slice(5).replace("-", "/")}
            </span>
            <span style={{ fontSize: 14, flex: 1 }}>{w.reasons.join(", ")}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              title="사정이 있었으면 이 날 경고를 빼줍니다"
              onClick={() => {
                const note = prompt(`${w.date} 경고를 빼는 이유 (선택)`);
                if (note === null) return;
                // 누르는 순간 줄이 빠지고 카운트가 준다 — 저장은 뒤에서
                setWaived((prev) => new Set(prev).add(w.date));
                run(
                  () => waiveWarning(studentId, w.date, note),
                  () => setWaived((prev) => { const n = new Set(prev); n.delete(w.date); return n; })
                );
              }}
            >
              빼주기
            </button>
          </div>
        ))}
        {/* 빼주거나 넘어간 사유 — 적어두신 말이 다시 보여야 기록이다 (P1-13) */}
        {(warn.acts || []).length > 0 && (
          <div className="hint" style={{ marginTop: 4, lineHeight: 1.7 }}>
            {warn.acts.map((a, i) => (
              <div key={i}>
                ↩ {String(a.on || "").slice(5).replace("-", "/")}{" "}
                {a.kind === "waive" ? "빼줌" : a.kind === "defer" ? "넘어감" : "정리"} — {a.note}
              </div>
            ))}
          </div>
        )}
      </div>

      {warn.need && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("반성문을 쓴 것으로 기록할까요?\n경고가 0으로 돌아갑니다.")) return;
              // 누르는 순간 0 으로 — 저장은 뒤에서
              setSettled(true);
              run(
                () => settleWarnings(studentId, "reflection", today, null),
                () => setSettled(false)
              );
            }}
          >
            반성문 씀
          </button>
          <button
            className="btn btn-sm"
            disabled={pending}
            title="이번엔 봐주고 넘어갑니다. 봐준 이력이 남습니다"
            onClick={() => {
              const note = prompt("이번엔 넘어가는 이유 (선택)");
              if (note === null) return;
              // 누르는 순간 0 으로 — 저장은 뒤에서
              setSettled(true);
              run(
                () => settleWarnings(studentId, "defer", today, note),
                () => setSettled(false)
              );
            }}
          >
            이번엔 넘어가기 (유예)
          </button>
        </div>
      )}
    </div>
  );
}
