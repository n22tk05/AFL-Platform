# Quy tắc tổ chức thư mục — AFL Platform

Tài liệu này là quy chuẩn chung về vị trí file, ranh giới module và hướng phụ thuộc trong AFL Platform. Mọi thành viên phải đối chiếu tài liệu này trước khi tạo thư mục, thêm module hoặc di chuyển mã nguồn.

## 1. Nguồn tham chiếu

- File này quy định **mã nguồn phải được đặt ở đâu và được phép phụ thuộc vào đâu**.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) mô tả kiến trúc hệ thống và các quyết định kỹ thuật cấp cao.
- [`src/shared/contracts.ts`](../src/shared/contracts.ts) là hợp đồng dữ liệu dùng chung giữa các phân hệ.
- [`prisma/schema.prisma`](../prisma/schema.prisma) là nguồn sự thật của mô hình dữ liệu PostgreSQL.
- `docs/reports/` lưu báo cáo theo từng giai đoạn; các báo cáo này có tính lịch sử và không thay thế quy chuẩn hiện tại.

Nếu tài liệu lịch sử chứa đường dẫn cũ, cấu trúc thực tế và quy tắc trong file này được ưu tiên.

## 2. Cấu trúc cấp cao

```text
AFL-Platform/
├── assets/
│   └── mock-data/              # Dữ liệu mẫu và fixture dùng chung
├── docs/
│   ├── reports/                # Báo cáo tiến độ theo thành viên/giai đoạn
│   └── PROJECT-STRUCTURE.md    # Quy chuẩn tổ chức thư mục
├── prisma/
│   └── schema.prisma           # Schema Prisma; migration đặt cùng cây prisma
├── public/                     # Tài nguyên tĩnh được phục vụ trực tiếp
├── src/
│   ├── app/                    # Next.js App Router, page, layout và API route
│   ├── config/                 # Cấu hình ứng dụng không chứa nghiệp vụ
│   ├── lib/                    # Hạ tầng dùng chung và adapter cấp ứng dụng
│   ├── modules/                # Các module nghiệp vụ theo domain
│   └── shared/                 # Hợp đồng domain dùng toàn ứng dụng
├── tests/
│   └── integration/            # Kiểm thử xuyên module
├── package.json                # Dependencies và lệnh chạy chuẩn
└── tsconfig.json               # Alias TypeScript, gồm @/* → src/*
```

### Trách nhiệm từng vùng

| Vùng | Được chứa | Không được chứa |
| --- | --- | --- |
| `src/app` | Page, layout, HTTP route và chuyển đổi request/response | Truy vấn Prisma, gọi SDK trực tiếp, nghiệp vụ dài |
| `src/modules/<domain>` | Controller, service, repository, hook, type và test của một domain | Mã không liên quan domain hoặc implementation của module khác |
| `src/shared` | Hợp đồng domain ổn định dùng bởi UI, API và nhiều module | Logic nghiệp vụ, Prisma hoặc SDK |
| `src/modules/shared` | Primitive kỹ thuật chỉ dùng chung giữa các module, ví dụ `ControllerResult` | Hợp đồng sản phẩm hoặc logic của một domain cụ thể |
| `src/lib` | Prisma client, connection pool và adapter hạ tầng cấp ứng dụng | Quy tắc nghiệp vụ hoặc DTO HTTP |
| `src/config` | Cấu hình ứng dụng, feature flag và ánh xạ cấu hình | Secret hard-code hoặc truy vấn dữ liệu |
| `assets/mock-data` | JSON fixture và dữ liệu mẫu dùng chung | Dữ liệu người dùng thật hoặc secret |
| `public` | Ảnh, font, audio và tài nguyên public | Mã TypeScript, secret hoặc dữ liệu riêng tư |
| `tests/integration` | Test luồng xuyên module/API | Unit test chỉ thuộc một module |
| `docs/reports` | Báo cáo, biên bản và kết quả từng giai đoạn | Quy chuẩn kiến trúc đang có hiệu lực |

## 3. Mẫu bắt buộc cho một module

Mỗi domain độc lập nằm tại `src/modules/<module-name>/` và dùng cấu trúc sau:

```text
module-name/
├── controllers/               # DTO thuần → ControllerResult
├── services/                  # Nghiệp vụ và điều phối use case
├── repositories/              # Interface và implementation truy cập dữ liệu
├── hooks/                     # Tùy chọn: hook React/client
├── types/                     # DTO và type nội bộ của module
├── tests/                     # Unit/module test bằng tsx
├── README.md                  # Tùy chọn: hướng dẫn riêng khi module phức tạp
└── index.ts                   # Composition root và public API duy nhất
```

Không tạo thư mục rỗng. Chỉ thêm `hooks`, `types`, `tests` hoặc `README.md` khi module thực sự cần.

### Vai trò của từng lớp

1. **Route** đọc URL, body và header; gọi controller; chuyển `ControllerResult` thành HTTP response.
2. **Controller** nhận DTO TypeScript thuần, validate đầu vào và ánh xạ lỗi nghiệp vụ thành kết quả API; không import `NextRequest` hoặc `NextResponse`.
3. **Service** chứa nghiệp vụ, fallback và điều phối repository; dependency được truyền qua constructor.
4. **Repository interface** mô tả nhu cầu lưu trữ bằng thuật ngữ domain, không mang tên Prisma, Supabase hoặc filesystem.
5. **Repository implementation** chứa truy vấn Prisma, filesystem, cache hoặc API hạ tầng tương ứng.
6. **`index.ts`** khởi tạo dependency, export singleton/class/type được phép dùng từ bên ngoài module.

## 4. Hướng phụ thuộc

Luồng chuẩn:

```text
Next.js route → controller → service → repository → Prisma/cache/external API
```

Quy tắc bắt buộc:

- Không phụ thuộc ngược chiều và không tạo dependency vòng.
- Route chỉ import public API từ `@/modules/<module>`.
- Module khác chỉ import qua barrel `@/modules/<module>`, không deep-import file implementation.
- File bên trong cùng một module được phép dùng alias tới các lớp nội bộ để thể hiện dependency rõ ràng.
- Service phụ thuộc repository interface; composition root quyết định implementation cụ thể.
- Repository Prisma chỉ truy cập Prisma thông qua hạ tầng trong `src/lib`.
- `src/modules/shared` không được import ngược một domain cụ thể.
- Không import từ `src/app` vào `src/modules`, `src/shared` hoặc `src/lib`.

Ví dụ:

```ts
// Đúng: route dùng public API của module
import { ttsController } from '@/modules/voice-ai';

// Sai: route phụ thuộc implementation nội bộ
import { TTSService } from '@/modules/voice-ai/services/tts.service';
```

### Ranh giới client/server

- Hook React phải nằm trong `hooks/`, có `'use client'` khi cần và không import Prisma, `fs`, secret hoặc repository phía server.
- Service chạy trên trình duyệt phải tránh Node.js API và được đặt tên/phân tách rõ với service server.
- Secret chỉ được đọc ở server; không dùng tiền tố `NEXT_PUBLIC_` cho secret.
- Không export implementation server vào component client nếu việc đó khiến Next.js đưa dependency server vào client bundle.

## 5. Quy tắc đặt tên

- Thư mục và tên module dùng `kebab-case`: `voice-ai`, `form-review`.
- Controller: `<feature>.controller.ts`.
- Service: `<feature>.service.ts`.
- Repository interface: `<entity>.repository.ts`.
- Repository implementation: `<technology>-<entity>.repository.ts`, ví dụ `prisma-form.repository.ts`.
- Type nội bộ: `<module>.types.ts` hoặc `<feature>.types.ts`.
- Hook: `use-<feature>.ts` hoặc `use-<feature>.tsx`.
- Test script: `test-<feature>.ts`; script tạo dữ liệu dùng động từ rõ ràng như `generate-full-audio.ts`.
- File đặc biệt của Next.js giữ đúng tên quy ước: `page.tsx`, `layout.tsx`, `route.ts`.
- Class/interface dùng `PascalCase`; biến, hàm và singleton dùng `camelCase`; hằng số dùng `UPPER_SNAKE_CASE` khi thực sự bất biến.

## 6. Quyết định đặt file mới

| Nhu cầu | Vị trí chuẩn |
| --- | --- |
| Thêm API endpoint | `src/app/api/<endpoint>/route.ts` và controller trong module sở hữu nghiệp vụ |
| Thêm use case nghiệp vụ | `src/modules/<domain>/services/` |
| Thêm truy vấn database | `src/modules/<domain>/repositories/` |
| Thêm DTO/type chỉ một module dùng | `src/modules/<domain>/types/` |
| Thêm hợp đồng nhiều phân hệ cùng dùng | `src/shared/` |
| Thêm primitive kỹ thuật cho nhiều module | `src/modules/shared/` |
| Thêm hook React | `src/modules/<domain>/hooks/` hoặc vùng UI sở hữu hook |
| Thêm unit/module test | `src/modules/<domain>/tests/` |
| Thêm test xuyên nhiều module | `tests/integration/` |
| Thêm mock/fixture dùng chung | `assets/mock-data/` |
| Thêm ảnh, font hoặc audio public | `public/` |
| Thêm schema/migration | `prisma/` |
| Thêm báo cáo tiến độ cá nhân | `docs/reports/person-<n>-<role>/` |

Không tạo thư mục `utils`, `helpers`, `common` hoặc `misc` nếu chưa xác định rõ chủ sở hữu và trách nhiệm. Ưu tiên đặt code trong domain sử dụng nó; chỉ nâng lên vùng dùng chung khi có ít nhất hai consumer độc lập.

## 7. Kiểm thử và dữ liệu sinh ra

- Unit/module test nằm cạnh module; integration test nằm ở `tests/integration`.
- Script test chạy độc lập bằng `tsx` phải có lệnh tương ứng trong `package.json` nếu cả nhóm cần sử dụng thường xuyên.
- Test không được phụ thuộc thứ tự chạy và phải hỗ trợ database/API offline khi nghiệp vụ có fallback.
- Không commit secret, dữ liệu người dùng thật, cache runtime hoặc file tạm.
- File sinh ra phục vụ public demo chỉ được commit khi là artifact chủ ý và đã được review về dung lượng, bản quyền và dữ liệu nhạy cảm.

## 8. Checklist khi tạo Pull Request

- [ ] File mới nằm đúng domain và đúng lớp.
- [ ] Dependency tuân theo luồng một chiều, không có import vòng.
- [ ] Public API mới đã được export qua `index.ts` của module.
- [ ] Route không chứa nghiệp vụ hoặc truy vấn Prisma.
- [ ] Client code không kéo dependency server vào bundle.
- [ ] Type dùng chung được đặt đúng giữa `src/shared` và `src/modules/shared`.
- [ ] Test được đặt đúng cấp và script trong `package.json` đã được cập nhật nếu cần.
- [ ] Không có secret, cache, file tạm hoặc dữ liệu thật trong commit.
- [ ] Đường dẫn trong tài liệu và README còn hợp lệ.
- [ ] Nếu cần ngoại lệ kiến trúc, PR phải giải thích lý do và cập nhật tài liệu này trong cùng thay đổi.

## 9. Ví dụ module hiện tại

- `src/modules/forms`: controller biểu mẫu, service persistence/authorization và Prisma form repository.
- `src/modules/voice-ai`: prompt, TTS, STT, Voice QA, hook client và voice-cache repository.
- `src/modules/cache`: cache service cùng file-cache repository dùng chung.

Các module mới phải bám cùng ranh giới lớp; không sao chép nguyên cấu trúc nếu một lớp không cần thiết.
