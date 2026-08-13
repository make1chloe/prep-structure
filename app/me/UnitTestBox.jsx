"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitUnitTest } from "./unitTestActions";

/**
 * **단원평가 결과 내기.**
 *
 * 원장님 (2026-08-07) — 「숙제에서 단원평가를 내가 미리 배정 함.
 * 다음 시간에 등원 해서 학생이 결과만 제출 함」
 *
 * **아이는 단원 이름을 적지 않는다.** 배정에 이미 붙어 있다. 적게 하면
 * 아이마다 다르게 적어서 같은 단원이 여러 이름으로 쌓이고, 그러면
 * 「관계사에서 세 번 막혔다」 를 셀 수가 없다.
 *
 * 맞은 개수와 전체 문항 수만 받는다. 통과 여부는 **선생님이 정하신 통과선**
 * 으로 서버가 판단한다 — 아이가 「통과했어요」 를 고르게 하면 그것은
 * 기록이 아니라 주장이 된다.
 */
export default function UnitTestBox({ task, readOnly = false, asId = null }) {
  const [correct, setCorrect] = useState("");
  const [total, setTotal] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const unitName = (task.units || []).join(" · ") || task.name;

  function send() {
    setMsg(null);
    startTransition(async () => {
      const res = await submitUnitTest({
        reportItemId: task.reportItemId,
        itemId: task.itemId,
        term: unitName,
        correct,
        total,
        asId,
      });
      if (res?.error) { setMsg({ bad: true, text: res.error }); return; }
      setMsg({ bad: false, text: res.note || "냈어요." });
      router.refresh();
    });
  }

  return (
    <div className="card card-tight" style={{ marginTop: 8 }}>
      <b style={{ fontSize: 15 }}>단원평가 결과 내기</b>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        <b>{unitName}</b> — 몇 개 맞았는지만 적어주세요.
      </p>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input input-sm" type="number" inputMode="numeric"
          style={{ width: 74 }} placeholder="맞은 수"
          value={correct} onChange={(e) => setCorrect(e.target.value)}
        />
        <span className="hint">/</span>
        <input
          className="input input-sm" type="number" inputMode="numeric"
          style={{ width: 74 }} placeholder="전체"
          value={total} onChange={(e) => setTotal(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={pending || readOnly || !correct || !total}
        >
          {pending ? "내는 중…" : "내기"}
        </button>
      </div>
      {msg && (
        <p className={msg.bad ? "err" : "hint"} style={{ marginTop: 8 }}>{msg.text}</p>
      )}
    </div>
  );
}
