import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { TTSService, WordTimestamp } from '../tts-service';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

interface TimestampsManifest {
  formId: string;
  formTitle: string;
  formCode: string;
  generatedAt: string;
  voiceRegion: 'NORTH' | 'SOUTH';
  voiceName: string;
  speakingRate: number;
  totalBundleSizeBytes: number;
  totalBundleSizeKB: string;
  nfr2Compliant: boolean;
  steps: Record<number, {
    boxId: string;
    label: string;
    voiceGuidance: string;
    audioUrl: string;
    fileSizeBytes: number;
    fileSizeKB: string;
    wordCount: number;
    durationEstimateMs: number;
    wordTimestamps: WordTimestamp[];
  }>;
}

async function generateFullAudio() {
  console.log('===============================================================');
  console.log('🎙️ AFL PLATFORM - TỔNG HỢP ÂM THANH 9 BƯỚC TỜ KHAI LPTB (FR-3)');
  console.log('   Tiêu chuẩn: Google Cloud TTS Neural2, 0.9x speed, Word-level');
  console.log('===============================================================\n');

  const workflowPath = path.join(process.cwd(), 'assets', 'mock-data', 'mock-workflow.json');
  if (!fs.existsSync(workflowPath)) {
    console.error(`❌ Không tìm thấy file kịch bản mẫu tại: ${workflowPath}`);
    process.exit(1);
  }

  const workflowRaw = fs.readFileSync(workflowPath, 'utf-8');
  const workflow = JSON.parse(workflowRaw);
  const steps: any[] = workflow.steps || [];

  console.log(`📋 Đang xử lý biểu mẫu: ${workflow.formTitle} (${workflow.formCode})`);
  console.log(`🔢 Tổng số bước cần tổng hợp âm thanh: ${steps.length} bước\n`);

  const ttsService = new TTSService();
  const outputAudioDir = path.join(process.cwd(), 'public', 'audio');
  if (!fs.existsSync(outputAudioDir)) {
    fs.mkdirSync(outputAudioDir, { recursive: true });
  }

  const manifest: TimestampsManifest = {
    formId: workflow.formId,
    formTitle: workflow.formTitle,
    formCode: workflow.formCode,
    generatedAt: new Date().toISOString(),
    voiceRegion: 'NORTH',
    voiceName: 'vi-VN-Neural2-A',
    speakingRate: 0.9,
    totalBundleSizeBytes: 0,
    totalBundleSizeKB: '0 KB',
    nfr2Compliant: false,
    steps: {}
  };

  let totalBytes = 0;
  console.log('-----------------------------------------------------------------------------------------');
  console.log('| Bước | Box ID | File MP3      | Dung lượng | Số từ | Thời lượng ước tính | Trạng thái |');
  console.log('-----------------------------------------------------------------------------------------');

  for (const step of steps) {
    const startTime = Date.now();
    const result = await ttsService.synthesizeSpeech(step.voiceGuidance, step.stepIndex, 'NORTH');
    const elapsedMs = Date.now() - startTime;

    const fileName = `step_${String(step.stepIndex).padStart(2, '0')}.mp3`;
    const targetFile = path.join(outputAudioDir, fileName);
    const stat = fs.existsSync(targetFile) ? fs.statSync(targetFile) : { size: result.audioBuffer.length };
    const sizeBytes = stat.size;
    totalBytes += sizeBytes;

    const wordCount = result.wordTimestamps.length;
    const durationMs = wordCount > 0 ? result.wordTimestamps[wordCount - 1].endMs : 0;

    manifest.steps[step.stepIndex] = {
      boxId: step.boxId,
      label: step.label,
      voiceGuidance: step.voiceGuidance,
      audioUrl: `/audio/${fileName}`,
      fileSizeBytes: sizeBytes,
      fileSizeKB: `${(sizeBytes / 1024).toFixed(1)} KB`,
      wordCount,
      durationEstimateMs: durationMs,
      wordTimestamps: result.wordTimestamps
    };

    const sizeStr = `${(sizeBytes / 1024).toFixed(1)} KB`.padEnd(10);
    const durationStr = `${(durationMs / 1000).toFixed(1)}s`.padEnd(19);
    console.log(`|  ${String(step.stepIndex).padEnd(3)} | ${step.boxId.padEnd(6)} | ${fileName.padEnd(13)} | ${sizeStr} | ${String(wordCount).padEnd(5)} | ${durationStr} | ✅ OK (${elapsedMs}ms) |`);
  }

  console.log('-----------------------------------------------------------------------------------------');

  manifest.totalBundleSizeBytes = totalBytes;
  manifest.totalBundleSizeKB = `${(totalBytes / 1024).toFixed(2)} KB`;
  const MAX_ALLOWED_BYTES = 1.5 * 1024 * 1024; // 1.5 MB NFR-2
  manifest.nfr2Compliant = totalBytes <= MAX_ALLOWED_BYTES;

  // Ghi tệp timestamps.json vào public/audio
  const timestampsFilePath = path.join(outputAudioDir, 'timestamps.json');
  fs.writeFileSync(timestampsFilePath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\n📦 TỔNG KẾT GÓI ÂM THANH:`);
  console.log(`   - Tổng dung lượng gói âm thanh 9 bước: ${manifest.totalBundleSizeKB} (${totalBytes} bytes)`);
  console.log(`   - Ngưỡng giới hạn PWA Offline Cache (NFR-2): 1.50 MB (${MAX_ALLOWED_BYTES} bytes)`);
  console.log(`   - Tỷ lệ dung lượng chiếm dụng: ${((totalBytes / MAX_ALLOWED_BYTES) * 100).toFixed(1)}%`);
  console.log(`   - Kiểm chuẩn NFR-2: ${manifest.nfr2Compliant ? '✅ ĐẠT CHUẨN (PASS)' : '❌ VƯỢT QUÁ NGƯỠNG'}`);
  console.log(`   - Tệp chỉ mục mốc thời gian: ${timestampsFilePath} (${fs.statSync(timestampsFilePath).size} bytes)`);

  if (!manifest.nfr2Compliant) {
    console.error('\n❌ Thất bại: Gói âm thanh vượt quá giới hạn 1.5MB của NFR-2!');
    process.exit(1);
  }

  console.log('\n✨ ĐÃ HOÀN TẤT TỔNG HỢP ÂM THANH 9 BƯỚC THÀNH CÔNG 100%!');
}

generateFullAudio().catch(err => {
  console.error('❌ Lỗi ngoại lệ trong quá trình tổng hợp âm thanh:', err);
  process.exit(1);
});
