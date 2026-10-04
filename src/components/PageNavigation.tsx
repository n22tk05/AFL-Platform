'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_ROUTES } from '@/shared/routes';

const pages = [
  ['Trang chủ', APP_ROUTES.home], ['Chọn biểu mẫu', APP_ROUTES.scan],
  ['Đọc chứng từ', APP_ROUTES.scanDocument], ['Thư viện', APP_ROUTES.library],
  ['Quản trị', APP_ROUTES.admin], ['Bàn kiểm thử', APP_ROUTES.documentTest],
  ['Kiểm thử OpenCV', APP_ROUTES.opencvTest],
] as const;

export function PageNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Điều hướng chức năng" className="flex flex-wrap gap-2 border-b border-slate-300 bg-white px-4 py-3 text-slate-900">
    {pages.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
      className={`rounded-lg px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 ${pathname === href ? 'bg-sky-100 text-sky-900' : 'hover:bg-slate-100'}`}>{label}</Link>)}
  </nav>;
}
