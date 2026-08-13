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
  asId = null,
  subs = {},
}) {
  const [pending, startTransition] = useTransition();
  const [openDone, setOpenDone] = useState(false);
  const [openId, setOpenId] = useState(null);   // '다음' 중에서 지금 펼쳐 낸 것
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
  // 지금 이 카드가 돌고 있나 — **무엇을 하고 있는지(id)** 로 본다.
  // 화면 카드의 key 와 맞추면 안 된다 (모양이 다르다).
  const isRunning =
    !!running &&
    !!now &&
    (running.stayId ? running.stayId === now.stayId : running.itemId === now.itemId);

  // 아직 낸 것이 없는 숙제인가 (직접검사는 낼 것이 없으므로 그냥 끝낼 수 있다)
  const needSubmit =
    kind === "home" &&
    !!now &&
    !!now.itemId &&
    !now.inPerson &&
    (subs[now.reportItemId || now.itemId] || []).length === 0;

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
      </div>

      {/* 지금 할 것 — 화면을 거의 다 쓴다 */}
      {now ? (
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
              {/* 숙제는 내야 끝난 것이다. 누른 뒤에 "안 돼요" 라고 하면 늦다 —
                  누르기 전에 무엇이 남았는지 보여준다. */}
              {needSubmit && (
                <p className="nowsub" style={{ color: "var(--amber)", marginTop: 8 }}>
                  아래에서 <b>사진이나 녹음으로 내야</b> 끝나요.
                </p>
              )}
              <button
                className="bigbtn"
                disabled={pending || readOnly || needSubmit}
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

          {/* 집에서 하는 숙제는 낼 수 있어야 한다 — 특히 녹음 구두테스트 */}
          {kind === "home" && !now.unitTest && (
            <SubmitBox
              itemId={now.itemId}
              reportItemId={now.reportItemId}
              asId={asId}
              readOnly={readOnly}
              mine={subs[now.reportItemId || now.itemId] || []}
              checklist={now.checklist || []}
            />
          )}
        </div>
      ) : (
        <div className="nowcard" style={{ textAlign: "center" }}>
          <h3 className="nowtitle" style={{ marginBottom: 4 }}>다 했어요 👏</h3>
          <p className="nowsub">{hint}</p>
        </div>
      )}

      {/* 다음 — 한 줄씩 작게.
          순서는 **권하는 순서**일 뿐이다. 아이는 자기 사정대로 한다 —
          문법이 오래 걸려서 단어부터 냈을 수도 있고, 오늘 그것만 했을 수도 있다.
          순서를 못 지켰다고 낼 수가 없으면, 한 것도 안 낸 것이 된다.
          그래서 여기서도 열어서 바로 낼 수 있게 한다. */}
      {rest.length > 0 && (
        <div className="card card-tight">
          <p className="hint" style={{ margin: "0 0 6px" }}>
            다음 {kind === "home" && "· 순서와 상관없이 먼저 낼 수 있어요"}
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {rest.map((t, i) => {
              const mine = subs[t.reportItemId || t.itemId] || [];
              const isOpen = openId === t.key;
              return (
                <div key={t.key} className="stack" style={{ gap: 0 }}>
                  <div className="unitrow">
                    <span className="tag tag-muted" style={{ minWidth: 24, textAlign: "center" }}>
                      {i + 2}
                    </span>
                    <span style={{ fontSize: 14.5, flex: 1 }}>{t.name}</span>
                    {mine.length > 0 && <span className="tag tag-mint">낸 것 {mine.length}</span>}
                    {t.usual > 0 && <span className="hint" style={{ fontSize: 12.5 }}>보통 {human(t.usual)}</span>}
                    {kind === "home" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setOpenId(isOpen ? null : t.key)}
                      >
                        {isOpen ? "닫기" : "먼저 내기"}
                      </button>
                    )}
                  </div>
                  {kind === "home" && isOpen && (
                    <div style={{ padding: "6px 0 10px" }}>
                      {t.method && <p className="hint" style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>{t.method}</p>}
                      <SubmitBox
                        itemId={t.itemId}
                        reportItemId={t.reportItemId}
                        asId={asId}
                        readOnly={readOnly}
                        mine={mine}
                        checklist={t.checklist || []}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
