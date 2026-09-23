import fs from 'fs';
import path from 'path';
import { FormGeometricManifest } from '@/shared/contracts';
import { geminiPromptService, ttsService, voiceQAService } from '@/modules/voice-ai';

async function runVoiceAITestSuite() {
  console.log('===============================================================');
  console.log('🧪 AFL PLATFORM — KIỂM THỬ PHÂN HỆ VOICE AI (FR-8, FR-3, FR-4)');
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

  // TEST 1: Nạp file mock-manifest.json
  console.log('--- PHẦN 1: KIỂM THỬ TÍCH HỢP HỢP ĐỒNG & MOCK MANIFEST ---');
  const manifestPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-manifest.json');
  assert(fs.existsSync(manifestPath), 'Tồn tại file mock-manifest.json');

  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const manifest: FormGeometricManifest = JSON.parse(manifestContent);
  assert(manifest.boxes.length >= 9, 'Tờ khai có đủ 9 ô tọa độ chuẩn hóa', `Đếm được: ${manifest.boxes.length} ô`);

  // TEST 2: Kiểm thử FR-8 (Gemini Prompt Service)
  console.log('\n--- PHẦN 2: KIỂM THỬ FR-8 (TỰ ĐỘNG SINH KỊCH BẢN & CHỮ ĐỎ) ---');
  const workflow = await geminiPromptService.generateWorkflow(manifest);
  assert(workflow.steps.length === manifest.boxes.length, 'Số bước kịch bản khớp số ô hình học');
  
  const firstStep = workflow.steps[0];
  assert(firstStep.stepIndex === 1, 'Bước đầu tiên có stepIndex = 1');
  assert(typeof firstStep.voiceGuidance === 'string' && firstStep.voiceGuidance.length > 10, 'Có câu thoại hướng dẫn bình dân');
  assert(firstStep.exampleRedText === firstStep.exampleRedText.toUpperCase(), 'Chữ mẫu đỏ bắt buộc IN HOA (WCAG AAA)');
  assert(Array.isArray(firstStep.faqs) && firstStep.faqs.length >= 1, 'Có nút câu hỏi nhanh Touch-to-Ask Chips (Fallback)');

  // Kiểm tra tọa độ chuẩn hóa [0.0 - 1.0]
  const coordsValid = workflow.steps.every(s => 
    s.highlightCoords.length === 4 &&
    s.highlightCoords.every(c => c >= 0.0 && c <= 1.0)
  );
  assert(coordsValid, 'Toàn bộ tọa độ highlight nằm trong dải chuẩn hóa [0.0 - 1.0]');

  // TEST 3: Kiểm thử FR-3 (TTS & Karaoke Timestamps)
  console.log('\n--- PHẦN 3: KIỂM THỬ FR-3 (GIỌNG ĐỌC 0.9x & MỐC THỜI GIAN KARAOKE) ---');
  const ttsResult = await ttsService.synthesizeSpeech(firstStep.voiceGuidance, 1, 'NORTH');
  assert(ttsResult.audioUrl === '/audio/step_01.mp3', 'Đường dẫn audio chuẩn xác: /audio/step_01.mp3');
  assert(ttsResult.wordTimestamps.length > 0, 'Trích xuất thành công mảng mốc thời gian từ vựng Karaoke', `Số từ: ${ttsResult.wordTimestamps.length}`);
  
  const firstWord = ttsResult.wordTimestamps[0];
  assert(firstWord.startMs >= 0 && firstWord.endMs > firstWord.startMs, 'Mốc thời gian từ đầu tiên hợp lệ');

  // TEST 4: Kiểm thử FR-4 (Voice Q&A & Half-Duplex Safeguard)
  console.log('\n--- PHẦN 4: KIỂM THỬ FR-4 (HỎI ĐÁP NGỮ CẢNH & CHỐNG DỘI ÂM ECHO) ---');
  const qaRes = await voiceQAService.answerQuestion({
    currentStep: firstStep,
    userQuestion: 'Viết chữ in thường được không?'
  });
  assert(typeof qaRes.answerText === 'string' && qaRes.answerText.length > 5, 'Có câu trả lời giải đáp cho thắc mắc của cụ');
  assert(qaRes.latencyMs >= 0, `Ghi nhận độ trễ phản hồi (${qaRes.latencyMs}ms)`);

  // Kiểm tra Half-Duplex Safeguard
  const hd = voiceQAService.halfDuplex;
  hd.onAudioPlaybackStart();
  assert(hd.isSpeaking === true && hd.isListening === false, 'Khi loa phát: Micro bị khóa cứng 100%');
  
  const pressResult = hd.onMicPress();
  assert(pressResult.shouldPauseSpeaker === true && hd.isSpeaking === false && hd.isListening === true, 'Khi bấm Mic: Lập tức ngắt âm thanh phát loa');

  hd.onAudioPlaybackEnd();
  assert(hd.canSafelyListen() === false, 'Vừa dứt loa: Chưa được mở Mic ngay (bảo vệ trễ 300ms)');

  // TỔNG KẾT
  console.log('\n===============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    console.log('✨ Toàn bộ module Voice AI (Người 4) đã sẵn sàng tích hợp!\n');
    process.exit(0);
  } else {
    console.error('⚠️ Phát hiện lỗi trong kiểm thử, vui lòng rà soát lại.\n');
    process.exit(1);
  }
}

runVoiceAITestSuite().catch(err => {
  console.error('Lỗi ngoại lệ trong quá trình chạy kiểm thử:', err);
  process.exit(1);
});
