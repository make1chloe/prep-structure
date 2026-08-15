"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parentConfirmMonth } from "@/app/schedule/confirmActions";

/**
 * **다음 달 일정 1차 확인** (0123, 원장님 2026-08-14~15 — 「매달 25일까지
 * 학부모 어플 통해서 다음 달 결석 일정 확인」 · 「학부모가 일정 제출 후
 * 1차 확인 버튼 눌러서 일정을 확정하는 과정」).
 *
 * 결석·여행은 위의 보내기로 먼저 보내고, 다 보냈으면(없으면 바로)
 * 확인을 누른다 — 「없음」 도 확인이다. 이걸 눌러야 원장님이 다음 달
 * 회차를 확정하고 수강료 안내가 나간다.
 */
export default function MonthConfirm({ studentId, ym, parentAt, childName }) {
  const [at, setAt] = useState(parentAt || null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const month = Number(ym.slice(5, 7));
  const late = Number(new Date().getDate()) >= 25 && !at;   // 25일 넘도록 확인 전

  function confirm() {
    startTransition(async () => {
      const res = await parentConfirmMonth(studentId);
      if (res?.error) { alert(res.error); return; }
      setAt(new Date().toISOString());
      router.refresh();
    });
  }

  return (
    <div
      className="card card-tight"
      style={late ? { borderColor: "var(--amber)", background: "var(--amber-soft)" } : undefined}
    >
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>📅 {month}월 일정 확인</b>
        {at ? (
          <span className="tag tag-mint">
            확인해주셨어요 · {new Date(at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
          </span>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={confirm}>
            {month}월에 빠질 날 없어요 / 다 보냈어요 — 확인
          </button>
        )}
      </div>
      <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
        {month}월에 {childName ? `${childName} 학생이` : "아이가"} 빠질 날(여행·행사 등)이
        있으면 <b>위의 보내기로 먼저</b> 알려주시고, 다 보내셨으면 확인을 눌러주세요.
        없으면 바로 눌러주시면 됩니다. <b>매달 25일까지</b> 확인해주시면 다음 달
        수업 회차가 확정돼요.
      </p>
    </div>
  );
}
