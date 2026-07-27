"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startStudy, stopStudy } from "./timerActions";

/** 초 → "12분" · "1시간 5분" */
function human(sec) {
  const m = Math.floor((sec || 0) / 60);
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
 * 시작하려면 타이머를 눌러야 한다. 한 번에 하나만 돈다.
 *
 * 선생님을 기다려야 하는 것(단어시험·숙제 검사 …)은 타이머가 없다.
 * 기다린 시간까지 공부한 시간으로 잡히면 숫자가 뜻을 잃기 때문이다.
 */
export default function StudyList({ tasks = [], running = null, ready = true }) {
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

  if (tasks.length === 0) {
    return (
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>오늘 할 것</h2>
        <p className="hint" style={{ margin: 0 }}>오늘은 올라온 것이 없어요.</p>
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.seconds > 0).length;

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>오늘 할 것</h2>
        <span className="hint">{doneCount} / {tasks.length}</span>
        <span className="spacer" />
        {running && (
          <button className="btn btn-sm" disabled={pending} onClick={() => run(() => stopStudy())}>
            ■ 멈추기 {human(runningSec)}
          </button>
        )}
      </div>

      {!ready && (
        <div className="notice" style={{ marginTop: 10, fontSize: 12.5 }}>
          타이머를 쓰려면 선생님이 <b>0033 SQL</b> 을 먼저 실행해야 해요.
        </div>
      )}

      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        {tasks.map((t, i) => {
          const isRunning = running && running.key === t.key;
          const first = i === 0;
          return (
            <div
              key={t.key}
              className="card card-tight"
              style={{
                background: "transparent",
                borderLeft: first ? "3px solid var(--accent, #7c8cff)" : undefined,
                opacity: t.seconds > 0 && !isRunning ? 0.7 : 1,
              }}
            >
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  className={`tag ${first ? "tag-sky" : "tag-muted"}`}
                  style={{ minWidth: 26, textAlign: "center" }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b style={{ fontSize: first ? 17 : 14, lineHeight: 1.4 }}>{t.name}</b>
                  {(t.units?.length > 0 || t.note) && (
                    <div className="hint" style={{ fontSize: first ? 13 : 12 }}>
                      {[...(t.units || []), t.note].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>

                {t.seconds > 0 && <span className="tag tag-mint">{human(t.seconds)}</span>}
                {t.usual > 0 && t.seconds === 0 && (
                  <span className="hint" style={{ fontSize: 11.5 }} title="지난번들 평균이에요">
                    보통 {human(t.usual)}
                  </span>
                )}

                {t.noTimer ? (
                  <span className="hint" style={{ fontSize: 12 }} title="선생님을 기다려도 돼요">
                    선생님과 함께
                  </span>
                ) : isRunning ? (
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => run(() => stopStudy())}
                  >
                    ■ 멈추기 {human(runningSec)}
                  </button>
                ) : (
                  <button
                    className={`btn btn-sm ${first ? "btn-primary" : "btn-ghost"}`}
                    disabled={pending || !ready}
                    onClick={() => run(() => startStudy(t.itemId, t.stayId))}
                  >
                    ▶ {t.seconds > 0 ? "더 하기" : "시작"}
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

      <p className="hint" style={{ marginTop: 10 }}>
        위에서부터 하나씩 하면 돼요. <b>시작</b>을 눌러야 시간이 재집니다.
      </p>
    </div>
  );
}
