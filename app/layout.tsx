import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "법원경매공고 자동 편집 시스템",
  description: "원고 업로드 → AI 편집 → 검토 → 승인 → PDF/IDML 생성",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
