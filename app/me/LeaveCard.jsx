"use client";

import { useRef, useState, useTransition } from "react";
import { leaveNow } from "./arrivalActions";
import { learnedEnough, LEARNED_ASK } from "@/lib/learned";

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
/**
 * **길목** (0181, 원장 확정 2026-08-28 — 「반드시」).
 * 「오늘 배운 것」 을 안 적으면 하원을 못 누른다. 공지 확인 도장(NoticeGate,
 * 0129)이 화면 앞을 막는 것과 같은 자리다.
 *
 * 다만 **막기만 하지 않는다** — 무엇을 하면 되는지 말해주고, 그 칸이 바로
 * 위에 있다 (A4 — 막다른 태그는 실패다). 잣대는 lib/learned 한 벌이라
 * 「다 적었는데 안 눌린다」 가 생기지 않는다.
 */
export default function LeaveCard({ atAcademy = false, done = false, readOnly = false, learned = "", gate = true }) {
  const [left, setLeft] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef(null);

  // 0181 을 아직 안 돌린 DB 면 **길목을 안 세운다** (gate=false).
  // 선생님이 SQL 을 안 돌렸다고 아이가 집에 못 가면 안 된다.
  const wrote = !gate || learnedEnough(learned);

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
      const res = await leaveNow();
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
        <button className="btn btn-primary" onClick={tap} disabled={pending || !wrote}>
          {pending ? "알리는 중…" : "🏠 하원할게요"}
        </button>
        <span className="hint" style={{ fontSize: 13 }}>
          {wrote ? "누르면 어머니께 하원 알림이 가고 로그아웃돼요" : LEARNED_ASK}
        </span>
      </div>
      {/* 왜 안 눌리는지 **단추 옆에서** 말해준다. 위 칸을 못 보고
          「고장났다」 고 생각하는 아이가 없게 (원장님 8/21 — 아이들은
          안 되면 그냥 여러 번 누른다) */}
      {!wrote && (
        <p className="notice" style={{ margin: "8px 0 0", fontSize: 14 }}>
          바로 위 <b>「오늘 배운 것」</b> 을 한 줄 적고 <b>「적었어요」</b> 를 누르면
          하원할 수 있어요. 길게 안 써도 돼요.
        </p>
      )}

      {/* 로그아웃은 앱 전체가 쓰는 그 길 그대로 (POST /logout) */}
      <form ref={formRef} action="/logout" method="post" style={{ display: "none" }} />
    </div>
  );
}
