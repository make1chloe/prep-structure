"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startStudy, stopStudy, finishStudy, undoFinish } from "./timerActions";
import SubmitBox from "./SubmitBox";
import UnitTestBox from "./UnitTestBox";
import { toolBadge } from "@/app/homework/categories";

/** 초 → "12분" */
function human(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 1) return "1분 안";
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

/**
 * 돌고 있는 타이머 — 분:초.
 *
 * 시작을 눌렀는데 화면이 그대로면 아이는 안 눌린 줄 알고 또 누른다.
 * 그래서 **초가 움직이는 게 보여야** 한다.
 */
function clock(sec) {
  const s = Math.max(0, sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${m}:${two(ss)}`;
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
 * 할 것 — **두 모드가 반대로 논다** (원장님 2026-08-21).
 *
 * 등원 학습(inclass) — **순서 강제.**
 *   「등원했을 때는 내가 지정한 순서대로 학습을 해야 되기 때문에
 *     그 순서에 맞게 하도록 강제」
 *   지금 할 것 하나만 크게, 뒤엣것은 보이되 잠근다. 첫 미완료 항목만
 *   시작·완료가 되고, 다음 것은 앞엣것을 끝내야 열린다.
 *
 * 숙제(home) — **자유 이동 · 전부 펼침.**
 *   「숙제를 할 때는 학생이 이 숙제 저 숙제 왔다갔다하면서 할 수 있기
 *     때문에 전체 목록과 체크리스트가 한 번에 보이는 게 맞아」
 *   전 항목을 카드로 다 편다 — 이름·범위·체크리스트가 버튼 없이 바로
 *   보이고, 어떤 항목이든 순서 없이 타이머·완료·제출이 된다.
 */
export default function StudyList({
  title,
  hint,
  tasks = [],
  running = null,
  ready = true,
  kind = "home",
  readOnly = false,
  asId = null,
  subs = {},
  answers = {},   // itemId → { opened } — 파일형 답지 (0148, 하원 숙제만 온다)
}) {
  const [pending, startTransition] = useTransition();
  const [openDone, setOpenDone] = useState(false);
  const [openId, setOpenId] = useState(null);   // 끝낸 것 중에서 지금 펼쳐 낸 것
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
  // 이 항목이 돌고 있나 — **무엇을 하고 있는지(id)** 로 본다.
  // 화면 카드의 key 와 맞추면 안 된다 (모양이 다르다).
  const runsOn = (t) =>
    !!running &&
    !!t &&
    (running.stayId ? running.stayId === t.stayId : running.itemId === t.itemId);
  const isRunning = runsOn(now);

  // 아직 낸 것이 없는 숙제인가 (직접검사는 낼 것이 없으므로 그냥 끝낼 수 있다)
  const needSub = (t) =>
    !!t.itemId && !t.inPerson && (subs[t.reportItemId || t.itemId] || []).length === 0;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {/* 얼마나 왔나 — 숫자보다 막대가 빨리 읽힌다 */}
      <div className="card card-tight">
        <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 15 }}>{title}</b>
          <span className="spacer" />
          <span className="hint">
            {done.length} / {tasks.length} 끝
          </span>
        </div>
        <div className="progbar" style={{ marginTop: 6 }}>
          <span style={{ width: `${Math.round((done.length / tasks.length) * 100)}%` }} />
        </div>
        {/* 숙제는 「지금 할 것」 카드가 없다 — 어떻게 하는지는 여기서 말해준다 */}
        {kind === "home" && hint && (
          <p className="hint" style={{ margin: "6px 0 0" }}>{hint}</p>
        )}
      </div>

      {/* ── 등원 학습: 지금 할 것 **하나만** 열려 있다 (순서 강제) ── */}
      {kind === "inclass" &&
        (now ? (
          <div className="nowcard">
            <p className="nowlabel">지금 할 것</p>
            <h3 className="nowtitle">
              {now.name}
              {/* 무엇을 펴야 하는지 — 「지금 할 것」 에서 제일 많이 물어본다 (0116) */}
              {now.tool && (
                <span className="tag tag-sky" style={{ marginLeft: 7, fontSize: 12.5, verticalAlign: "3px" }}>
                  {toolBadge(now.tool)}
                </span>
              )}
            </h3>
            {(now.units?.length > 0 || now.note) && (
              <p className="nowsub">{[...(now.units || []), now.note].filter(Boolean).join(", ")}</p>
            )}

            {now.method && <p className="nowmethod">{now.method}</p>}

            {isRunning ? (
              <>
                <div className="nowtimer">{clock(runningSec)}</div>
                <button
                  className="bigbtn"
                  disabled={pending || readOnly}
                  onClick={() => run(() => finishStudy(now.reportItemId, now.itemId, now.stayId, kind, asId))}
                >
                  다 했어요
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: "100%", marginTop: 6 }}
                  disabled={pending || readOnly}
                  onClick={() => run(() => stopStudy(asId))}
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
                  onClick={() => run(() => startStudy(now.itemId, now.stayId, kind, asId))}
                >
                  {now.seconds > 0 ? "이어서 하기" : "시작하기"}
                </button>
              </>
            )}

            {/* **단원평가는 「다 했어요」 가 아니라 결과를 낸다** (0106).
                원장님이 미리 배정하시고, 아이는 다음 시간에 와서 맞은 개수만
                적는다. 내면 이 숙제도 같이 끝난 것이 된다 — 두 번 누르게 하면
                하나는 빠뜨린다 */}
            {now.unitTest && (
              <UnitTestBox task={now} readOnly={readOnly} asId={asId} />
            )}
          </div>
        ) : (
          <div className="nowcard" style={{ textAlign: "center" }}>
            <h3 className="nowtitle" style={{ marginBottom: 4 }}>다 했어요 👏</h3>
            <p className="nowsub">{hint}</p>
          </div>
        ))}

      {/* 다음 — 보이되 **잠겨 있다.** 원장님이 정한 순서를 건너뛰지 못한다.
          (숙제와 반대다 — 숙제는 아예 위에서 전부 펼쳐 놓는다) */}
      {kind === "inclass" && rest.length > 0 && (
        <div className="card card-tight">
          <p className="hint" style={{ margin: "0 0 6px" }}>
            다음 · 앞엣것을 먼저 끝내요 🔒
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {rest.map((t, i) => (
              <div key={t.key} className="unitrow">
                <span className="tag tag-muted" style={{ minWidth: 24, textAlign: "center" }}>
                  {i + 2}
                </span>
                <span style={{ fontSize: 14.5, flex: 1 }}>{t.name}</span>
                {t.usual > 0 && <span className="hint" style={{ fontSize: 12.5 }}>보통 {human(t.usual)}</span>}
                <button className="btn btn-ghost btn-sm" disabled title="앞엣것을 먼저 끝내요">
                  🔒
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 숙제: **전 항목을 다 편다** — 어디부터든 시작·완료·제출 ── */}
      {kind === "home" &&
        (left.length === 0 ? (
          <div className="nowcard" style={{ textAlign: "center" }}>
            <h3 className="nowtitle" style={{ marginBottom: 4 }}>다 했어요 👏</h3>
          </div>
        ) : (
          left.map((t, i) => {
            const isRun = runsOn(t);
            const mine = subs[t.reportItemId || t.itemId] || [];
            const missing = needSub(t);
            return (
              <div key={t.key} className="card">
                <div className="row" style={{ gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="tag tag-muted" style={{ minWidth: 24, textAlign: "center" }}>
                    {i + 1}
                  </span>
                  <b style={{ fontSize: 16 }}>{t.name}</b>
                  {t.tool && (
                    <span className="tag tag-sky" style={{ fontSize: 12.5 }}>{toolBadge(t.tool)}</span>
                  )}
                  <span className="spacer" />
                  {mine.length > 0 && <span className="tag tag-mint">낸 것 {mine.length}</span>}
                </div>
                {(t.units?.length > 0 || t.note) && (
                  <p className="hint" style={{ margin: "4px 0 0", fontSize: 14 }}>
                    {[...(t.units || []), t.note].filter(Boolean).join(", ")}
                  </p>
                )}
                {t.method && (
                  <p className="hint" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{t.method}</p>
                )}

                {isRun ? (
                  <>
                    <div className="nowtimer">{clock(runningSec)}</div>
                    {/* 숙제는 내야 끝난 것이다. 누른 뒤에 "안 돼요" 라고 하면
                        늦다 — 누르기 전에 무엇이 남았는지 보여준다. */}
                    {missing && (
                      <p className="hint" style={{ color: "var(--amber)", margin: "4px 0 0" }}>
                        아래에서 <b>사진이나 녹음으로 내야</b> 끝나요.
                      </p>
                    )}
                    <button
                      className="bigbtn"
                      disabled={pending || readOnly || missing}
                      onClick={() => run(() => finishStudy(t.reportItemId, t.itemId, t.stayId, kind, asId))}
                    >
                      다 했어요
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: "100%", marginTop: 6 }}
                      disabled={pending || readOnly}
                      onClick={() => run(() => stopStudy(asId))}
                    >
                      잠깐 멈추기
                    </button>
                  </>
                ) : (
                  <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
                    <button
                      className="btn btn-primary"
                      disabled={pending || !ready || readOnly}
                      onClick={() => run(() => startStudy(t.itemId, t.stayId, kind, asId))}
                    >
                      {t.seconds > 0 ? "이어서 하기" : "시작하기"}
                    </button>
                    {(t.seconds > 0 || t.usual > 0) && (
                      <span className="hint" style={{ fontSize: 13 }}>
                        {t.seconds > 0 ? `여기까지 ${human(t.seconds)}` : `보통 ${human(t.usual)}`}
                      </span>
                    )}
                  </div>
                )}

                {/* 단원평가는 결과(맞은 개수)를 내는 것으로 끝난다 (0106) */}
                {t.unitTest && <UnitTestBox task={t} readOnly={readOnly} asId={asId} />}

                {/* 체크리스트까지 **버튼 없이 바로** 펼친다 (openList) —
                    지워 가면서 하는 것이라 눌러야 보이면 안 짚게 된다 */}
                {!t.unitTest && (
                  <SubmitBox
                    itemId={t.itemId}
                    reportItemId={t.reportItemId}
                    asId={asId}
                    readOnly={readOnly}
                    mine={mine}
                    checklist={t.checklist || []}
                    answer={answers[t.itemId] || null}
                    openList
                  />
                )}
              </div>
            );
          })
        ))}

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
              {done.map((t) => {
                const mine = subs[t.reportItemId || t.itemId] || [];
                const isOpen = openId === t.key;
                return (
                  <div key={t.key} className="stack" style={{ gap: 0 }}>
                    <div className="unitrow" style={{ opacity: 0.7 }}>
                      <span className="tag tag-mint">✓</span>
                      <span style={{ fontSize: 14, flex: 1, textDecoration: "line-through" }}>
                        {t.name}
                      </span>
                      {t.seconds > 0 && <span className="hint">{human(t.seconds)}</span>}
                      {t.needsCheck && <span className="tag tag-amber">검사 대기</span>}
                      {/* 다 했다고 눌러놓고 내는 걸 잊었을 수 있다 */}
                      {kind === "home" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setOpenId(isOpen ? null : t.key)}
                        >
                          {isOpen ? "닫기" : mine.length > 0 ? `낸 것 ${mine.length}` : "내기"}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={pending || readOnly}
                        onClick={() => run(() => undoFinish(t.reportItemId, asId))}
                      >
                        다시
                      </button>
                    </div>
                    {kind === "home" && isOpen && (
                      <div style={{ padding: "6px 0 10px" }}>
                        <SubmitBox
                          itemId={t.itemId}
                          reportItemId={t.reportItemId}
                          asId={asId}
                          readOnly={readOnly}
                          mine={mine}
                          checklist={t.checklist || []}
                          answer={answers[t.itemId] || null}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
