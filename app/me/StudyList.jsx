"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startStudy, stopStudy, finishStudy, undoFinish } from "./timerActions";

/** 초 → "12분" · "1시간 5분" */
function human(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 1) return "1분 안";
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

/** 흘러가는 시간 (1초마다) */
function useTick(on) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

/**
 * 오늘 할 것 — **순서대로**.
 *
 * 맨 위 하나가 크게 보인다. 무엇부터 할지 매번 묻지 않게 하려는 것이다.
 * 시작하려면 타이머를 눌러야 하고, 다 하면 **학습 완료**를 누른다.
 *
 * 학생은 "검사 받을게요" 를 따로 누르지 않는다.
 * **학습 완료가 곧 검사 대기**이고, 선생님이 손이 빌 때 한꺼번에 본다.
 *
 * 학생에게는 **걸린 시간만** 보인다. 몇 시에 시작했는지는 안 보여준다 —
 * 시각까지 보이면 그때부터 눈치를 보게 된다.
 */
export default function StudyList({ title, hint, tasks = [], running = null, ready = true, kind = "home" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useTick(!!running);

  const runningSec = running
    ? Math.max(0, Math.round((Date.now() - new Date(running.started_at).getTime()) / 1000))
    : 0;

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (tasks.length === 0) return null;

  const doneCount = tasks.filter((t) => t.doneAt).length;
  const todo = tasks.filter((t) => !t.doneAt);

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        <span className="hint">{doneCount} / {tasks.length}</span>
        <span className="spacer" />
        {running && (
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => stopStudy())}>
            ⏸ 잠깐 멈춤 {human(runningSec)}
          </button>
        )}
      </div>
      {hint && <p className="hint" style={{ margin: "4px 0 0" }}>{hint}</p>}

      {!ready && (
        <div className="notice" style={{ marginTop: 10, fontSize: 12.5 }}>
          타이머를 쓰려면 선생님이 <b>SQL</b> 을 먼저 실행해야 해요.
        </div>
      )}

      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        {tasks.map((t, i) => {
          const isRunning = running && running.key === t.key;
          const first = !t.doneAt && todo[0]?.key === t.key;
          return (
            <div
              key={t.key}
              className="card card-tight"
              style={{
                background: "transparent",
                borderLeft: first ? "3px solid var(--accent, #7c8cff)" : undefined,
                opacity: t.doneAt ? 0.6 : 1,
              }}
            >
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  className={`tag ${t.doneAt ? "tag-mint" : first ? "tag-sky" : "tag-muted"}`}
                  style={{ minWidth: 26, textAlign: "center" }}
                >
                  {t.doneAt ? "✓" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b
                    style={{
                      fontSize: first ? 17 : 14,
                      lineHeight: 1.4,
                      textDecoration: t.doneAt ? "line-through" : "none",
                    }}
                  >
                    {t.name}
                  </b>
                  {(t.units?.length > 0 || t.note) && (
                    <div className="hint" style={{ fontSize: first ? 13 : 12 }}>
                      {[...(t.units || []), t.note].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>

                {t.seconds > 0 && <span className="tag tag-mint">{human(t.seconds)}</span>}
                {t.usual > 0 && t.seconds === 0 && !t.doneAt && (
                  <span className="hint" style={{ fontSize: 11.5 }} title="지난번들 평균이에요">
                    보통 {human(t.usual)}
                  </span>
                )}

                {t.doneAt ? (
                  <>
                    {t.needsCheck && !t.checked && (
                      <span className="tag tag-amber" title="선생님이 부르시면 가져가세요">
                        검사 기다리는 중
                      </span>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => undoFinish(t.reportItemId))}
                    >
                      다시 하기
                    </button>
                  </>
                ) : isRunning ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => finishStudy(t.reportItemId, t.itemId, t.stayId, kind))
                    }
                  >
                    ■ 학습 완료 {human(runningSec)}
                  </button>
                ) : (
                  <button
                    className={`btn btn-sm ${first ? "btn-primary" : "btn-ghost"}`}
                    disabled={pending || !ready}
                    onClick={() => run(() => startStudy(t.itemId, t.stayId, kind))}
                  >
                    ▶ {t.seconds > 0 ? "이어서" : "시작"}
                  </button>
                )}
              </div>

              {first && t.method && (
                <p
                  className="hint"
                  style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 12.5 }}
                >
                  {t.method}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
