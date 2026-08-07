"use client";

import { useEffect, useState, useTransition } from "react";
import PushToggle from "@/app/me/PushToggle";
import PushDiag from "@/components/PushDiag";
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
/**
 * @param brief  **켜기·끄기와 방해금지 시간만** (원장님, 2026-08-07 —
 *   「알림 켜면 끄기랑 방해금지 모드 설정만 남기고 페이지 맨 밑으로
 *    내려줘」).
 *
 *   아이 화면 맨 위가 설명으로 시작하면, 정작 「지금 할 것」 이 한 화면
 *   아래로 밀린다. 한 번 켜고 나면 다시 볼 일이 없는 칸이다.
 */
export default function AlertBox({ brief = false }) {
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

      <PushToggle brief={brief} />

      {q?.ready === false ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>
          방해금지 시간은 곧 쓰실 수 있습니다.
        </p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13.5 }}>방해금지 시간</b>
          {/* **켜두시기를 권한다** (원장님, 2026-08-07). 알림은 선생님이
              수업을 마치고 정리하시다가 나가는 일이 많아 밤늦게 갈 수 있다.
              그걸 그대로 두면 잠결에 울리는 폰 때문에 알림을 **통째로**
              꺼버리시고, 그러면 우리는 아무것도 못 알린다 */}
          <p className="hint" style={{ margin: "4px 0 8px", lineHeight: 1.7 }}>
            {brief ? (
              <>
                이 시간에는 알림이 오지 않습니다.
                {now && <> 지금은 <b>{now}</b>.</>}
                {q?.isDefault && <span className="tag tag-muted" style={{ marginLeft: 6 }}>기본값</span>}
              </>
            ) : (
              <>
                이 시간에는 알림이 오지 않습니다. 밤 시간처럼 <b>날을 넘겨</b> 정하셔도 됩니다.
                {now && <> 지금은 <b>{now}</b> 입니다.</>}
                {q?.isDefault && <span className="tag tag-muted" style={{ marginLeft: 6 }}>기본값</span>}
                <br />
                <b>늦은 시간에 알림이 발송될 수 있으니 켜 놓는 것을 권장드립니다.</b>
              </>
            )}
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

      {/**
        * **안 되는 그 폰에서 눌러볼 것** (원장님, 2026-08-07 — 「안드로이드폰에서
        * 알림이 안 켜져」 · 「학생이 부르는 중 눌러도 알림이 안 와」).
        *
        * 접어둔다 — 잘 되는 분께는 볼 일이 없는 칸이다. 대신 **학생 ·
        * 학부모 · 선생님 화면 어디에나** 있다. 안 되는 계정으로 열어야
        * 뜻이 있기 때문이다.
        */}
      <PushDiag />
    </div>
  );
}
