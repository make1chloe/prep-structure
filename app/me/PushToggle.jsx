"use client";

import { useEffect, useState, useTransition } from "react";
import { getPushPublicKey, saveSubscription, removeSubscription } from "@/app/push/actions";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushToggle() {
  const [state, setState] = useState("checking"); // checking | off | on | unsupported | denied
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (alive) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!alive) return;
        if (Notification.permission === "denied") setState("denied");
        else setState(sub ? "on" : "off");
      } catch {
        if (alive) setState("unsupported");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setMsg("");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState("denied");
      return;
    }
    const { publicKey, error } = await getPushPublicKey();
    if (error || !publicKey) {
      setMsg(error || "알림 준비가 아직 안 됐어요. 선생님께 말씀해주세요.");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      startTransition(async () => {
        const res = await saveSubscription(sub.toJSON(), navigator.userAgent);
        if (res?.error) {
          setMsg(res.error);
          return;
        }
        setState("on");
        setMsg("이제 숙제가 올라오면 알림이 옵니다.");
      });
    } catch (e) {
      setMsg(`알림을 켜지 못했어요: ${e.message}`);
    }
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

  if (state === "unsupported") {
    return (
      <div className="card card-tight">
        <b style={{ fontSize: 13.5 }}>알림 받기</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          이 브라우저에서는 알림을 쓸 수 없어요. 아이폰은 <b>공유 → 홈 화면에 추가</b> 한 뒤
          그 아이콘으로 열면 알림을 켤 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="card card-tight">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <b style={{ fontSize: 13.5 }}>알림 받기</b>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {state === "on"
              ? "숙제가 올라오면 알림이 옵니다."
              : state === "denied"
              ? "알림이 차단되어 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해주세요."
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
