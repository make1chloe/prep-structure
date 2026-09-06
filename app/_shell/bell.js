"use client";
/** 🔔 알림 켜기 — 브라우저 쪽 절차는 여기 한 곳. 기기마다 길이 다르다(아이폰은 홈 화면에 담아야) — 판단은 lib/push-plan(순수). 서버 쪽은 app/push/actions */
import { useEffect, useState, useTransition } from "react";
import { publicKey, save, remove } from "../push/actions.js";
import { deviceKind, isStandaloneOf, howTo, whyUnsupported, urlBase64ToUint8Array, STATE_NAME } from "@/lib/push-plan";
const envOf = () => { const kind = deviceKind(navigator.userAgent, navigator.maxTouchPoints); return { kind, standalone: isStandaloneOf(window), hasSW: "serviceWorker" in navigator, hasPush: "PushManager" in window }; };
export default function BellCard() {
  const [state, setState] = useState("checking"); const [why, setWhy] = useState(""); const [err, setErr] = useState(""); const [how, setHow] = useState(null);
  const [pending, start] = useTransition();
  useEffect(() => { (async () => {
    try {
      const e = envOf(); const no = whyUnsupported(e);
      if (no) { setWhy(`${no.why} ${no.fix}`); return setState("unsupported"); }
      setHow(howTo(e.kind, e.standalone));
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === "denied") return setState("denied");
      setState(sub ? "on" : "off");
    } catch (e) { setWhy(String(e?.message ?? e)); setState("unsupported"); }
  })(); }, []);
  const on = () => start(async () => {
    setErr("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("denied"); return; }
      const k = await publicKey(); if (!k.ok) return setErr(k.msg);
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(k.key) });
      const r = await save(sub.toJSON()); if (!r.ok) return setErr(r.msg);
      setState("on");
    } catch (e) { setErr(`알림을 켜지 못했어요: ${e?.message ?? e}`); }
  });
  const off = () => start(async () => {
    setErr("");
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await remove(sub.endpoint); await sub.unsubscribe(); } setState("off"); }
    catch (e) { setErr(String(e?.message ?? e)); }
  });
  return (
    <div className="task" data-card="bell">
      <div className="h"><b><span className="cemo">🔔</span>알림</b><span className="spacer" /><span className={"pill" + (state === "on" ? " hw" : "")} data-g="bell-state">{STATE_NAME[state]}</span></div>
      {state === "off" && <>
        {how?.steps.map((s, i) => <p key={i} className="note" style={{ margin: "4px 0 0" }}>{i + 1}. {s}</p>)}
        {how?.can && <button className="btn pri sm" type="button" style={{ marginTop: 8 }} disabled={pending} data-act="bell-on" onClick={on}>🔔 알림 켜기</button>}</>}
      {state === "on" && <div className="wv" style={{ marginTop: 4 }}><span className="note" style={{ margin: 0 }}>이 기기로 안내가 옵니다</span><button className="btn sm gho" type="button" disabled={pending} data-act="bell-off" onClick={off}>끄기</button></div>}
      {state === "denied" && <p className="note" style={{ margin: "4px 0 0" }}>브라우저가 알림을 막고 있어요 — 주소창 옆 자물쇠에서 알림을 허용으로 바꾼 뒤 다시 여세요.</p>}
      {state === "unsupported" && <p className="note" style={{ margin: "4px 0 0" }}>{why}</p>}
      {err && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{err}</p>}
    </div>
  );
}
