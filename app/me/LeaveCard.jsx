"use client";

import { useRef, useState, useTransition } from "react";
import { leaveNow } from "./arrivalActions";

/**
 * **하원할게요** (원장님, 2026-08-23 — 「하원 누르면 자동 로그아웃되고,
 * 엄마에게 하원했다고 알림 가게 해줘」).
 *
 * **누르면 무조건 로그아웃한다** (원장님 2026-08-24 — 「하원합니다 누르면
 * 그냥 무조건 로그아웃되게 해줘」).
 *
 * 8/23 에는 「공용 기기로 표시해 둔 기기에서만」 로그아웃하게 했다. 표시를
 * 켜는 것을 아이가 하게 되니 켜져 있는지 알 수가 없고, 안 켜져 있으면 다음
 * 아이가 앞 아이 계정으로 앱을 쓴다 — 그게 더 나쁘다.
 *
 * 그래도 제 폰에서 로그아웃될 걱정은 없다. **단추가 학원 안(atAcademy)에서만
 * 뜨기 때문이다** — 집에서는 아예 안 보인다.
 */
export default function LeaveCard({ atAcademy = false, done = false, readOnly = false, asId = null }) {
  const [left, setLeft] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef(null);

  if (readOnly || !atAcademy) return null;
  if (done || left) {
    return (
      <p className="hint" style={{ marginTop: 12 }}>
        하원했다고 알렸어요. 조심히 가요 👋
      </p>
    );
  }

  function tap() {
    if (!confirm("하원할게요 — 어머니께 알림이 갑니다.")) return;
    setLeft(true);   // 먼저 화면부터 (원칙 6-3)
    startTransition(async () => {
      const res = await leaveNow(asId);
      if (res?.error) {
        setLeft(false);
        alert(res.error);
        return;
      }
      // 다음 아이를 위해 로그아웃한다 (2026-08-24 — 무조건)
      formRef.current?.requestSubmit();
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={tap} disabled={pending}>
          {pending ? "알리는 중…" : "🏠 하원할게요"}
        </button>
        <span className="hint" style={{ fontSize: 13 }}>
          누르면 어머니께 하원 알림이 가고 로그아웃돼요
        </span>
      </div>

      {/* 로그아웃은 앱 전체가 쓰는 그 길 그대로 (POST /logout) */}
      <form ref={formRef} action="/logout" method="post" style={{ display: "none" }} />
    </div>
  );
}
