import "./globals.css";

export const metadata = {
  title: "클로이영어 학습관리",
  description: "학생·선생님·학부모 학습관리 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
