import Link from "next/link";
import { Smartphone, ShieldCheck, Sparkles, BookOpen, ArrowRight } from "lucide-react";
import { APP_ROUTES } from '@/shared/routes';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-6 flex flex-col relative overflow-hidden">
        {/* Nút Cổng Quản trị viên ở góc trên */}
        <div className="flex justify-end mb-2">
          <Link
            href={APP_ROUTES.library}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-sm transition-all active:scale-95"
            title="Truy cập Cổng Quản trị & Thư viện Biểu mẫu"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cổng Quản Trị Viên</span>
          </Link>
        </div>

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

        {/* Danh sách lối vào phân hệ */}
        <div className="space-y-4 mb-6">
          {/* Lối vào dành cho Người dân */}
          <Link
            href="/citizen"
            className="w-full min-h-touch-lg p-5 bg-afl-green hover:bg-emerald-800 text-white font-black text-xl rounded-2xl flex items-center justify-between shadow-xl active:scale-95 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-md">
                <Smartphone className="w-7 h-7" />
              </div>
              <div className="text-left">
                <div className="font-black text-lg text-white">BẮT ĐẦU SỬ DỤNG</div>
                <div className="text-xs text-emerald-100 font-medium">
                  Dành cho người dân: Chụp ảnh hoặc chọn biểu mẫu
                </div>
              </div>
            </div>
            <ArrowRight className="w-6 h-6 text-white group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/scan-document"
            className="w-full p-4 bg-sky-50 hover:bg-sky-100 border-2 border-sky-300 rounded-2xl flex items-center justify-between text-sky-950 transition-all"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8" aria-hidden="true" />
              <div className="text-left">
                <div className="font-bold text-base">Chuyển ảnh thành Markdown</div>
                <div className="text-xs">OpenCV → VietOCR cục bộ → Ghép Markdown → Duyệt → .md</div>
              </div>
            </div>
          </Link>

          {/* Lối vào Bàn làm việc Kiểm thử */}
          <Link
            href="/document-test"
            className="w-full p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-400 rounded-2xl flex items-center justify-between text-amber-950 transition-all group shadow-sm active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="text-left">
                <div className="font-bold text-base">Bàn Làm Việc Kiểm Thử (Workbench)</div>
                <div className="text-xs text-amber-800 font-medium">
                  Soi Bounding Box, test trích xuất JSON & Markdown
                </div>
              </div>
            </div>
          </Link>

          {/* Lối vào dành cho Cán bộ Quản trị */}
          <Link
            href={APP_ROUTES.library}
            className="w-full p-4 bg-slate-50 hover:bg-slate-100 border-2 border-slate-300 rounded-2xl flex items-center justify-between text-slate-800 transition-all group shadow-sm active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-md">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-left">
                <div className="font-bold text-base text-slate-900">Cổng Quản Trị Viên</div>
                <div className="text-xs text-slate-500 font-medium">
                  Thư viện biểu mẫu & đối soát Bounding Box (FR-9)
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
          AFL Platform • Giải pháp Chuyển đổi số Phục vụ Người cao tuổi
        </div>
      </div>
    </div>
  );
}
