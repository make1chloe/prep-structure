"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { leaveNow } from "./arrivalActions";

/**
 * **하원할게요** (원장님, 2026-08-23 — 「하원 누르면 자동 로그아웃되고,
 * 엄마에게 하원했다고 알림 가게 해줘」).
 *
 * 학생 앱은 **등원하면 학원 공용 기기**로 보고, 집에서는 제 폰으로 본다.
 * 그래서 로그아웃은 **공용 기기로 표시해 둔 기기에서만** 한다 — 제 폰에서
 * 로그아웃해 버리면 집에서 「하원 후 숙제」를 보려고 매번 다시 로그인해야
 * 한다. 표시는 그 기기에 기억한다 (한 번 켜두면 끝).
 *
 * 단추는 **학원 안에서만** 뜬다. 집에서 눌러 어머니께 「하원했어요」 가
 * 가는 일은 없어야 한다.
 */
export default function LeaveCard({ atAcademy = false, done = false, readOnly = false, asId = null }) {
  const [shared, setShared] = useState(false);
  const [left, setLeft] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef(null);

  useEffect(() => {
    try {
      setShared(localStorage.getItem("shared-device") === "1");
    } catch { /* 사생활 보호 모드 — 제 폰으로 본다 */ }
  }, []);

  function toggleShared() {
    const next = !shared;
    setShared(next);
    try {
      if (next) localStorage.setItem("shared-device", "1");
      else localStorage.removeItem("shared-device");
    } catch { /* 무시 */ }
  }

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
      // 공용 기기면 다음 아이를 위해 로그아웃한다
      if (shared) formRef.current?.requestSubmit();
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={tap} disabled={pending}>
          {pending ? "알리는 중…" : "🏠 하원할게요"}
        </button>
        <span className="hint" style={{ fontSize: 13 }}>
          누르면 어머니께 하원 알림이 가요
          {shared ? " · 이 기기에서는 로그아웃돼요" : ""}
        </span>
      </div>
      <label
        className="hint"
        style={{ display: "block", marginTop: 8, fontSize: 12.5, cursor: "pointer" }}
      >
        <input type="checkbox" checked={shared} onChange={toggleShared} /> 이 기기는 학원 공용
        (하원하면 로그아웃)
      </label>
      {/* 로그아웃은 앱 전체가 쓰는 그 길 그대로 (POST /logout) */}
      <form ref={formRef} action="/logout" method="post" style={{ display: "none" }} />
    </div>
  );
}
