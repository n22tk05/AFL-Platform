import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PageNavigation } from '@/components/PageNavigation';

export const metadata: Metadata = {
  title: "AFL Platform - Trợ lý Điền Biểu mẫu Cho Người Cao Tuổi",
  description: "Hệ thống hỗ trợ điền biểu mẫu hành chính thông minh bằng AI cho người cao tuổi tại Việt Nam",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen"><PageNavigation />{children}</body>
    </html>
  );
}
