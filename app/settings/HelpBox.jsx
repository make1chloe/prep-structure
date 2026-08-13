"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHelp } from "./helpActions";

/**
 * 「이 화면은 이런 곳입니다」 를 보일지 말지.
 *
 * 기본은 꺼둔다. 매일 여는 화면에서 같은 설명을 백 번 읽을 일은 없다.
 * 조교 선생님이 새로 오셨거나 몇 달 만에 여는 화면이라면 켜두시면 된다.
 */
export default function HelpBox({ on = false }) {
  const [now, setNow] = useState(!!on);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function flip() {
    const next = !now;
    setNow(next);
    startTransition(async () => {
      await setHelp(next);
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>화면 설명 문구</h2>
        <span className={`tag ${now ? "tag-mint" : "tag-muted"}`}>{now ? "보임" : "감춤"}</span>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={pending} onClick={flip}>
          {now ? "감추기" : "보이기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.7 }}>
        화면 제목 밑에 붙는 <b>「이 화면은 이런 곳입니다」</b> 안내입니다.
        처음 쓰실 때나 새 선생님이 오셨을 때 켜두세요. 이 브라우저에만 저장됩니다.
        학생·학부모 화면은 이 설정과 상관없이 그대로입니다.
      </p>
    </div>
  );
}
