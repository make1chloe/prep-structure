import "./globals.css";
import Shell from "./_shell/shell.js";
import { whoami } from "@/lib/session";
import { db } from "@/lib/supabase";

export const metadata = { title: "클로이영어" };

// ⚠️ viewportFit cover 가 없으면 env(safe-area-inset-bottom) 이 늘 0 이다 — 폰에서 저장 단추가 홈 표시줄에 깔린다(옛 앱 실측). themeColor 는 토큰 --ground 와 같다.
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0F1117" }, { media: "(prefers-color-scheme: light)", color: "#F6F7F9" }],
};

/** 껍질은 여기서 한 번만 그린다(0-10). 역할과 권한 줄은 여기서 한 번 읽는다 — 화면마다 겹쳐 읽지 않는다.
 *  읽다 터져도 화면을 죽이지 않는다 — 껍질은 곁가지다. 겉 한 벌은 globals.css(목업에서 갈라낸 것), 글꼴 하나, 배색은 그리기 전에 되살린다(chloe-skin). */
async function 누구() {
  try {
    const w = await whoami();
    if (!w.me) return { me: null, rows: [] };
    const needRows = w.me.role !== "principal" && w.me.role !== "student" && w.me.role !== "parent";   // 원장은 안 묻고, 아이·학부모는 제 화면이 따로 읽는다
    const rows = needRows ? (await db(w.sb).from("role_access").select("role,key,allowed").eq("role", w.me.role)).data ?? [] : [];
    return { me: w.me, rows };
  } catch { return { me: null, rows: [] }; }
}

export default async function RootLayout({ children }) {
  const { me, rows } = await 누구();
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: "try{var s=localStorage.getItem('chloe-skin');if(s)document.documentElement.dataset.skin=s}catch(e){}" }} />
      </head>
      <body><Shell me={me} rows={rows}>{children}</Shell></body>
    </html>
  );
}
