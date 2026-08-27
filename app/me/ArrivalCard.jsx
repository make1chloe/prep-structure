"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkArrival } from "./arrivalActions";

/**
 * 등원해서 먼저 할 것 — 핸드폰 · 출석 · 숙제.
 *
 * 출석은 외부 앱에서 하지만 **아이들이 잊어버린다.** 그래서 짚어준다.
 *
 * 셋을 한꺼번에 늘어놓으면 습관적으로 세 번 연달아 눌러버린다.
 * 그래서 **한 번에 하나씩만** 크게 보여준다. 하나를 누르면 다음이 나온다.
 * 남은 것은 아래에 흐리게 이름만 둔다 — 뭐가 남았는지는 알아야 하니까.
 *
 * 단계 정의·남은 셈은 lib/arrivalSteps 한 벌 — 등원 탭 배지도 같은 것을
 * 센다 (탭 개편 C2, 원칙 1).
 */
import { STEPS } from "@/lib/arrivalSteps";

export default function ArrivalCard({ done = {}, atAcademy = true, readOnly = false }) {
  // 누르는 순간 다음 단계로 — 서버 답을 기다리면 한 박자 늦어 애들이 또 누른다
  // (원장님 2026-08-21 「버튼이 작동이 너무 늦어」). 실패하면 되돌리고 알린다.
  const [doneLocal, setDoneLocal] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const left = STEPS.filter((s) => !done[s.kind] && !doneLocal.has(s.kind));
  if (left.length === 0) return null;

  const now = left[0];
  const rest = left.slice(1);

  function tap(kind) {
    setDoneLocal((prev) => new Set(prev).add(kind));   // 먼저 넘어간다 — 저장은 뒤에서
    startTransition(async () => {
      const res = await checkArrival(kind, true);
      if (res?.error) {
        setDoneLocal((prev) => { const n = new Set(prev); n.delete(kind); return n; });   // 실패 — 되돌린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--amber, #e0a33e)" }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 16 }}>등원시 이것부터!</b>
        <span className="spacer" />
        <span className="hint">
          {STEPS.length - left.length} / {STEPS.length}
        </span>
      </div>

      {!atAcademy && !readOnly && (
        <div className="notice" style={{ margin: "10px 0 0", fontSize: 14 }}>
          <b>학원 와이파이에 연결해주세요.</b> 학원에 도착해야 누를 수 있어요.
        </div>
      )}
      <p className="nowsub" style={{ margin: "10px 0 0" }}>{now.ask}</p>
      {now.note && (
        <p className="hint" style={{ margin: "4px 0 0", fontSize: 13 }}>{now.note}</p>
      )}
      <button
        className="bigbtn"
        disabled={pending || !atAcademy || readOnly}
        onClick={() => tap(now.kind)}
      >
        {now.label}
      </button>

      {rest.length > 0 && (
        <p className="hint" style={{ margin: "10px 0 0", fontSize: 13 }}>
          다음: {rest.map((s) => s.label.replace(" 했어요", "").replace(" 냈어요", "")).join(" → ")}
        </p>
      )}
    </div>
  );
}
