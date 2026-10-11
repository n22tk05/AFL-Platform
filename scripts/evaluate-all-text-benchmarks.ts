import fs from 'node:fs';
import path from 'node:path';
import { scoreOcrText } from '../src/modules/documents/ocr-text-evaluation';

interface BenchmarkConfig {
  name: string;
  imagePath: string;
  fixturePath: string;
}

const BENCHMARKS: BenchmarkConfig[] = [
  {
    name: 'Hải Phòng - Hỗ trợ mai táng (Trang 7)',
    imagePath: 'private-documents/recognition-evaluation/haiphong-funeral-form-p7.png',
    fixturePath: 'tests/fixtures/ocr-text-haiphong-funeral-p7-ground-truth.json',
  },
  {
    name: 'Bộ Xây dựng - Đơn đề nghị cấp phép (Trang 59)',
    imagePath: 'private-documents/recognition-evaluation/central-construction-application-p59.png',
    fixturePath: 'tests/fixtures/ocr-text-central-construction-p59-ground-truth.json',
  },
  {
    name: 'Phụ lục Chính phủ - Giấy ủy quyền (Trang 61)',
    imagePath: 'private-documents/recognition-evaluation/central-authorization-p61.png',
    fixturePath: 'tests/fixtures/ocr-text-central-authorization-p61-ground-truth.json',
  },
];

async function run() {
  console.log('========================================================================================');
  console.log('   BẢNG ĐÁNH GIÁ ĐỊNH LƯỢNG ĐỘ CHÍNH XÁC VĂN BẢN OCR (CER / WER) - CHẶNG 50   ');
  console.log('========================================================================================\n');

  const results = [];

  for (const b of BENCHMARKS) {
    if (!fs.existsSync(b.imagePath) || !fs.existsSync(b.fixturePath)) {
      console.warn(`[SKIP] Missing file for ${b.name}`);
      continue;
    }

    const imageBytes = fs.readFileSync(b.imagePath);
    const base64 = imageBytes.toString('base64');
    const fixture = JSON.parse(fs.readFileSync(b.fixturePath, 'utf8'));

    const start = Date.now();
    const res = await fetch('http://127.0.0.1:8000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 })
    });

    if (!res.ok) {
      console.error(`[FAIL] ${b.name}: ${res.status}`);
      continue;
    }

    const data = await res.json();
    const durationMs = Date.now() - start;
    const predictions = data.predictions || [];
    const rawText = predictions.map((p: any) => p.text).join('\n');

    const score = scoreOcrText(fixture.expectedLines, rawText);

    results.push({
      form: b.name,
      lines: predictions.length,
      latency: `${durationMs}ms`,
      cer: `${(score.characterErrorRate * 100).toFixed(2)}%`,
      charErrors: `${score.characterErrors}/${score.expectedCharacters}`,
      wer: `${(score.wordErrorRate * 100).toFixed(2)}%`,
      wordErrors: `${score.wordErrors}/${score.expectedWords}`,
    });
  }

  console.table(results);
  console.log('\n[EVIDENCE] Tất cả các chỉ số đều được tính toán trực tiếp trên model VietOCR đang chạy.');
}

run().catch(console.error);
