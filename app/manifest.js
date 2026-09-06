/** 홈 화면에 담는 앱 — 짧은 이름이 알림의 「from 클로이영어」가 된다(원장님 2026-08-07 「[클로이영어] 공지사항 이거면 됐지」). 아이폰은 홈 화면에 담아야 알림이 된다.
 *  아이콘은 /api/icon(원장님이 올린 로고 — 없으면 404, 폰이 제 기본 그림을 쓴다). 배경·테마색은 토큰 --ground 와 같은 값(app/layout.js) */
export default function manifest() {
  return {
    name: "클로이영어", short_name: "클로이영어", lang: "ko", start_url: "/", display: "standalone",
    background_color: "#F6F7F9", theme_color: "#F6F7F9",
    icons: [{ src: "/api/icon/192", sizes: "192x192", type: "image/png" }, { src: "/api/icon/512", sizes: "512x512", type: "image/png" }],
  };
}
