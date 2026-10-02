import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { VietOcrAdapter } from '../src/modules/ocr/vietocr-adapter.js';

dotenv.config();

console.log('====================================================');
console.log('🔍 KIỂM TRA CẤU HÌNH API & CREDENTIALS CHO AFL-PLATFORM');
console.log('====================================================\n');

let hasGemini = false;
let hasVietOcr = false;

// 1. Kiểm tra Google Gemini API
console.log('1️⃣  Kiểm tra Google Gemini API...');
const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const geminiModel = process.env.GEMINI_DOCUMENT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';

if (!geminiApiKey) {
  console.log('   ❌ GEMINI_API_KEY: Chưa cấu hình trong file .env');
  console.log('   👉 Hướng dẫn: Truy cập https://aistudio.google.com/ để tạo API key miễn phí.\n');
} else {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: 'Xin chào, hãy trả về đúng từ "SAN_SANG".',
    });
    const reply = response.text?.trim();
    if (reply?.includes('SAN_SANG')) {
      console.log(`   ✅ Gemini API hoạt động tốt! (Model: ${geminiModel})`);
      hasGemini = true;
    } else {
      console.log(`   ⚠️ Gemini API kết nối được nhưng phản hồi khác mong đợi: "${reply}"`);
      hasGemini = true;
    }
  } catch (err) {
    console.log(`   ❌ Lỗi kết nối Gemini API: ${err.message}`);
  }
  console.log('');
}

// 2. Kiểm tra VietOCR Pipeline
console.log('2️⃣  Kiểm tra VietOCR Pipeline (OpenCV WASM Line Segmentation + VietOCR)...');
const provider = process.env.DOCUMENT_OCR_PROVIDER || 'vietocr';
const vietocrEndpoint = process.env.VIETOCR_ENDPOINT || 'http://localhost:8000/predict';
console.log(`   ℹ️  DOCUMENT_OCR_PROVIDER: ${provider}`);
console.log(`   ℹ️  VIETOCR_ENDPOINT: ${vietocrEndpoint}`);

try {
  const adapter = new VietOcrAdapter({
    endpoint: vietocrEndpoint,
    allowOfflineFallback: true,
  });

  const testLines = await adapter.recognizeLines([
    {
      lineId: 'test_line_001',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      coordinates: [0.1, 0.1, 0.2, 0.9],
    },
  ]);

  if (testLines.length && testLines[0].rawText) {
    console.log('   ✅ VietOCR Adapter sẵn sàng!');
    console.log(`      Dòng nhận diện mẫu: "${testLines[0].rawText}" (Confidence: ${testLines[0].confidence})`);
    hasVietOcr = true;
  } else {
    console.log('   ⚠️ VietOCR Adapter phản hồi rỗng');
  }
} catch (err) {
  console.log(`   ❌ Lỗi VietOCR: ${err.message}`);
}
console.log('');

// Tổng kết
console.log('====================================================');
console.log('📊 TỔNG KẾT TRẠNG THÁI HỆ THỐNG:');
console.log(`- Gemini AI: ${hasGemini ? '✅ ĐÃ SẴN SÀNG' : '❌ CHƯA SẴN SÀNG'}`);
console.log(`- VietOCR Pipeline: ${hasVietOcr ? '✅ ĐÃ SẴN SÀNG' : '❌ CHƯA SẴN SÀNG'}`);
console.log('====================================================');
