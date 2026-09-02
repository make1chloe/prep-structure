export const metadata = { title: "클로이영어", manifest: "/manifest.json" };

// ⚠️ `viewportFit: "cover"` 가 없으면 `env(safe-area-inset-bottom)` 이 **늘 0** 이다.
//    있어도 없는 것이 되어, 폰에서 저장 단추가 홈 인디케이터에 깔린다 (지금 앱 대응 0건).
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0D1219" },
               { media: "(prefers-color-scheme: light)", color: "#ffffff" }],
};

export default function RootLayout({ children }) {
  return <html lang="ko"><body>{children}</body></html>;
}
