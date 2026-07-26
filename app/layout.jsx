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

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
