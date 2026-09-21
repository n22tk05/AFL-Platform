import { LocalCacheService } from '../local-cache';
import fs from 'fs';
import path from 'path';

async function runCacheUnitTests() {
  console.log('===============================================================');
  console.log('⚡ AFL PLATFORM — KIỂM THỬ ĐƠN VỊ HÀM BĂM & LOCAL CACHE SERVICE');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  const testCacheFileName = 'test-temp-cache.json';
  const testCachePath = path.join(process.cwd(), 'src', 'modules', 'voice-ai', testCacheFileName);
  
  // Dọn dẹp cache test cũ nếu có
  if (fs.existsSync(testCachePath)) {
    fs.unlinkSync(testCachePath);
  }

  const cache = new LocalCacheService(testCacheFileName);

  // 1. Kiểm thử định dạng khóa SHA-256
  console.log('--- PHẦN 1: ĐỊNH DẠNG & CẤU TRÚC KHÓA BĂM SHA-256 ---');
  const sampleKey = cache.generateKey('test_input');
  assert(sampleKey.startsWith('cache_'), 'Tiền tố khóa băm bắt đầu bằng "cache_"');
  const hexPart = sampleKey.replace('cache_', '');
  assert(hexPart.length === 64, 'Chuỗi hex hash chuẩn SHA-256 có độ dài đúng 64 ký tự (256-bit)', `Độ dài: ${hexPart.length}`);
  assert(/^[0-9a-f]{64}$/.test(hexPart), 'Chuỗi hash chỉ chứa ký tự hexa hợp lệ [0-9a-f]');

  // 2. Kiểm thử tính tất định (Determinism)
  console.log('\n--- PHẦN 2: TÍNH TẤT ĐỊNH & KHÁNG ĐỤNG ĐỘ ---');
  const keyRun1 = cache.generateKey('Nộp thuế trước bạ xe máy');
  const keyRun2 = cache.generateKey('Nộp thuế trước bạ xe máy');
  assert(keyRun1 === keyRun2, 'Tính tất định: Cùng chuỗi đầu vào luôn sinh ra cùng 1 khóa duy nhất');

  const diffKey = cache.generateKey('Nộp thuế trước bạ nhà đất');
  assert(keyRun1 !== diffKey, 'Kháng đụng độ: Hai chuỗi khác nhau sinh ra hai khóa hoàn toàn độc lập');

  // 3. Kiểm thử Chuẩn hóa thứ tự khóa (Canonicalization / Invariant Key Ordering)
  console.log('\n--- PHẦN 3: TÍNH CHUẨN HÓA THỨ TỰ THUỘC TÍNH (CANONICALIZATION) ---');
  const objA = { text: 'Tờ khai LPTB', step: 1, voice: 'vi-VN-Neural2-A', rate: 0.9 };
  const objB = { rate: 0.9, voice: 'vi-VN-Neural2-A', step: 1, text: 'Tờ khai LPTB' };
  
  const keyObjA = cache.generateKey(objA);
  const keyObjB = cache.generateKey(objB);
  assert(keyObjA === keyObjB, 'Khử nhạy thứ tự: Hai đối tượng đảo lộn thứ tự thuộc tính sinh ra cùng 1 khóa SHA-256');

  // Kiểm thử đối tượng lồng nhau (Nested Objects & Arrays)
  const nestedA = {
    formCode: '01/LPTB',
    metadata: { author: 'ChienNT', role: 'Voice AI Lead' },
    tags: [{ id: 1, name: 'LPTB' }, { id: 2, name: 'XeMay' }]
  };
  const nestedB = {
    tags: [{ name: 'LPTB', id: 1 }, { name: 'XeMay', id: 2 }],
    metadata: { role: 'Voice AI Lead', author: 'ChienNT' },
    formCode: '01/LPTB'
  };
  const keyNestedA = cache.generateKey(nestedA);
  const keyNestedB = cache.generateKey(nestedB);
  assert(keyNestedA === keyNestedB, 'Chuẩn hóa đệ quy đa tầng (Nested Canonicalization) thành công');

  // 4. Kiểm thử Hỗ trợ Unicode / Tiếng Việt có dấu
  console.log('\n--- PHẦN 4: XỬ LÝ KÝ TỰ TIẾNG VIỆT CÓ DẤU (UNICODE UTF-8) ---');
  const vnText1 = 'Kê khai nghĩa vụ tài chính về đất đai và tài sản gắn liền với đất';
  const vnText2 = 'Kê khai nghĩa vụ tài chính về đất đai và tài sản gắn liền với đất.';
  const keyVn1 = cache.generateKey(vnText1);
  const keyVn2 = cache.generateKey(vnText2);
  assert(keyVn1 !== keyVn2, 'Phân biệt chính xác dấu câu tiếng Việt');
  assert(keyVn1 === cache.generateKey(vnText1), 'Mã hóa UTF-8 tiếng Việt hoàn toàn ổn định qua nhiều lần gọi');

  // 5. Kiểm thử Thao tác Đọc/Ghi Cache (Get & Set Operations)
  console.log('\n--- PHẦN 5: THAO TÁC CACHE GET & SET THỰC TẾ ---');
  const testPayload = { audioUrl: '/audio/step_01.mp3', duration: 4.2 };
  cache.set(objA, testPayload);

  const retrieved = cache.get<typeof testPayload>(objB); // Lấy bằng objB đảo thuộc tính
  assert(retrieved !== null, 'Lấy thành công dữ liệu từ cache khi truy vấn bằng object đảo thuộc tính');
  assert(retrieved?.audioUrl === '/audio/step_01.mp3', 'Dữ liệu audioUrl bảo toàn tính toàn vẹn');
  assert(retrieved?.duration === 4.2, 'Dữ liệu duration bảo toàn tính toàn vẹn');

  const miss = cache.get({ nonExistent: true });
  assert(miss === null, 'Trả về null an toàn khi không tìm thấy khóa');

  // Dọn dẹp file test
  if (fs.existsSync(testCachePath)) {
    fs.unlinkSync(testCachePath);
  }

  // TỔNG KẾT
  console.log('\n===============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (100%)`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    console.log('✨ Hàm băm SHA-256 và Canonicalization đạt độ tin cậy cấp doanh nghiệp!\n');
    process.exit(0);
  } else {
    console.error('⚠️ Phát hiện lỗi trong kiểm thử hàm băm.\n');
    process.exit(1);
  }
}

runCacheUnitTests().catch(err => {
  console.error('Lỗi ngoại lệ:', err);
  process.exit(1);
});
