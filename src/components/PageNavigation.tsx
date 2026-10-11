'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_ROUTES } from '@/shared/routes';
import { Home, ShieldCheck, Menu, X, Sparkles } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Trang chủ',
    href: APP_ROUTES.home,
    icon: Home,
    isActive: (pathname: string) => pathname === '/citizen' || pathname === '/',
  },
  {
    label: 'Quản trị',
    href: APP_ROUTES.library,
    icon: ShieldCheck,
    badge: 'Admin',
    isActive: (pathname: string) => pathname.startsWith('/admin'),
  },
];

export function PageNavigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Thương hiệu */}
          <Link
            href="/citizen"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-xl"
            id="nav-brand-logo"
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white font-black text-sm sm:text-base flex items-center justify-center shadow-md shadow-emerald-900/15 group-hover:scale-105 transition-transform duration-200">
              AFL
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg lg:text-xl font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-700 transition-colors">
                AFL Platform
              </span>
              <span className="text-[10px] sm:text-xs font-extrabold text-slate-500 uppercase tracking-wider leading-tight mt-0.5 sm:mt-1">
                Trợ lý Kê khai Một cửa
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Pills */}
          <nav aria-label="Điều hướng chức năng" className="hidden sm:flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80">
            {NAV_ITEMS.map((item) => {
              const active = item.isActive(pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    active
                      ? 'bg-white text-emerald-900 shadow-sm border border-slate-200/80 font-black'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <Icon className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-colors ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider ${
                        active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {active && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse ml-0.5" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Status Badge & Mobile Hamburger */}
          <div className="flex items-center gap-2.5">
            <div className="hidden md:inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50/80 border border-emerald-200/80 rounded-full text-xs font-bold text-emerald-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
              </span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI Trực tuyến</span>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              id="nav-mobile-toggle"
              aria-label="Mở danh mục điều hướng"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="sm:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-slate-800" /> : <Menu className="w-5 h-5 text-slate-800" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu with Smooth Transition */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-200/80 py-3 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            {NAV_ITEMS.map((item) => {
              const active = item.isActive(pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-98 ${
                    active
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/70 font-black'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider ${
                        active ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
