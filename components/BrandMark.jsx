"use client";

import { useState } from "react";

/**
 * 화면 왼쪽 위의 로고.
 *
 * 원장님이 올린 로고(0080)를 쓴다. 아직 안 올렸거나 못 불러오면
 * **「클」 글자로 물러난다** — 로고 자리가 빈 네모로 남으면 앱이 깨진 것처럼 보인다.
 *
 * 배경이 없는 판(`mark`)을 쓴다. 아이콘용은 흰 바탕으로 굽는데, 그걸 그대로
 * 쓰면 어두운 화면에서 흰 타일이 하나 떠 있게 된다.
 */
export default function BrandMark({ className = "mark" }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <span className={className}>클</span>;

  return (
    <span className={`${className} brandmark`}>
      <img
        src="/api/icon/mark"
        alt="클로이영어"
        onError={() => setFailed(true)}
        draggable={false}
      />
    </span>
  );
}
