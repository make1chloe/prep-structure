"use client";

import { useEffect, useState, useTransition } from "react";
import { getPushPublicKey, saveSubscription } from "@/app/push/actions";
import { pushState, enablePush, howTo, deviceKind, isStandalone } from "@/lib/pushClient";

/**
 * **알림이 꺼져 있으면 화면을 안 연다.**
 *
 * 원장님 (2026-08-07) — 「학생 어플은 절대 알림이 꺼지면 안 돼. 단순히
 * 알림을 켜야 된다 하면 어플을 사용하지 못 하게 될 거 같애 학생들이.
 * 홈 화면에 추가·알림 켜기를 안하면 정상 작동이 안 되도록」
 *
 * ── 왜 이렇게까지 하나 ────────────────────────────────────
 *
 * 이 앱은 알림톡을 대신한다. 숙제도 · 시험도 · 전달사항도 여기로만 간다.
 * 알림이 꺼진 아이는 **아무 소식도 못 받는 채로** 앱을 쓰고 있게 되고,
 * 정작 문제는 숙제를 안 해온 날 드러난다. 그때는 이미 늦다.
 *
 * 옅은 안내문으로는 안 켠다 — 매일 봐도 안 읽힌다. 그래서 **막는다.**
 *
 * ── 그래도 조심할 것 ──────────────────────────────────────
 *
 * 막는 것은 쉽고, **못 열게 만드는 것은 사고다.** 기기마다 켜는 방법이
 * 다르므로(윈도우는 탭에서 그냥 되고, 아이폰은 홈 화면에 담아야 한다),
 * 그 기기에서 **실제로 할 수 있는 절차**를 그대로 적어준다. 「홈 화면에
 * 추가하세요」 를 윈도우에서 보여주면 학생은 그 자리에서 막혀버린다.
 *
 * 그리고 아무리 해도 안 되는 아이가 있을 수 있다 — 학교 컴퓨터, 오래된
 * 기기. 그런 아이가 숙제를 못 보는 것이 더 큰 손해라, **선생님께 말하면
 * 되는 길**을 아래에 남겨둔다.
 */
export default function AlertGate({ children }) {
  const [state, setState] = useState("checking");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState().then((s) => alive && setState(s));
    // 아무리 해도 안 켜지는 아이를 영영 가두지 않는다 — 20초 뒤에 길 하나
    const t = setTimeout(() => alive && setWaited(true), 20000);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  function turnOn() {
    setMsg(null);
    startTransition(async () => {
      const r = await enablePush(getPushPublicKey, saveSubscription);
      if (!r.ok) {
        setMsg(r.error);
        if (r.denied) setState("denied");
        return;
      }
      setState("on");
    });
  }

  // 확인하는 동안은 화면을 안 가린다 (깜빡이는 것이 더 나쁘다)
  if (state === "checking" || state === "on") return children;

  const guide = howTo();
  const kind = deviceKind();
  const stand = isStandalone();

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="card sect sect-bad">
        <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
          🔔 알림을 켜야 쓸 수 있어요
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.75 }}>
          숙제 · 시험 · 전달사항이 <b>전부 이 앱 알림으로만</b> 갑니다.
          알림이 꺼져 있으면 아무 소식도 못 받게 됩니다.
          <br />
          <b>한 번만 켜두면 다시 안 물어봅니다.</b>
        </p>

        {guide.why && (
          <div className="notice" style={{ marginBottom: 10, fontSize: 13 }}>{guide.why}</div>
        )}

        <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.9 }}>
          {guide.steps.map((t) => <li key={t}>{t}</li>)}
        </ol>

        {state === "denied" ? (
          <div className="notice" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <b>알림이 차단되어 있어요.</b>{" "}
            {kind === "ios"
              ? "아이폰 설정 → 알림 → 클로이영어 에서 [알림 허용]을 켜주세요."
              : kind === "android"
              ? "크롬 주소창 왼쪽 자물쇠 → 권한 → 알림 을 [허용]으로 바꿔주세요."
              : "주소창 왼쪽 자물쇠 → 알림 을 [허용]으로 바꾼 뒤 새로고침해주세요."}
          </div>
        ) : guide.can ? (
          <button className="btn btn-primary btn-block" onClick={turnOn} disabled={pending}>
            {pending ? "켜는 중…" : "알림 켜기"}
          </button>
        ) : (
          // 아이폰 사파리 탭 — 여기서는 눌러도 안 된다. 담고 오셔야 한다
          <div className="notice" style={{ fontSize: 13 }}>
            위 순서대로 <b>홈 화면에 담고</b>, 그 아이콘으로 다시 열어주세요.
          </div>
        )}

        {msg && <p className="err" style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      {/* **가둬두지 않는다.** 학교 컴퓨터나 오래된 기기라 아무리 해도 안 되는
          아이가 있다. 그 아이가 숙제를 못 보는 것이 더 큰 손해다 */}
      {waited && (
        <p className="hint" style={{ margin: 0, textAlign: "center", lineHeight: 1.8 }}>
          여러 번 해봐도 안 되면 선생님께 말해주세요.
          <br />
          {stand ? "앱을 껐다 다시 열어보는 것도 도움이 됩니다." : "다른 기기에서는 잘 켜질 수 있어요."}
        </p>
      )}
    </div>
  );
}
