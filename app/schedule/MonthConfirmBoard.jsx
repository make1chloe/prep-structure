"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { principalConfirmMonth, principalUnconfirmMonth } from "./confirmActions";

/**
 * **다음 달 회차 확정 판** (0123, 원장님 2026-08-14~15).
 *
 * 매달 25일까지: 학부모가 결석을 보내고 1차 확인 → 여기서 공휴일·시험
 * 겹침(이 화면의 회차·달력)을 보고 학생별로 확정. 확정 상태만 있으면
 * 수납 안내(앱 밖)를 내보내면 된다. 안 하면 25일부터 메뉴 배지가 센다.
 */
export default function MonthConfirmBoard({ ym, rows = [], ready = true }) {
  const [open, setOpen] = useState(() => {
    // 25일부터 월말까지는 펴서 보여준다 — 그때가 이 판의 계절이다
    const d = new Date().getDate();
    return d >= 25 || rows.some((r) => !r.principalAt) === false ? d >= 25 : false;
  });
  const [sel, setSel] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!ready) return null;   // 0123 전 — 조용히

  const month = Number(ym.slice(5, 7));
  const left = rows.filter((r) => !r.principalAt);
  const noParent = rows.filter((r) => !r.parentAt && !r.principalAt);

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      setSel(new Set());
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
          <span className="muted" style={{ fontSize: 12 }}>{open ? "▾" : "▸"}</span>{" "}
          {month}월 회차 확정{" "}
          {left.length > 0
            ? <span className="tag tag-amber">미확정 {left.length}명</span>
            : <span className="tag tag-mint">전원 확정</span>}{" "}
          {noParent.length > 0 && (
            <span className="tag tag-muted" title="학부모가 아직 1차 확인을 안 누른 학생">
              학부모 확인 전 {noParent.length}
            </span>
          )}
        </h2>
      </button>

      {open && (
        <>
          <p className="hint" style={{ margin: "8px 0", lineHeight: 1.7 }}>
            학부모 확인(✓)과 다음 달 결석 제출을 보고, 위의 회차·달력에서 공휴일·시험
            겹침까지 확인한 뒤 <b>확정</b>을 누르세요. 확정되면 수강료(수납) 안내를
            내보내시면 됩니다 — 발송은 앱 밖 일이라 여기서는 상태만 남습니다.
          </p>
          <div className="row" style={{ gap: 6, marginBottom: 8, alignItems: "center" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const every = left.every((r) => sel.has(r.studentId));
                const n = new Set(sel);
                left.forEach((r) => (every ? n.delete(r.studentId) : n.add(r.studentId)));
                setSel(n);
              }}
            >
              미확정 전체 선택
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || sel.size === 0}
              onClick={() => run(() => principalConfirmMonth([...sel], ym))}
            >
              고른 {sel.size}명 회차 확정
            </button>
          </div>
          <div className="stack" style={{ gap: 3 }}>
            {rows.map((r) => (
              <div className="unitrow" key={r.studentId}>
                {!r.principalAt && (
                  <input
                    type="checkbox"
                    checked={sel.has(r.studentId)}
                    onChange={() => {
                      const n = new Set(sel);
                      n.has(r.studentId) ? n.delete(r.studentId) : n.add(r.studentId);
                      setSel(n);
                    }}
                  />
                )}
                <b style={{ fontSize: 14, minWidth: 76 }}>{r.name}</b>
                <span className="hint" style={{ minWidth: 70 }}>{r.who}</span>
                {r.parentAt
                  ? <span className="tag tag-mint">학부모 ✓</span>
                  : <span className="tag tag-muted">학부모 확인 전</span>}
                {r.absences > 0 && (
                  <span className="tag tag-amber">{month}월 결석 예정 {r.absences}</span>
                )}
                <span className="spacer" />
                {r.principalAt ? (
                  <>
                    <span className="tag tag-mint">확정</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => principalUnconfirmMonth(r.studentId, ym))}
                    >
                      되돌리기
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => run(() => principalConfirmMonth([r.studentId], ym))}
                  >
                    확정
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
