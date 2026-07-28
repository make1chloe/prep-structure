"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkArrival } from "./arrivalActions";

/**
 * 등원해서 먼저 할 것 — 핸드폰 · 숙제.
 *
 * **학생이 직접 누른다.** 들어와서 내는 것은 아이 몫이고,
 * 선생님은 오늘 수업 화면에서 다 냈는지 보기만 한다.
 * (출석은 외부 앱에서 하므로 여기 없다)
 *
 * 둘 다 끝나면 조용히 사라진다 — 학습 화면이 앞으로 나와야 한다.
 */
export default function ArrivalCard({ phoneAt = null, homeworkAt = null }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (phoneAt && homeworkAt) return null;

  function tap(kind, on) {
    startTransition(async () => {
      const res = await checkArrival(kind, on);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  const steps = [
    ["phone", "핸드폰 내기", phoneAt],
    ["homework", "숙제 내기", homeworkAt],
  ];

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--amber, #e0a33e)" }}>
      <b style={{ fontSize: 15 }}>먼저 할 것</b>
      <p className="hint" style={{ margin: "4px 0 10px" }}>
        내고 나서 눌러주세요. 둘 다 하면 이 칸이 사라져요.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {steps.map(([kind, label, at]) => (
          <button
            key={kind}
            className={at ? "arrdone" : "arrbtn"}
            disabled={pending}
            onClick={() => tap(kind, !at)}
          >
            <span>{at ? "✓ " : ""}{label}</span>
            {at && (
              <span className="hint" style={{ fontSize: 12 }}>
                {new Date(at).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
