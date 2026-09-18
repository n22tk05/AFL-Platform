import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'AFL Platform',
  description: 'Hệ thống Hỗ trợ Điền Biểu mẫu & Quản trị Quy trình',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}