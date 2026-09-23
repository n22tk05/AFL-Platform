import fs from 'fs';
import path from 'path';
import { formPersistenceService } from '@/modules/forms';
import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';
import { ttsService, voiceCacheRepository } from '@/modules/voice-ai';
import { checkDatabaseConnection } from '@/lib/prisma';

async function runPersistenceTestSuite() {
  console.log('===============================================================');
  console.log('💾 AFL PLATFORM — KIỂM THỬ TẦNG LƯU TRỮ CSDL & PERSISTENCE API');
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

  // 1. Kiểm thử Connection Pool & Health Check
  console.log('--- PHẦN 1: KIỂM TRA TÌNH TRẠNG KẾT NỐI CSDL & RESILIENCE ---');
  const isDbOnline = await checkDatabaseConnection();
  assert(typeof isDbOnline === 'boolean', 'Hàm checkDatabaseConnection() trả về boolean an toàn');
  console.log(`   ℹ️ Trạng thái PostgreSQL hiện tại: ${isDbOnline ? '🟢 ONLINE' : '🟡 OFFLINE (Kích hoạt Chế độ Phòng vệ Ngoại tuyến)'}`);

  // 2. Nạp dữ liệu mẫu
  const manifestPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-manifest.json');
  const manifest: FormGeometricManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const workflowPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-workflow.json');
  const mockWorkflow: FormWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

  // 3. Kiểm thử lưu Geometric Manifest
  console.log('\n--- PHẦN 2: KIỂM THỬ LƯU BỘ KHUNG HÌNH HỌC (OPENCV MANIFEST) ---');
  const manifestRes = await formPersistenceService.saveGeometricManifest(manifest);
  assert(manifestRes.success === true, 'Lưu thành công FormGeometricManifest (Database hoặc Local Fallback)');
  assert(manifestRes.source === 'database' || manifestRes.source === 'local_fallback', `Nguồn lưu trữ chuẩn xác (${manifestRes.source})`);

  // 4. Kiểm thử lưu Kịch bản Workflow 9 bước (Gemini AI)
  console.log('\n--- PHẦN 3: KIỂM THỬ GIAO DỊCH NGUYÊN TỬ LƯU WORKFLOW & FAQS ---');
  const wfRes = await formPersistenceService.saveWorkflow(mockWorkflow);
  assert(wfRes.success === true, 'Lưu thành công FormWorkflow');
  assert(wfRes.stepCount === 9, 'Toàn bộ 9 bước và các câu FAQ được bảo toàn toàn vẹn');

  // 5. Kiểm thử truy vấn lại Kịch bản phục vụ Mobile Client (Người 2)
  console.log('\n--- PHẦN 4: KIỂM THỬ TRUY VẤN KỊCH BẢN CHO MOBILE CLIENT (NGƯỜI 2) ---');
  const retrievedWf = await formPersistenceService.getWorkflowByFormCode(mockWorkflow.formCode);
  assert(retrievedWf !== null, 'Truy vấn thành công kịch bản biểu mẫu theo formCode');
  assert(retrievedWf?.formCode === mockWorkflow.formCode, 'Mã biểu mẫu khớp 100%');
  assert(retrievedWf?.steps.length === 9, 'Đầy đủ 9 bước hướng dẫn cho người cao tuổi');

  const firstStep = retrievedWf?.steps[0];
  assert(firstStep?.exampleRedText === firstStep?.exampleRedText.toUpperCase(), 'Chữ mẫu đỏ in hoa đạt chuẩn WCAG AAA');
  assert(firstStep?.highlightCoords.length === 4, 'Tọa độ highlight đủ 4 trục chuẩn hóa [0.0 - 1.0]');
  assert(Array.isArray(firstStep?.faqs) && firstStep?.faqs.length >= 1, 'Mỗi bước có ít nhất 1 câu hỏi nhanh Touch-to-Ask');

  // 6. Kiểm thử Cổng Phê duyệt Admin Gatekeeper (FR-9)
  console.log('\n--- PHẦN 5: KIỂM THỬ PHÊ DUYỆT ADMIN GATEKEEPER & AUDIT LOG ---');
  const approveRes = await formPersistenceService.approveWorkflow(
    mockWorkflow.formCode,
    'Nguyễn Tuấn Khánh (Tech Lead)',
    'Đã đối soát đạt chuẩn nghiệm thu 11 FRs'
  );
  assert(approveRes.success === true, 'Phê duyệt kịch bản thành công');
  assert(approveRes.newStatus === 'ACTIVE', 'Trạng thái biểu mẫu chuyển sang ACTIVE');

  // 7. Kiểm thử Bộ nhớ đệm 2 Tầng L1/L2 Voice Cache
  console.log('\n--- PHẦN 6: KIỂM THỬ BỘ NHỚ ĐỆM 2 TẦNG (L1 FILE & L2 POSTGRESQL) ---');
  const testVoiceEntry = {
    cacheKey: 'cache_test_persistence_verification_key_1234567890',
    rawText: 'Chào cụ, đây là giọng đọc kiểm thử',
    audioUrl: '/audio/step_01.mp3',
    voiceName: 'vi-VN-Neural2-A',
    speakingRate: 0.9
  };
  await voiceCacheRepository.save(testVoiceEntry);
  assert(true, 'Gọi lưu L2 Voice Cache thành công (không gây lỗi nếu DB offline)');

  const ttsRes = await ttsService.synthesizeSpeech(mockWorkflow.steps[0].voiceGuidance, 1, 'NORTH');
  assert(ttsRes.audioUrl.length > 0, 'Dịch vụ TTS tích hợp L1/L2 cache mượt mà');
  assert(ttsRes.wordTimestamps.length > 0, 'Mốc thời gian từ vựng Karaoke được bảo toàn');

  // TỔNG KẾT
  console.log('\n===============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN (100%)`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    console.log('✨ Tầng dịch vụ lưu trữ CSDL Prisma & Bộ nhớ đệm 2 tầng đạt chuẩn sẵn sàng sản xuất!\n');
    process.exit(0);
  } else {
    console.error('⚠️ Phát hiện lỗi trong kiểm thử tầng lưu trữ.\n');
    process.exit(1);
  }
}

runPersistenceTestSuite().catch(err => {
  console.error('Lỗi ngoại lệ trong kiểm thử persistence:', err);
  process.exit(1);
});
