import { Suspense } from "react";
import "./globals.css";
import PullToRefresh from "@/components/PullToRefresh";
import TopBar from "@/components/TopBar";

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
        {/**
          * **위 메뉴도 뿌리에 한 번** (성능수리 3차 — 당겨서 새로고침과 같은
          * 까닭에, 같은 자리에).
          *
          * 서른 화면이 저마다 `<TopBar>` 를 그리고 있었다. 배지를 세느라
          * 조회가 스물두 자리인데, 가벼운 화면일수록 비중이 압도적이었다
          * (반·학생 배정은 스물여덟 중 스물두 개 — 79%).
          *
          * 여기 두면 **화면을 옮겨도 다시 안 그려진다** (실측: Next 16.3.3,
          * 소프트 이동 시 layout 재렌더 0회). 오늘 ↔ 재원생 ↔ 달력을 오가는
          * 수업 중 동선에서 스물두 자리가 통째로 빠진다.
          *
          * 이 자리에서 `await` 를 하면 안 된다 — 레이아웃 함수 본문이 기다리면
          * 아래 화면 렌더가 그만큼 뒤로 밀린다. TopBar 는 제 안에서 기다리는
          * 별개의 조각이라 화면과 **나란히** 돈다 (실측: 0.5초+0.5초 → 0.51초).
          *
          * 학생·학부모 계정에는 아무것도 안 그린다(TopBar 안에서 가른다).
          * 원장님이 미리보기로 여신 /me · /parent 같은 곳도 안 붙는다
          * (TopBarGate — lib/roles 의 「누구나 열 수 있는 곳」 목록 그대로).
          */}
        {/**
          * **메뉴를 기다리느라 화면이 안 뜨면 안 된다** (성능수리 3차).
          *
          * 메뉴가 화면 안에 있을 때는 loading.jsx 가 곧바로 「불러오는 중…」 을
          * 내보냈다 — 그 틀은 레이아웃 **아래**에 있기 때문이다. 메뉴를 뿌리로
          * 올리자 그 틀이 메뉴 **밑**으로 들어갔고, 배지를 다 셀 때까지
          * 첫 글자 한 자도 안 나가게 됐다.
          *
          * 실측 (같은 조건, 메뉴 조회 0.6초 흉내):
          *   Suspense 없음  첫 바이트 0.611초 — 0.3초 안에 아무것도 안 옴
          *   Suspense 있음  첫 바이트 0.008초 — 0.3초 안에 「불러오는 중」 이 뜸
          *   총 시간은 둘 다 0.81초 (늦게 오는 것을 먼저 보여줄 뿐, 셈은 그대로)
          *
          * 기다리는 자리는 **비워 둔다.** 메뉴는 띄워둔 것이고(.topbar 는
          * position:fixed) 그 자리는 body 의 padding-top 이 이미 잡아두고 있다
          * (globals.css — `var(--topbar-full, 120px)`). 여기에 빈 상자를 또
          * 그리면 그만큼 **한 번 더** 내려가서, 메뉴가 도착할 때 위로 튄다.
          * 학생·학부모 화면처럼 메뉴가 아예 없는 곳에서는 회색 띠가 한 번
          * 번쩍이고 사라지기도 한다.
          */}
        <Suspense fallback={null}>
          <TopBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
