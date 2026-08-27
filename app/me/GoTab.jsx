"use client";

/**
 * **다른 탭의 그 자리로 가는 단추** (탭 개편 C2).
 *
 * 서버가 그린 카드 안에서 탭을 바꿔야 할 때 쓴다 (예: 등원 중 할 일을
 * 다 한 뒤 「집에 갈 숙제 보러 가기」). 신설 채널 me:go 를 쏘고,
 * MeTabs 가 받아 탭을 바꾸고 그 블록으로 스크롤한다.
 */
export default function GoTab({ tab, blk = "", className = "btn btn-ghost btn-sm", style, children }) {
  return (
    <button
      className={className}
      style={style}
      onClick={() =>
        window.dispatchEvent(new CustomEvent("me:go", { detail: { tab, blk } }))
      }
    >
      {children}
    </button>
  );
}
