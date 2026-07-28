"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startStudy, stopStudy, finishStudy, undoFinish } from "./timerActions";

/** 초 → "12분" */
function human(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 1) return "1분 안";
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

function useTick(on) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

/**
 * 할 것 — **지금 하나만 크게.**
 *
 * 집중이 잘 안 되는 아이도 화면을 열면 **무엇을 할지 한 눈에** 들어와야 한다.
 * 그래서 목록을 늘어놓지 않는다.
 *   지금 할 것   화면을 거의 다 쓴다. 큰 글씨, 큰 버튼, 하는 법까지 펼쳐서
 *   다음         한 줄로 작게. "이거 끝나면 저거" 만 알면 된다
 *   끝낸 것      접어둔다. 펴면 볼 수 있다
 *
 * 고를 것이 많으면 아이는 고르다가 시간을 쓴다. 고를 게 없어야 시작한다.
 */
export default function StudyList({
  title,
  hint,
  tasks = [],
  running = null,
  ready = true,
  kind = "home",
  readOnly = false,
}) {
  const [pending, startTransition] = useTransition();
  const [openDone, setOpenDone] = useState(false);
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

  const left = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);
  const now = left[0] || null;
  const rest = left.slice(1);
  const isRunning = running && now && running.key === now.key;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {/* 얼마나 왔나 — 숫자보다 막대가 빨리 읽힌다 */}
      <div className="card card-tight">
        <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 14 }}>{title}</b>
          <span className="spacer" />
          <span className="hint">
            {done.length} / {tasks.length} 끝
          </span>
        </div>
        <div className="progbar" style={{ marginTop: 6 }}>
          <span style={{ width: `${Math.round((done.length / tasks.length) * 100)}%` }} />
        </div>
      </div>

      {/* 지금 할 것 — 화면을 거의 다 쓴다 */}
      {now ? (
        <div className="nowcard">
          <p className="nowlabel">지금 할 것</p>
          <h3 className="nowtitle">{now.name}</h3>
          {(now.units?.length > 0 || now.note) && (
            <p className="nowsub">{[...(now.units || []), now.note].filter(Boolean).join(", ")}</p>
          )}

          {now.method && <p className="nowmethod">{now.method}</p>}

          {isRunning ? (
            <>
              <div className="nowtimer">{human(runningSec)}</div>
              <button
                className="bigbtn"
                disabled={pending || readOnly}
                onClick={() => run(() => finishStudy(now.reportItemId, now.itemId, now.stayId, kind))}
              >
                다 했어요
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: "100%", marginTop: 6 }}
                disabled={pending || readOnly}
                onClick={() => run(() => stopStudy())}
              >
                잠깐 멈추기
              </button>
            </>
          ) : (
            <>
              {(now.seconds > 0 || now.usual > 0) && (
                <p className="nowsub" style={{ marginTop: 10 }}>
                  {now.seconds > 0 ? `여기까지 ${human(now.seconds)}` : `보통 ${human(now.usual)}`}
                </p>
              )}
              <button
                className="bigbtn"
                disabled={pending || !ready || readOnly}
                onClick={() => run(() => startStudy(now.itemId, now.stayId, kind))}
              >
                {now.seconds > 0 ? "이어서 하기" : "시작하기"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="nowcard" style={{ textAlign: "center" }}>
          <h3 className="nowtitle" style={{ marginBottom: 4 }}>다 했어요 👏</h3>
          <p className="nowsub">{hint}</p>
        </div>
      )}

      {/* 다음 — 한 줄씩 작게 */}
      {rest.length > 0 && (
        <div className="card card-tight">
          <p className="hint" style={{ margin: "0 0 6px" }}>다음</p>
          <div className="stack" style={{ gap: 4 }}>
            {rest.map((t, i) => (
              <div className="unitrow" key={t.key}>
                <span className="tag tag-muted" style={{ minWidth: 24, textAlign: "center" }}>
                  {i + 2}
                </span>
                <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                {t.usual > 0 && <span className="hint" style={{ fontSize: 11.5 }}>보통 {human(t.usual)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 끝낸 것 — 접어둔다 */}
      {done.length > 0 && (
        <div className="card card-tight">
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: "100%" }}
            onClick={() => setOpenDone(!openDone)}
          >
            {openDone ? "▾" : "▸"} 끝낸 것 {done.length}개
            {done.some((t) => t.needsCheck) && "  · 검사 기다리는 중"}
          </button>
          {openDone && (
            <div className="stack" style={{ gap: 4, marginTop: 8 }}>
              {done.map((t) => (
                <div className="unitrow" key={t.key} style={{ opacity: 0.7 }}>
                  <span className="tag tag-mint">✓</span>
                  <span style={{ fontSize: 12.5, flex: 1, textDecoration: "line-through" }}>
                    {t.name}
                  </span>
                  {t.seconds > 0 && <span className="hint">{human(t.seconds)}</span>}
                  {t.needsCheck && <span className="tag tag-amber">검사 대기</span>}
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending || readOnly}
                    onClick={() => run(() => undoFinish(t.reportItemId))}
                  >
                    다시
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
