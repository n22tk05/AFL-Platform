# BÁO CÁO KỸ THUẬT: NÂNG CẤP HÀM BĂM TẠO KHÓA CACHE SANG CHUẨN SHA-256 & CANONICALIZATION

> **Người thực hiện:** Nguyễn Thanh Chiến (Người 4 — Voice AI & QA Lead)  
> **Module liên quan:** `src/modules/voice-ai/local-cache.ts`  
> **Kiểm thử liên quan:** `src/modules/voice-ai/tests/test-cache.ts` (`npm run test:cache`)  
> **Cơ sở dữ liệu tương ứng:** Bảng `voice_cache` trong [`prisma/schema.prisma`](../../../../prisma/schema.prisma#L203-L214)  
> **Ngày hoàn thành:** 20/09/2026  

---

## 1. BỐI CẢNH & NGUYÊN NHÂN NÂNG CẤP (ROOT CAUSE)

Trong thiết kế ban đầu của `LocalCacheService` (`local-cache.ts`), hàm băm `generateKey` được cài đặt theo giải thuật xoay bit đa thức 32-bit (biến thể `djb2` / Java `hashCode`):

```typescript
// Triển khai cũ trước khi nâng cấp
private generateKey(input: any): string {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input);
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `key_${Math.abs(hash)}`;
}
```

### Các rủi ro chí mạng của giải thuật cũ:
1. **Rủi ro đụng độ mã băm (Hash Collision) cực cao**:
   - Không gian băm 32-bit chỉ có tối đa $2^{32} \approx 4.29 \times 10^9$ giá trị khả dĩ.
   - Do sử dụng `Math.abs(hash)`, miền giá trị bị thu hẹp một nửa còn $2^{31} \approx 2.14 \times 10^9$.
   - Theo Định lý Nghịch lý Sinh nhật (Birthday Paradox), xác suất xảy ra ít nhất 1 vụ đụng độ vượt quá 50% chỉ sau $\approx 77.000$ mục cache. Khi xảy ra đụng độ, câu hỏi/văn bản này sẽ trả về file âm thanh hoặc kịch bản của câu hỏi khác.
2. **Nhạy cảm với thứ tự thuộc tính trong Object (Non-deterministic Key Ordering)**:
   - Sử dụng `JSON.stringify(input)` trực tiếp. Hai đối tượng có cùng dữ liệu nhưng thứ tự thuộc tính khác nhau (`{ a: 1, b: 2 }` và `{ b: 2, a: 1 }`) sẽ sinh ra 2 chuỗi khác nhau, làm mất tác dụng của cache (cache miss giả).
3. **Lệch pha với CSDL quan hệ Prisma PostgreSQL**:
   - Trong [`prisma/schema.prisma`](../../../../prisma/schema.prisma#L205), model `VoiceCache` do Tech Lead thiết kế có trường:
     ```prisma
     model VoiceCache {
       id        String   @id @default(cuid())
       cacheKey  String   @unique // Hash SHA-256 từ nội dung văn bản + cấu hình giọng
       ...
     }
     ```
   - Định dạng cũ `key_<int32>` hoàn toàn không tương thích với kiến trúc lưu trữ lâu dài trên CSDL.

---

## 2. GIẢI PHÁP KỸ THUẬT TRIỂN KHAI

### 2.1. Chuẩn hóa đệ quy đối tượng (Canonicalization)
Thêm hàm đệ quy `canonicalize(val)` để duyệt qua mảng và sắp xếp tất cả các thuộc tính của object theo bảng chữ cái ($A \to Z$). Đảm bảo bất kể đối tượng được khởi tạo theo thứ tự nào, chuỗi tuần tự hóa (serialization) đầu ra luôn duy nhất và đồng nhất.

### 2.2. Nâng cấp hàm băm sang SHA-256 (256-bit Cryptographic Hash)
Sử dụng module chuẩn `crypto.createHash('sha256')` của Node.js:
- Không gian khóa lên tới $2^{256} \approx 1.15 \times 10^{77}$ giá trị, loại bỏ 100% rủi ro đụng độ.
- Mã hóa `utf-8` Buffer nguyên bản, bảo toàn tuyệt đối các ký tự tiếng Việt có dấu.
- Định dạng khóa chuẩn hóa: `cache_<64_hex_chars>`, tương thích hoàn toàn với trường `cacheKey` của Prisma.

```typescript
// Triển khai mới trong local-cache.ts
private canonicalize(val: any): any {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => this.canonicalize(item));
  }
  const sortedKeys = Object.keys(val).sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    result[k] = this.canonicalize(val[k]);
  }
  return result;
}

public generateKey(input: any): string {
  const canonicalData = this.canonicalize(input);
  const serialized = typeof canonicalData === 'string' ? canonicalData : JSON.stringify(canonicalData);
  const hash = crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
  return `cache_${hash}`;
}
```

---

## 3. BẰNG CHỨNG KIỂM THỬ (VERIFICATION EVIDENCE)

Đã xây dựng bộ kiểm thử đơn vị tại [`src/modules/voice-ai/tests/test-cache.ts`](../../../../src/modules/voice-ai/tests/test-cache.ts) bao phủ 5 phần:

1. **Định dạng cấu trúc:** Khóa bắt đầu bằng `cache_`, phần hex đúng 64 ký tự `[0-9a-f]`.
2. **Tính tất định & Kháng đụng độ:** Cùng đầu vào sinh cùng khóa; đầu vào khác nhau sinh khóa độc lập.
3. **Chuẩn hóa đối tượng (Canonicalization):** Object phẳng và lồng nhau đa tầng đảo thứ tự key đều sinh ra khóa SHA-256 giống hệt nhau.
4. **Hỗ trợ tiếng Việt Unicode:** Xử lý chính xác các câu tiếng Việt có dấu và dấu câu hành chính.
5. **Thao tác Get/Set thực tế:** Ghi bằng object $A$ và đọc bằng object $B$ (đảo key) thành công 100%.

```text
===============================================================
⚡ AFL PLATFORM — KIỂM THỬ ĐƠN VỊ HÀM BĂM & LOCAL CACHE SERVICE
===============================================================
--- PHẦN 1: ĐỊNH DẠNG & CẤU TRÚC KHÓA BĂM SHA-256 ---
  ✅ [PASS] Tiền tố khóa băm bắt đầu bằng "cache_"
  ✅ [PASS] Chuỗi hex hash chuẩn SHA-256 có độ dài đúng 64 ký tự (256-bit)
  ✅ [PASS] Chuỗi hash chỉ chứa ký tự hexa hợp lệ [0-9a-f]

--- PHẦN 2: TÍNH TẤT ĐỊNH & KHÁNG ĐỤNG ĐỘ ---
  ✅ [PASS] Tính tất định: Cùng chuỗi đầu vào luôn sinh ra cùng 1 khóa duy nhất
  ✅ [PASS] Kháng đụng độ: Hai chuỗi khác nhau sinh ra hai khóa hoàn toàn độc lập

--- PHẦN 3: TÍNH CHUẨN HÓA THỨ TỰ THUỘC TÍNH (CANONICALIZATION) ---
  ✅ [PASS] Khử nhạy thứ tự: Hai đối tượng đảo lộn thứ tự thuộc tính sinh ra cùng 1 khóa SHA-256
  ✅ [PASS] Chuẩn hóa đệ quy đa tầng (Nested Canonicalization) thành công

--- PHẦN 4: XỬ LÝ KÝ TỰ TIẾNG VIỆT CÓ DẤU (UNICODE UTF-8) ---
  ✅ [PASS] Phân biệt chính xác dấu câu tiếng Việt
  ✅ [PASS] Mã hóa UTF-8 tiếng Việt hoàn toàn ổn định qua nhiều lần gọi

--- PHẦN 5: THAO TÁC CACHE GET & SET THỰC TẾ ---
  ✅ [PASS] Lấy thành công dữ liệu từ cache khi truy vấn bằng object đảo thuộc tính
  ✅ [PASS] Dữ liệu audioUrl bảo toàn tính toàn vẹn
  ✅ [PASS] Dữ liệu duration bảo toàn tính toàn vẹn
  ✅ [PASS] Trả về null an toàn khi không tìm thấy khóa

===============================================================
🏁 KẾT QUẢ KIỂM THỬ: 13/13 TESTS ĐẠT CHUẨN (100%)
===============================================================
```

---

## 4. HƯỚNG DẪN DÀNH CHO TECH LEAD & TEAM

- Chạy kiểm thử cache độc lập: `npm run test:cache`
- Chạy kiểm thử tích hợp Voice AI: `npm run test:voice`
- Biến môi trường: Có thể tắt cache nếu cần bằng `VOICE_CACHE_ENABLED=false` trong `.env`.
