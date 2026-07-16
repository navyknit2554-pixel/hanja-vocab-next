import "./globals.css";

export const metadata = {
  title: "초록이한자학습",
  applicationName: "초록이한자학습",
  description: "초록이와 함께하는 한자 어휘 학습",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/chologi-icon.svg",
    apple: "/chologi-icon.svg"
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
