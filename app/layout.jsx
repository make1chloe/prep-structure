import "./globals.css";

export const metadata = {
  title: "클로이영어 학습관리",
  description: "학생·선생님·학부모 학습관리 시스템",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "클로이영어", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#00175c",
  width: "device-width",
  initialScale: 1,
};

/**
 * 고른 테마를 **그림이 그려지기 전에** 붙인다.
 *
 * 화면이 뜬 다음에 자바스크립트로 바꾸면, 다크로 해두셨어도 흰 화면이 한 번
 * 번쩍이고 어두워진다. 그래서 <head> 에서 먼저 도는 짧은 글로 미리 붙여둔다.
 *
 * 고른 것은 이 브라우저에 남는다 — 계정 설정이 아니라 **화면 습관**이라,
 * 폰과 학원 컴퓨터가 서로 달라도 된다.
 */
const THEME_SCRIPT = `(function(){try{
  var t = localStorage.getItem('chloe.theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
