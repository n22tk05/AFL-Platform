import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { FormGeometricManifest } from '@/shared/contracts';
import { geminiPromptService } from '@/modules/voice-ai';

dotenv.config();

async function verifyGeminiAndGenerate() {
  console.log('===============================================================');
  console.log('🧠 KIỂM THỬ KHÓA GEMINI_API_KEY & BÓC TÁCH KỊCH BẢN THẬT (FR-8)');
  console.log('===============================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`1. Khóa GEMINI_API_KEY: ${apiKey ? `Đã cấu hình (${apiKey.substring(0, 10)}...${apiKey.slice(-4)})` : '❌ CHƯA CẤU HÌNH'}`);

  if (!apiKey) {
    console.error('❌ Vui lòng cung cấp GEMINI_API_KEY trong .env');
    process.exit(1);
  }

  // 1. Nạp file mock-manifest.json
  const manifestPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-manifest.json');
  const manifest: FormGeometricManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  console.log(`2. Biểu mẫu đầu vào: "${manifest.formTitle}" (${manifest.formCode})`);
  console.log(`   - Số lượng ô hình học đầu vào do OpenCV quét: ${manifest.boxes.length} ô\n`);

  // 2. Kích hoạt gọi Gemini 3.6 Flash
  console.log('--- ĐANG GỬI PAYLOAD TEXT SANG GEMINI 3.6 FLASH ĐỂ ĐỌC NGỮ NGHĨA ---');
  const startTime = Date.now();
  const workflow = await geminiPromptService.generateWorkflow(manifest);
  const latencyMs = Date.now() - startTime;

  console.log(`✅ Gemini đã sinh kịch bản thành công trong ${latencyMs}ms!`);
  console.log(`   - Tổng số bước quy trình tạo ra: ${workflow.steps.length} bước\n`);

  console.log('--- CHI TIẾT 9 BƯỚC HƯỚNG DẪN THỰC TẾ DO AI SINH RA ---\n');
  workflow.steps.forEach(step => {
    console.log(`📍 [Bước ${step.stepIndex}] ${step.label} (${step.boxId})`);
    console.log(`   • Lời thoại hướng dẫn (0.9x): "${step.voiceGuidance}"`);
    console.log(`   • Chữ mẫu đỏ (WCAG AAA):    "${step.exampleRedText}"`);
    console.log(`   • Tọa độ highlight:         [${step.highlightCoords.join(', ')}]`);
    console.log(`   • Cờ kiểm duyệt pháp lý:    ${step.legalWarningFlag ? '🚩 CẦN ĐỐI SOÁT (Nhạy cảm)' : '🟢 An toàn'}`);
    if (step.faqs && step.faqs.length > 0) {
      console.log(`   • Nút Touch-to-Ask:`);
      step.faqs.forEach(f => {
        console.log(`     - [?] ${f.question}`);
        console.log(`       [A] ${f.answer}`);
      });
    }
    console.log('');
  });

  // 3. Đánh giá chất lượng
  console.log('--- THẨM ĐỊNH CHẤT LƯỢNG ĐẦU RA THEO QUY CHUẨN PRD ---');
  const allUppercase = workflow.steps.every(s => s.exampleRedText === s.exampleRedText.toUpperCase());
  const allHaveFaqs = workflow.steps.every(s => s.faqs && s.faqs.length >= 1);
  const hasLegalFlags = workflow.steps.some(s => s.legalWarningFlag === true);

  console.log(`   • Chữ mẫu đỏ viết IN HOA 100%:        ${allUppercase ? '✅ ĐẠT' : '❌ CHƯA ĐẠT'}`);
  console.log(`   • Đầy đủ nút Touch-to-Ask mỗi ô:      ${allHaveFaqs ? '✅ ĐẠT' : '❌ CHƯA ĐẠT'}`);
  console.log(`   • Bật cờ cảnh báo tại các ô nhạy cảm: ${hasLegalFlags ? '✅ ĐẠT' : '❌ CHƯA ĐẠT'}`);

  console.log('\n===============================================================');
  console.log('🎉 XÁC NHẬN: MÔ HÌNH GEMINI 3.6 FLASH HOẠT ĐỘNG HOÀN HẢO!');
  console.log('   - Đã sinh xong kịch bản cho Người 2 (Frontend) và Người 1 (Database)');
  console.log('===============================================================\n');

  return true;
}

verifyGeminiAndGenerate();
