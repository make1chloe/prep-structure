import "./globals.css";
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys } from "@/lib/supabase-server";
import Shell from "./_nav/shell.js";

export const metadata = { title: "클로이영어", manifest: "/manifest.json" };

// ⚠️ `viewportFit: "cover"` 가 없으면 `env(safe-area-inset-bottom)` 이 **늘 0** 이다.
//    있어도 없는 것이 되어, 폰에서 저장 단추가 홈 인디케이터에 깔린다 (지금 앱 대응 0건).
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0D1219" },
               { media: "(prefers-color-scheme: light)", color: "#ffffff" }],
};

/**
 * ⚠️⚠️ **메뉴는 여기서 한 번만 그린다** (0-10).
 *    화면마다 붙이면 새 화면을 만든 날 그 화면만 메뉴가 없다 — 실제로 그랬다:
 *    `<Nav>` 를 부르는 곳이 **0곳**이라 대시보드에서 밖으로 나가는 링크가 하나도 없었고
 *    `/today`·`/schedule` 은 들어가면 못 나왔다(2026-09-02 전수 훑기).
 *
 * ⚠️ 역할을 **여기서 읽는다.** 짐작하지 않는다 — 모르면 `menuFor` 가 빈 목록을 주고
 *    `Nav` 가 아무것도 안 그린다(`/login` 이 그 경우다).
 * ⚠️ 읽다 터져도 **화면을 죽이지 않는다.** 메뉴는 곁가지다 — 없으면 없는 대로 그린다.
 */
async function 역할() {
  try {
    if (!keys().ok) return null;
    const me = await roleOf(serverClientFromStore(await cookies()));
    return me?.role ?? null;
  } catch { return null; }
}

export default async function RootLayout({ children }) {
  const role = await 역할();
  return (
    <html lang="ko">
      <head>
        {/* ⚠️ 배색을 **그리기 전에** 되살린다. 뒤에 두면 첫 그림이 흰 화면으로 번쩍인다 */}
        <script dangerouslySetInnerHTML={{ __html:
          "try{var s=localStorage.getItem('skin');if(s)document.documentElement.dataset.skin=s}catch(e){}" }} />
      </head>
      <body><Shell role={role}>{children}</Shell></body>
    </html>
  );
}
