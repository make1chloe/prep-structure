"use client";

/**
 * 종이로 뽑는 단추. **종이에는 안 찍힌다** (`.noprint`).
 *
 * 브라우저 메뉴의 인쇄를 찾아 들어가는 것보다 여기 단추 하나가 빠르다 —
 * 원장님은 교재를 바꿔가며 여러 장을 뽑으신다.
 */
export default function PrintBar({ backHref }) {
  return (
    <div className="row noprint" style={{ gap: 6, marginBottom: 12, alignItems: "center" }}>
      <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
        🖨 인쇄하기
      </button>
      <a className="btn btn-ghost btn-sm" href={backHref}>
        교재로 돌아가기
      </a>
      <span className="hint">
        미리보기 그대로 나갑니다 — 메뉴와 단추는 종이에 안 찍혀요.
      </span>
    </div>
  );
}
