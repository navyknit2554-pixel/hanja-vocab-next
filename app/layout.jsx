import "./globals.css";

export const metadata = {
  title: "한자 어휘 학습",
  description: "초등학생 한자 어휘 학습 프로그램"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
