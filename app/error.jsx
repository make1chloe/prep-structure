"use client";

/**
 * 화면 하나가 터졌을 때 흰 화면 대신 보여주는 것.
 *
 * React 19 로 올라가면 안 잡힌 오류의 표시 경로가 바뀐다 —
 * 그 전에 우리 손으로 잡아 두어야 폰에서 「그냥 하얀 화면」이 안 된다.
 * (Next 16 직행 계획 0단계, 2026-08-26)
 */
export default function Error({ error, reset }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        화면에 문제가 생겼어요
      </div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        다시 시도해도 안 되면 원장님께 알려주세요.
      </div>
      <button
        onClick={() => reset()}
        style={{
          fontSize: 14,
          padding: "8px 20px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
