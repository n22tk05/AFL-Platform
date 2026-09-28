# Quy chuẩn tổ chức dự án AFL Platform

Tài liệu này là tiêu chuẩn chung của nhóm về vị trí tệp, quyền sở hữu module và hướng phụ thuộc. Hãy cập nhật cùng thay đổi nếu cấu trúc thực tế cần ngoại lệ mới.

## 1. Cấu trúc cấp cao và quyền sở hữu

```text
AFL-Platform/
├── assets/mock-data/       # Fixture, dữ liệu mẫu dùng chung
├── docs/
│   ├── decisions/          # Quyết định kiến trúc đã duyệt
│   ├── plans/              # Kế hoạch công việc còn hiệu lực
│   ├── reports/            # Báo cáo lịch sử theo người/giai đoạn
│   ├── ARCHITECTURE.md
│   └── PROJECT-STRUCTURE.md
├── prisma/                 # Schema và migrations
├── public/                 # Tài nguyên tĩnh được phục vụ công khai
├── src/
│   ├── app/                # Next.js App Router, trang, layout, API route
│   ├── components/         # Thành phần giao diện dùng chung
│   ├── config/             # Cấu hình không chứa bí mật
│   ├── lib/                # Adapter hạ tầng cấp ứng dụng
│   ├── modules/            # Module theo miền nghiệp vụ
│   └── shared/             # Hợp đồng dữ liệu ổn định dùng nhiều miền
├── tests/integration/      # Kiểm thử xuyên module/API
├── package.json
└── tsconfig.json
```

| Vị trí | Sở hữu và nội dung | Không đặt tại đây |
| --- | --- | --- |
| `src/app` | Next.js pages, layouts, route handlers, chuyển đổi HTTP | Nghiệp vụ dài, Prisma, gọi SDK hạ tầng trực tiếp |
| `src/components` | Thành phần giao diện dùng ở nhiều màn hình | Repository, truy vấn dữ liệu hoặc chính sách nghiệp vụ |
| `src/modules/<domain>` | Use case và implementation thuộc một miền | Implementation riêng của miền khác |
| `src/shared` | Hợp đồng/type ổn định giữa UI, API và nhiều module | Nghiệp vụ, Prisma, SDK |
| `src/modules/shared` | Primitive kỹ thuật chung giữa module, ví dụ kết quả controller | Hợp đồng sản phẩm hoặc logic của một miền |
| `src/lib` | Prisma client, connection pool, adapter hạ tầng | DTO HTTP hoặc quy tắc nghiệp vụ |
| `src/config` | Cấu hình ứng dụng và feature flag | Secret hard-code hoặc truy vấn dữ liệu |
| `assets/mock-data` | Fixture JSON, dữ liệu demo đã rà soát | Dữ liệu người dùng thật, secret |
| `public` | Ảnh, font, âm thanh và tài nguyên công khai | Mã nguồn, dữ liệu riêng tư, secret |
| `tests/integration` | Kiểm thử nhiều module hoặc luồng API tích hợp | Unit/module test của riêng một miền |
| `docs/decisions`, `docs/plans`, `docs/reports` | Quyết định, kế hoạch còn hiệu lực, báo cáo lịch sử | Quy tắc cấu trúc hiện hành (đặt ở tài liệu này) |
| `prisma` | Schema Prisma và migrations | Thay đổi schema đặt rải rác trong module |

Tệp mới thuộc thư mục có chủ sở hữu rõ ràng. Không tạo thư mục cấp cao mới hoặc thư mục `utils`, `helpers`, `common`, `misc` để gom tạm; đặt mã trong miền tiêu thụ trước, chỉ nâng thành dùng chung khi có ít nhất hai consumer độc lập và có hợp đồng rõ.

## 2. Module, dependency và composition root

Module đặt tại `src/modules/<kebab-case-domain>/`. Chỉ tạo các thư mục cần thiết:

```text
domain/
├── controllers/       # DTO thuần, kết quả nghiệp vụ cho route
├── services/          # Use case và điều phối
├── repositories/      # Interface và adapter lưu trữ
├── hooks/             # Hook React phía trình duyệt (nếu có)
├── types/             # Type riêng module (nếu có)
├── tests/             # Kiểm thử module (nếu có)
├── client.ts          # Entry point an toàn cho browser (nếu có)
└── index.ts           # Composition root và public API phía server
```

Hướng phụ thuộc chuẩn:

```text
Next.js route → controller → service → repository → Prisma / cache / external API
```

- Route đọc URL/body/header, gọi controller qua public API của module, rồi ánh xạ `ControllerResult` sang status và response HTTP. Route không chứa truy vấn hay nghiệp vụ.
- Controller nhận DTO TypeScript thuần, kiểm tra/chuẩn hóa ranh giới và ánh xạ lỗi thành kết quả API; không import `NextRequest` hoặc `NextResponse`.
- Service phụ thuộc abstraction repository qua constructor injection. Composition root quyết định implementation cụ thể và tạo các dependency.
- Repository interface diễn đạt nhu cầu bằng ngôn ngữ domain; repository implementation giữ truy cập Prisma, cache, filesystem hoặc API ngoài.
- `index.ts` là composition root/barrel công khai của module server: lắp ghép dependency và export class/type/controller được phép sử dụng. Không re-export tràn lan implementation nội bộ.
- Module khác và route chỉ import từ barrel `@/modules/<domain>`. Không deep-import `services/`, `repositories/`, `controllers/` của module khác. Import nội bộ trong cùng module có thể dùng tệp trực tiếp.
- Không phụ thuộc ngược tầng, không import `src/app` vào module/shared/lib, và không tạo chu trình giữa các module. Primitive dùng chung không được phụ thuộc ngược vào domain.

## 3. Ranh giới browser/server

- Mã dùng trong browser phải có đường import chỉ gồm mã client-safe; không được kéo Prisma, `fs`, biến môi trường bí mật, repository server hoặc SDK server vào bundle.
- Module có API dùng ở cả browser và server cung cấp `client.ts` riêng với `'use client'` và chỉ export các hàm/type an toàn. Forms và Voice AI hiện dùng `src/modules/forms/client.ts` và `src/modules/voice-ai/client.ts`; component trình duyệt phải import từ entry point này thay vì barrel server `index.ts`.
- `index.ts` mặc định là API/composition root phía server, không phải entry point cho component client.
- Hook và component React nằm ở hook/module UI tương ứng và khai báo `'use client'` khi cần. Mã browser không dùng Node API.
- Secret chỉ được đọc ở server; không hard-code, lưu trong `localStorage`, hoặc đặt dưới tiền tố `NEXT_PUBLIC_`. UI quản trị chỉ giữ khóa nhập vào trong state bộ nhớ và gửi qua header `x-admin-key`.

## 4. Quy ước tên và kiểm thử

- Tên thư mục/module dùng `kebab-case` (`voice-ai`, `form-review`). Class/interface dùng `PascalCase`; biến/hàm dùng `camelCase`; hằng bất biến dùng `UPPER_SNAKE_CASE` khi phù hợp.
- Controller: `<feature>.controller.ts`; service: `<feature>.service.ts`; interface repository: `<entity>.repository.ts`; adapter: `<technology>-<entity>.repository.ts`; hook: `use-<feature>.ts[x]`.
- Giữ tên quy ước Next.js như `page.tsx`, `layout.tsx`, `route.ts`. Test script theo tính năng, ví dụ `test-<feature>.ts`.
- Unit và module test đặt cạnh module trong `src/modules/<domain>/tests/`. Kiểm thử phối hợp nhiều module/API đặt trong `tests/integration/`. Script chạy thường xuyên cần có lệnh dễ gọi trong `package.json`.
- Test phải độc lập thứ tự; ưu tiên fixture/fake xác định được. Không chạy kiểm thử có thể ghi database thật khi chưa có database dùng riêng được xác nhận.
- Fixture dùng chung đặt trong `assets/mock-data/`; không commit dữ liệu thật hoặc bí mật. Artifact sinh ra chỉ commit khi là đầu ra sản phẩm có chủ đích, đã rà soát dung lượng, giấy phép và dữ liệu nhạy cảm. Cache runtime, file tạm và output build không commit.

## 5. Routes và tài liệu

- API route đặt theo URL trong `src/app/api/`; module sở hữu controller/service/repository. Citizen guide hiện dùng `/api/forms/[formCode]/workflow` và `/api/llm/qa`.
- Route quản trị chuẩn là `/admin/library` và `/admin/review/[id]`; các đường dẫn cũ trong route group `(admin)` chuyển hướng tới route chuẩn. Thêm trang quản trị phải cập nhật liên kết đến route chuẩn và kiểm tra redirect tương ứng.
- Quyết định đã duyệt đặt trong `docs/decisions/`; kế hoạch còn hoạt động trong `docs/plans/`; báo cáo thực hiện/lịch sử trong `docs/reports/<person-or-team>/<stage>/`. Tài liệu chuẩn dùng lâu dài đặt tại `docs/`, không chôn trong báo cáo cá nhân.
- Dùng liên kết tương đối từ tài liệu; sửa đường dẫn khi di chuyển tệp và xóa kế hoạch tạm sau khi công việc kết thúc nếu quy trình yêu cầu.

## 6. Checklist thêm module hoặc route

1. Xác định domain sở hữu, public contract và liệu có cần module mới hay dùng module hiện hữu.
2. Đặt route trong `src/app` và logic theo lớp trong module; chỉ tạo thư mục module cần dùng.
3. Khai báo dependency qua constructor và lắp ghép ở `index.ts`; export API tối thiểu.
4. Nếu browser cần gọi module, tạo hoặc dùng `client.ts`; rà soát transitive imports để giữ server code ngoài bundle.
5. Chọn vị trí test: module test cạnh module, tích hợp tại `tests/integration`; thêm fixture an toàn nếu cần.
6. Cập nhật tài liệu kiến trúc/quyết định khi thay đổi ranh giới hoặc ngoại lệ.
7. Với route quản trị, kiểm tra auth/header, envelope, mã lỗi và liên kết từ UI; không báo thành công giả.

## 7. Checklist pull request

- [ ] Tệp mới đúng vị trí, domain có chủ sở hữu và không tạo catch-all folder.
- [ ] Dependency đi một chiều, không deep-import implementation module khác, không có chu trình.
- [ ] Route chỉ chuyển đổi HTTP; service/repository chịu trách nhiệm đúng tầng.
- [ ] Composition root export tối thiểu; browser chỉ dùng `client.ts` an toàn.
- [ ] Không làm lộ/persist secret hoặc kéo SDK server vào browser.
- [ ] Test và fixture đặt đúng cấp; script `package.json` cập nhật khi cần.
- [ ] API giữ đúng auth, envelope và status; route admin canonical được dùng.
- [ ] Không có dữ liệu thật, secret, cache runtime hoặc artifact tạm ngoài chủ đích.
- [ ] Tài liệu và liên kết còn hợp lệ; thay đổi quy tắc có cập nhật tài liệu này.
- [ ] Ghi rõ tác động Prisma/Supabase/dữ liệu và các giới hạn kiểm thử liên quan.
