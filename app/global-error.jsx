"use client";

/**
 * 루트 레이아웃까지 터졌을 때의 마지막 안전망.
 * 여기는 layout 밖이라 html/body 를 직접 갖춰야 한다.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            앱에 문제가 생겼어요
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
            새로고침해도 안 되면 원장님께 알려주세요.
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
      </body>
    </html>
  );
}
