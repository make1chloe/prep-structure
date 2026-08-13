"use client";

import { useTransition } from "react";
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
 */
const STEPS = [
  { kind: "phone", label: "핸드폰 냈어요", ask: "핸드폰을 선생님께 내고 눌러주세요" },
  {
    kind: "attend",
    label: "출석 체크 했어요",
    ask: "출석 체크 앱에서 눌렀는지 확인해주세요",
    note: "누르면 선생님께 등원했다고 표시돼요",
  },
  { kind: "homework", label: "숙제 냈어요", ask: "숙제를 선생님께 내고 눌러주세요" },
];

export default function ArrivalCard({ done = {}, atAcademy = true, readOnly = false, asId = null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const left = STEPS.filter((s) => !done[s.kind]);
  if (left.length === 0) return null;

  const now = left[0];
  const rest = left.slice(1);

  function tap(kind) {
    startTransition(async () => {
      const res = await checkArrival(kind, true, asId);
      if (res?.error) {
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

      {!atAcademy && !readOnly && !asId && (
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
        disabled={pending || (!atAcademy && !asId) || readOnly}
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
