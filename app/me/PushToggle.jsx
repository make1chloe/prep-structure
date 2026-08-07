"use client";

import { useEffect, useState, useTransition } from "react";
import { getPushPublicKey, saveSubscription, removeSubscription } from "@/app/push/actions";
// 켜는 절차는 lib/pushClient 한 곳에만 둔다 — 두 군데면 한쪽만 고치게 된다
import { pushState, enablePush } from "@/lib/pushClient";

/**
 * @param onlyWhenOff  이미 켜져 있으면 **아무것도 안 그린다**.
 *
 * 원장님 (2026-08-07) — 「학생 학부모 어플에서 전달사항은 알림이 안 와」
 *
 * 켜는 버튼이 화면 **맨 아래**에 있었다 (학부모 화면에는 아예 없었다).
 * 거기까지 내려가 보시는 분이 없으니, 아무도 안 켜져 있었고, 그래서
 * 공지를 올려도 알림이 갈 곳이 없었다.
 *
 * 그렇다고 맨 위에 늘 두면 이미 켜신 분께는 매일 걸리적거리는 칸이 된다.
 * **안 켠 사람에게만** 위에 보이게 한다.
 */
export default function PushToggle({ onlyWhenOff = false, warn = false }) {
  const [state, setState] = useState("checking"); // checking | off | on | unsupported | denied
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;
      const s = await pushState();
      if (alive) setState(s);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function turnOn() {
    setMsg("");
    startTransition(async () => {
      const r = await enablePush(getPushPublicKey, saveSubscription);
      if (!r.ok) {
        setMsg(r.error);
        if (r.denied) setState("denied");
        return;
      }
      setState("on");
      setMsg("이제 숙제가 올라오면 알림이 옵니다.");
    });
  }

  async function turnOff() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      startTransition(async () => {
        await removeSubscription(endpoint);
        setState("off");
        setMsg("알림을 껐어요.");
      });
    } else {
      setState("off");
    }
  }

  if (state === "checking") return null;
  // 이미 켜져 있으면 위쪽 자리에서는 조용히 사라진다
  if (onlyWhenOff && state === "on") return null;

  /**
   * **안 켜져 있으면 눈에 띄어야 한다** (원장님, 2026-08-07 —
   * 「알림이 켜져야 불편함 없이 쓸 수 있게 계속 첫 화면에서 경고 메세지를」).
   *
   * 옅은 회색 칸으로 두면 매일 봐도 안 읽힌다. 안 켠 아이에게는 **빨간
   * 칸**으로 보이고, 켜는 순간 사라진다 — 그래서 잔소리로 남지 않는다.
   */
  const box = warn ? "card card-tight sect sect-bad" : "card card-tight";

  if (state === "unsupported") {
    return (
      <div className={box}>
        <b style={{ fontSize: 13.5 }}>알림 받기</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          이 브라우저에서는 알림을 쓸 수 없어요. 아이폰은 <b>공유 → 홈 화면에 추가</b> 한 뒤
          그 아이콘으로 열면 알림을 켤 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <b style={{ fontSize: 13.5 }}>
            {warn && state !== "on" ? "⚠️ 알림이 꺼져 있어요" : "알림 받기"}
          </b>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {state === "on"
              ? "숙제가 올라오면 알림이 옵니다."
              : state === "denied"
              ? "알림이 차단되어 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해주세요."
              : warn
              ? "숙제 · 시험 · 전달사항이 올라와도 모르고 지나갑니다. 한 번만 켜두면 됩니다."
              : "켜두면 숙제가 올라올 때 바로 알려드려요. 문자와 달리 요금이 들지 않습니다."}
          </p>
        </div>
        {state !== "denied" && (
          <button
            className={`btn btn-sm ${state === "on" ? "btn-ghost" : "btn-primary"}`}
            onClick={state === "on" ? turnOff : turnOn}
            disabled={pending}
          >
            {state === "on" ? "끄기" : "알림 켜기"}
          </button>
        )}
      </div>
      {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
