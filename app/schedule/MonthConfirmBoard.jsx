"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { principalConfirmMonth, principalUnconfirmMonth, sendMonthPlan } from "./confirmActions";
import { dayLabel } from "@/lib/day";

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
  const [showAbs, setShowAbs] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!ready) return null;   // 0123 전 — 조용히

  const month = Number(ym.slice(5, 7));
  const left = rows.filter((r) => !r.principalAt);
  const noParent = rows.filter((r) => !r.parentAt && !r.principalAt);
  // **아직 예상 일정을 안 보낸 학생** (0152) — 새 흐름의 1단계다
  const noNotice = rows.filter((r) => !r.noticeAt && !r.principalAt);

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
          {noNotice.length > 0 && (
            <span className="tag tag-amber" title="예상 수업일정을 아직 안 보낸 학생">
              안내 전 {noNotice.length}
            </span>
          )}{" "}
          {noParent.length > 0 && (
            <span className="tag tag-muted" title="학부모가 아직 확인을 안 누른 학생">
              학부모 확인 전 {noParent.length}
            </span>
          )}
        </h2>
      </button>

      {open && (
        <>
          {/**
            * **순서가 뒤집혔다** (원장님 2026-08-23 — 「먼저 일정을 보내고
            * 봐라, 결석 이 중에 있냐 물어보는 거지」). 전에는 학부모가 결석을
            * 먼저 보내야 했다.
            */}
          <p className="hint" style={{ margin: "8px 0", lineHeight: 1.7 }}>
            ① 위 달력에서 <b>반별 휴강</b>을 먼저 잡고 → ② <b>예상 일정 보내기</b> →
            ③ 학부모가 빠질 날을 알려오면 결석 예정에 반영 → ④ <b>확정</b>.
            확정되면 수강료(수납) 안내를 내보내시면 됩니다 — 발송은 앱 밖 일이라
            여기서는 상태만 남습니다.
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
            {noNotice.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSel(new Set(noNotice.map((r) => r.studentId)))}
              >
                안내 전 {noNotice.length}명 고르기
              </button>
            )}
            <button
              className="btn btn-sm"
              disabled={pending || sel.size === 0}
              title="고른 학생의 학부모께 이 달 예상 수업일정을 보냅니다 (앱 공지 + 알림)"
              onClick={() => {
                if (!confirm(`고른 ${sel.size}명의 학부모께 ${month}월 예상 수업일정을 보낼까요?`)) return;
                run(() => sendMonthPlan([...sel], ym));
              }}
            >
              📨 예상 일정 보내기
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || sel.size === 0}
              onClick={() => run(() => principalConfirmMonth([...sel], ym))}
            >
              고른 {sel.size}명 회차 확정
            </button>
            <span className="spacer" />
            {rows.some((r) => r.absences > 0) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAbs(!showAbs)}>
                {showAbs ? "결석 예정 접기" : `결석 예정 모두 보기 (${rows.filter((r) => r.absences > 0).length}명)`}
              </button>
            )}
          </div>
          {showAbs && (
            <div className="card card-tight" style={{ marginBottom: 8, background: "var(--amber-soft)" }}>
              <b style={{ fontSize: 14 }}>{month}월 결석 예정</b>
              <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                {rows
                  .filter((r) => r.absences > 0)
                  .map((r) => (
                    <div key={r.studentId} style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                      <b style={{ minWidth: 60, display: "inline-block" }}>{r.name}</b>{" "}
                      {(r.absList || [])
                        .map((a) => `${dayLabel(a.date)}${a.reason ? `(${a.reason})` : ""}`)
                        .join(" · ")}
                    </div>
                  ))}
                {rows.every((r) => r.absences === 0) && <span className="hint">없어요</span>}
              </div>
            </div>
          )}
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
                {/* 세 상태 — 초안 → 보냄 → 확정 (0152) */}
                {r.noticeAt
                  ? <span className="tag tag-sky">일정 보냄</span>
                  : <span className="tag tag-amber">안내 전</span>}
                {r.parentAt
                  ? <span className="tag tag-mint">학부모 ✓</span>
                  : <span className="tag tag-muted">학부모 확인 전</span>}
                {r.absences > 0 && (
                  <span
                    className="tag tag-amber"
                    title={(r.absList || []).map((a) => `${dayLabel(a.date)}${a.reason ? ` ${a.reason}` : ""}`).join(", ")}
                  >
                    {month}월 결석 예정 {r.absences}
                  </span>
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
