import "./globals.css";

export const metadata = { title: "클로이영어" };

// ⚠️ viewportFit cover 가 없으면 env(safe-area-inset-bottom) 이 늘 0 이다 —
//    폰에서 저장 단추가 홈 표시줄에 깔린다(옛 앱 실측). themeColor 는 토큰 --ground 와 같다.
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0F1117" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
};

/**
 * 겉 한 벌은 globals.css 하나다 — 목업 <style> 에서 기계로 갈라낸 것(scripts/mockup-css.mjs).
 * 글꼴도 목업과 같은 하나(Noto Sans KR)다. 배색은 그리기 전에 되살린다 —
 * 뒤에 두면 첫 그림이 흰 화면으로 번쩍인다. 열쇠 이름은 목업과 같다(chloe-skin).
 */
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html:
          "try{var s=localStorage.getItem('chloe-skin');if(s)document.documentElement.dataset.skin=s}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
