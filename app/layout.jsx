import "./globals.css";
import PullToRefresh from "@/components/PullToRefresh";

export const metadata = {
  title: "클로이영어 학습관리",
  description: "학생·선생님·학부모 학습관리 시스템",
  manifest: "/manifest.webmanifest",
  // 아이폰은 manifest 보다 **apple-touch-icon** 을 먼저 본다. 이게 없으면
  // 홈 화면에 화면을 찍은 그림이 들어간다.
  // 아이콘은 원장님이 설정에서 바꿀 수 있다 (0080). 그래서 고정 파일이 아니라
  // 주소를 가리킨다 — 안 올리셨으면 그 주소가 기본 그림을 내어준다.
  icons: {
    icon: [{ url: "/api/icon/favicon", sizes: "64x64", type: "image/png" }],
    apple: [{ url: "/api/icon/apple", sizes: "180x180", type: "image/png" }],
  },
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
      <body>
        {/* **당겨서 새로고침** — 홈 화면 앱에는 주소창이 없다.
            화면마다 붙이면 언젠가 한 화면을 빠뜨리고, 빠뜨린 그 화면에서
            「여기선 안 되네」 가 된다. 그래서 뿌리에 한 번만 둔다. */}
        <PullToRefresh />
        {children}
      </body>
    </html>
  );
}
