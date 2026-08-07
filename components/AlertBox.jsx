"use client";

import { useEffect, useState, useTransition } from "react";
import PushToggle from "@/app/me/PushToggle";
import { getQuietHours, saveQuietHours } from "@/app/push/actions";
import { quietLabel } from "@/lib/quiet";

/**
 * **알림 설정** — 켜고 · 끄고 · 밤에는 안 울리게.
 *
 * 학부모 화면과 학생 화면이 **같은 것을 쓴다** (2026-08-07). 학생에게도
 * 방해금지가 필요하다 — 알림을 못 끄게 막아두었으니, 밤에 안 울리는
 * 길이라도 없으면 폰 설정에서 통째로 꺼버린다. 그러면 우리는 알 수도 없다.
 *
 * 원장님 (2026-08-07) — 「학부모 어플에서는 알림 켜기 끄기 방해금지 시간
 * 설정을 할 수 있도록 버튼을 만들어」
 *
 * 알림을 아예 끄시면 결석 답장도 · 리포트도 · 급한 전달사항도 안 간다.
 * 대부분은 **밤에 안 울리기를** 바라시는 것이다. 끄는 것 말고 **시간만
 * 비켜가는** 길이 있으면 켜둔 채로 지내신다 — 그게 서로에게 낫다.
 */
export default function AlertBox() {
  const [q, setQ] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getQuietHours().then((r) => {
      if (!alive) return;
      setQ(r);
      setFrom(r.from || "");
      setTo(r.to || "");
    });
    return () => { alive = false; };
  }, []);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveQuietHours(from, to);
      if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
      setMsg({ bad: false, text: res.note });
      setQ({ ...q, from, to });
    });
  }

  const now = quietLabel(q?.from, q?.to);

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>알림</h2>

      <PushToggle />

      {q?.ready === false ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>
          방해금지 시간은 곧 쓰실 수 있습니다.
        </p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13.5 }}>방해금지 시간</b>
          <p className="hint" style={{ margin: "4px 0 8px" }}>
            이 시간에는 알림이 오지 않습니다. 밤 시간처럼 <b>날을 넘겨</b> 정하셔도 됩니다.
            {now && <> 지금은 <b>{now}</b> 입니다.</>}
          </p>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input input-sm" type="time" style={{ width: 110 }}
              value={from} onChange={(e) => setFrom(e.target.value)}
            />
            <span className="hint">부터</span>
            <input
              className="input input-sm" type="time" style={{ width: 110 }}
              value={to} onChange={(e) => setTo(e.target.value)}
            />
            <span className="hint">까지</span>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
              저장
            </button>
            {/* **끄는 길이 보여야 한다.** 비우고 저장하는 것이라고 적어두지
                않으면, 한 번 정하신 분은 되돌리는 법을 못 찾으신다 */}
            {(from || to) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setFrom(""); setTo(""); }}
                disabled={pending}
              >
                지우기
              </button>
            )}
          </div>
          {msg && (
            <p className={msg.bad ? "err" : "hint"} style={{ marginTop: 8 }}>{msg.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
