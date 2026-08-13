"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { getPushPublicKey, saveSubscription } from "@/app/push/actions";
import {
  pushState, enablePush, howTo, deviceKind, isStandalone, whyUnsupported,
} from "@/lib/pushClient";

/**
 * **알림이 꺼져 있으면 가만두지 않는다.**
 *
 * 원장님 (2026-08-07)
 *   「학생 어플은 절대 알림이 꺼지면 안 돼」
 *   「빨간색으로만 표시하지 말고 뭔가 누를 때마다 경고 메세지가 귀찮게
 *    떠서 학생이 알림을 켜게 만들어. 방해금지 모드는 할 수 있게 해 줘」
 *
 * ── 왜 이렇게까지 하나 ────────────────────────────────────
 *
 * 이 앱이 알림톡을 대신한다. 숙제도 · 시험도 · 전달사항도 여기로만 간다.
 * 알림이 꺼진 아이는 **아무 소식도 못 받는 채로** 앱을 쓰고 있게 되고,
 * 정작 문제는 숙제를 안 해온 날 드러난다. 그때는 이미 늦다.
 *
 * ── 막는 것보다 성가시게 하는 편이 낫다 ────────────────────
 *
 * 처음에는 화면을 통째로 가렸다. 그런데 그러면 **켤 수 없는 아이는 앱을
 * 아예 못 쓴다** (학교 컴퓨터, 낮은 iOS). 숙제를 못 보는 쪽이 더 큰 손해다.
 *
 * 그래서 **보이기는 다 보이되, 무엇을 누르든 이 창이 먼저 뜬다.** 두 번
 * 누르면 지나갈 수 있지만, 매번 그래야 하므로 결국 켜게 된다. 켜는 순간
 * 이 창은 영영 안 나온다.
 *
 * **방해금지는 따로 있다** (0105). 밤에 안 울리는 길을 안 열어두면, 아이는
 * 폰 설정에서 알림을 통째로 꺼버린다 — 그러면 우리는 알 수조차 없다.
 */
export default function AlertGate({ children }) {
  const [state, setState] = useState("checking");
  const [msg, setMsg] = useState(null);
  const [nag, setNag] = useState(false);          // 지금 창이 떠 있나
  const [pending, startTransition] = useTransition();

  const off = state === "off" || state === "denied" || state === "unsupported";

  useEffect(() => {
    let alive = true;
    pushState().then((s) => alive && setState(s));
    return () => { alive = false; };
  }, []);

  /**
   * **무엇을 누르든 한 번 가로챈다.**
   *
   * 잡는 단계(capture)에서 받아서 그 누름 자체를 없앤다 — 안 그러면 창이
   * 뜨는 동시에 눌린 것도 실행돼서, 아이는 「떴다 사라졌네」 하고 만다.
   *
   * 창을 닫고 다시 누르면 그대로 된다. 못 하게 막는 것이 아니라
   * **매번 한 번씩 걸리게** 하는 것이다.
   */
  const grab = useCallback((e) => {
    if (!off) return;
    // 이 창 안에서 누르는 것은 그대로 (닫기 · 알림 켜기)
    if (e.target?.closest?.("[data-alertgate]")) return;
    e.preventDefault();
    e.stopPropagation();
    setNag(true);
  }, [off]);

  useEffect(() => {
    if (!off) return;
    document.addEventListener("click", grab, true);
    return () => document.removeEventListener("click", grab, true);
  }, [off, grab]);

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
      setNag(false);
    });
  }

  // 확인하는 동안·켜져 있으면 아무것도 안 한다
  if (state === "checking" || state === "on") return children;

  const guide = howTo();
  const kind = deviceKind();
  const no = state === "unsupported" ? whyUnsupported() : null;

  const how = (
    <>
      {no ? (
        <div className="notice" style={{ marginBottom: 10, fontSize: 14.5, lineHeight: 1.7 }}>
          <b>{no.why}</b>
          <br />
          {no.fix}
        </div>
      ) : guide.why ? (
        <div className="notice" style={{ marginBottom: 10, fontSize: 14.5 }}>{guide.why}</div>
      ) : null}

      {!no && (
        <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 15, lineHeight: 1.9 }}>
          {guide.steps.map((t) => <li key={t}>{t}</li>)}
        </ol>
      )}

      {state === "denied" ? (
        <div className="notice" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
          <b>알림이 차단되어 있어요.</b>{" "}
          {kind === "ios"
            ? "아이폰 설정 → 알림 → 클로이영어 에서 [알림 허용]을 켜주세요."
            : kind === "android"
            ? "크롬 주소창 왼쪽 자물쇠 → 권한 → 알림 을 [허용]으로 바꿔주세요."
            : "주소창 왼쪽 자물쇠 → 알림 을 [허용]으로 바꾼 뒤 새로고침해주세요."}
        </div>
      ) : guide.can && !no ? (
        <button className="btn btn-primary btn-block" onClick={turnOn} disabled={pending}>
          {pending ? "켜는 중…" : "알림 켜기"}
        </button>
      ) : null}

      {msg && <p className="err" style={{ marginTop: 8 }}>{msg}</p>}
    </>
  );

  return (
    <>
      {/* 늘 맨 위에 붙어 있는 빨간 띠 */}
      <div className="card sect sect-bad" data-alertgate>
        <h2 style={{ margin: "0 0 6px", fontSize: 17.5, fontWeight: 800 }}>
          🔔 알림이 꺼져 있어요
        </h2>
        <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.75 }}>
          숙제 · 시험 · 전달사항이 <b>전부 이 앱 알림으로만</b> 갑니다.
          지금은 아무 소식도 못 받는 상태예요. <b>한 번만 켜두면 끝납니다.</b>
        </p>
        {how}
      </div>

      {children}

      {/* 무엇을 누르든 먼저 뜨는 창 */}
      {nag && (
        <div
          data-alertgate
          onClick={() => setNag(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            className="card"
            data-alertgate
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, width: "100%", maxHeight: "86vh", overflow: "auto" }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 18.5, fontWeight: 800 }}>
              🔔 알림을 먼저 켜주세요
            </h2>
            <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.75 }}>
              알림이 꺼져 있어서 숙제가 올라와도 모르고 지나갑니다.
              <br />
              <b>켜면 이 창은 다시 안 뜹니다.</b> 밤에 안 울리게 하는 것은
              아래 <b>방해금지 시간</b>에서 정할 수 있어요.
            </p>
            {how}
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 8 }}
              onClick={() => setNag(false)}
            >
              나중에 (다시 뜹니다)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
