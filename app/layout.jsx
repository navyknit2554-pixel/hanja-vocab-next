import "./globals.css";

export const metadata = {
  title: "초록이한자학습 v2",
  applicationName: "초록이한자학습",
  description: "테이블 구조로 다시 만든 한자 어휘 학습 프로그램",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/chologi-icon-192.png",
    apple: "/chologi-icon-192.png"
  },
  appleWebApp: {
    capable: true,
    title: "초록이한자학습",
    statusBarStyle: "default"
  }
};

export const viewport = {
  themeColor: "#58cc02"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
