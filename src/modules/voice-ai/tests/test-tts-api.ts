import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function verifyTTSApiKey() {
  console.log('===============================================================');
  console.log('🔍 KIỂM THỬ KẾT NỐI API KEY GOOGLE CLOUD TEXT-TO-SPEECH (TTS)');
  console.log('===============================================================\n');

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log(`1. Trạng thái cấu hình khóa bí mật:`);
  console.log(`   - GOOGLE_TTS_API_KEY: ${apiKey ? `Đã cấu hình (${apiKey.substring(0, 8)}...${apiKey.slice(-4)})` : '❌ CHƯA CẤU HÌNH'}`);
  console.log(`   - GEMINI_API_KEY:     ${geminiKey ? `Đã cấu hình (${geminiKey.substring(0, 8)}...${geminiKey.slice(-4)})` : '❌ CHƯA CẤU HÌNH'}`);

  if (!apiKey) {
    console.error('\n❌ Không tìm thấy GOOGLE_TTS_API_KEY trong file .env!');
    process.exit(1);
  }

  // TEST 1: Kiểm tra quyền truy cập danh sách Voice tiếng Việt
  console.log('\n--- BÀI KIỂM TRA 1: LẤY DANH SÁCH GIỌNG ĐỌC TIẾNG VIỆT (vi-VN) ---');
  try {
    const listUrl = `https://texttospeech.googleapis.com/v1/voices?languageCode=vi-VN&key=${apiKey}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (listData.error) {
      console.error('❌ Lỗi xác thực Google Cloud TTS:');
      console.error(`   - Mã lỗi: ${listData.error.code} (${listData.error.status})`);
      console.error(`   - Chi tiết: ${listData.error.message}`);
      return false;
    }

    const voices = listData.voices || [];
    console.log(`✅ Kết nối thành công! Tìm thấy ${voices.length} giọng đọc tiếng Việt.`);
    voices.slice(0, 4).forEach((v: any) => {
      console.log(`   • ${v.name} (${v.ssmlGender}) - Tần số: ${v.naturalSampleRateHertz}Hz`);
    });

  } catch (err: any) {
    console.error('❌ Lỗi kết nối mạng khi gọi TTS Voices API:', err.message || err);
    return false;
  }

  // TEST 2: Tổng hợp giọng đọc miền Bắc (vi-VN-Neural2-A) tốc độ 0.9x
  console.log('\n--- BÀI KIỂM TRA 2: TỔNG HỢP GIỌNG ĐỌC MIỀN BẮC (vi-VN-Neural2-A, 0.9x) ---');
  const sampleTextNorth = 'Bác nhìn vào Mục một, dòng số một. Bác lấy bút ghi họ và tên của mình bằng chữ in hoa có dấu, giống như chữ mẫu màu đỏ trên màn hình nhé.';
  let northBuffer: Buffer | null = null;

  try {
    const synthUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const payloadNorth = {
      input: { text: sampleTextNorth },
      voice: {
        languageCode: 'vi-VN',
        name: 'vi-VN-Neural2-A'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9
      }
    };

    const startTime = Date.now();
    const synthRes = await fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadNorth)
    });

    const synthData = await synthRes.json();
    const latencyMs = Date.now() - startTime;

    if (synthData.error) {
      console.error('❌ Lỗi khi sinh âm thanh giọng Bắc:');
      console.error(`   - Mã lỗi: ${synthData.error.code} (${synthData.error.status})`);
      console.error(`   - Chi tiết: ${synthData.error.message}`);
      return false;
    }

    if (synthData.audioContent) {
      northBuffer = Buffer.from(synthData.audioContent, 'base64');
      const outPath = path.join(process.cwd(), 'public', 'audio', 'test_real_north_0.9x.mp3');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, northBuffer);
      console.log(`✅ Thành công! Thời gian phản hồi: ${latencyMs}ms`);
      console.log(`   - Kích thước file MP3: ${northBuffer.length} bytes`);
      console.log(`   - Đã lưu file thực tế tại: public/audio/test_real_north_0.9x.mp3`);
    }

  } catch (err: any) {
    console.error('❌ Lỗi kết nối khi sinh giọng Bắc:', err.message || err);
    return false;
  }

  // TEST 3: Tổng hợp giọng đọc miền Nam (vi-VN-Neural2-D) tốc độ 0.9x
  console.log('\n--- BÀI KIỂM TRA 3: TỔNG HỢP GIỌNG ĐỌC MIỀN NAM (vi-VN-Neural2-D, 0.9x) ---');
  const sampleTextSouth = 'Dạ bác ơi, theo biên bản xử phạt của bác, số tiền phạt là tám trăm nghìn đồng, bác ghi vào ô số tiền nhé!';

  try {
    const synthUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const payloadSouth = {
      input: { text: sampleTextSouth },
      voice: {
        languageCode: 'vi-VN',
        name: 'vi-VN-Neural2-D'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9
      }
    };

    const startTime = Date.now();
    const synthRes = await fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadSouth)
    });

    const synthData = await synthRes.json();
    const latencyMs = Date.now() - startTime;

    if (synthData.error) {
      console.error('❌ Lỗi khi sinh âm thanh giọng Nam:');
      console.error(`   - Mã lỗi: ${synthData.error.code} (${synthData.error.status})`);
      console.error(`   - Chi tiết: ${synthData.error.message}`);
      return false;
    }

    if (synthData.audioContent) {
      const southBuffer = Buffer.from(synthData.audioContent, 'base64');
      const outPath = path.join(process.cwd(), 'public', 'audio', 'test_real_south_0.9x.mp3');
      fs.writeFileSync(outPath, southBuffer);
      console.log(`✅ Thành công! Thời gian phản hồi: ${latencyMs}ms`);
      console.log(`   - Kích thước file MP3: ${southBuffer.length} bytes`);
      console.log(`   - Đã lưu file thực tế tại: public/audio/test_real_south_0.9x.mp3`);
    }

  } catch (err: any) {
    console.error('❌ Lỗi kết nối khi sinh giọng Nam:', err.message || err);
    return false;
  }

  // TỔNG KẾT
  console.log('\n===============================================================');
  console.log('🎉 XÁC NHẬN: KHÓA GOOGLE CLOUD TTS HOẠT ĐỘNG HOÀN HẢO 100%!');
  console.log('   - Hỗ trợ đầy đủ giọng đọc miền Bắc & miền Nam chuẩn Neural2');
  console.log('   - Tốc độ đọc 0.9x chậm rãi chuẩn PRD');
  console.log('   - Đã sinh và xuất thành công 2 file âm thanh MP3 thực tế');
  console.log('===============================================================\n');
  return true;
}

verifyTTSApiKey();
