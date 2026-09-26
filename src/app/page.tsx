import Link from "next/link";
import { Smartphone, LayoutDashboard, QrCode, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-6 flex flex-col">
        {/* Header giới thiệu */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-afl-green text-white rounded-2xl font-black text-2xl shadow-lg shadow-green-700/30 mb-3">
            AFL
          </div>
          <h1 className="text-2xl font-black text-slate-900">AFL Platform</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Trợ lý Thông minh Hỗ trợ Người cao tuổi Điền Biểu mẫu
          </p>
        </div>

        {/* Nút lớn vào ngay màn hình quét và chọn biểu mẫu */}
        <div className="space-y-4 mb-6">
          <Link className="w-full p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-afl-green rounded-2xl flex items-center justify-between text-emerald-950 transition-all group shadow-sm active:scale-98" href="/scan">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-afl-green text-white flex items-center justify-center shadow-md">
                <Smartphone className="w-7 h-7" />
              </div>
              <div className="text-left">
                <div className="font-black text-lg text-emerald-950">Bắt Đầu Sử Dụng</div>
                <div className="text-xs text-emerald-700 font-bold">Chụp ảnh hoặc chọn biểu mẫu có sẵn</div>
              </div>
            </div>
            <Sparkles className="w-6 h-6 text-afl-green group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link className="w-full p-4 bg-slate-50 hover:bg-slate-100 border-2 border-slate-300 rounded-2xl flex items-center justify-between text-slate-800 transition-all group shadow-sm active:scale-98" href="/admin/library">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-700 text-white flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="font-bold text-base text-slate-900">Cổng Quản Trị Viên</div>
                <div className="text-xs text-slate-500 font-medium">Dành cho Chuyên viên Một cửa</div>
              </div>
            </div>
            <QrCode className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
          AFL Prototype • WCAG 2.1 AAA Compliant
        </div>
      </div>
    </div>
  );
}
