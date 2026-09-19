import { WebSpeechSTT } from '../stt-service';
import { HalfDuplexController } from '../voice-qa';

async function runSTTTests() {
  console.log('===============================================================');
  console.log('🎙️ KIỂM THỬ ĐƠN VỊ & BẢO VỆ BÁN SONG CÔNG STT & HALF-DUPLEX (FR-4)');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
    }
  }

  // TEST SUITE 1: WebSpeechSTT SSR Safe & Abstraction
  console.log('--- PHẦN 1: KIỂM THỬ WEBSPEECH STT (AN TOÀN SSR & CẤU HÌNH) ---');
  const stt = new WebSpeechSTT({ lang: 'vi-VN', continuous: false });
  assert(stt !== null, 'Khởi tạo thành công WebSpeechSTT');
  assert(stt.isListening === false, 'Trạng thái ban đầu không thu âm (isListening = false)');
  assert(typeof stt.isSupported() === 'boolean', 'Hàm isSupported() trả về boolean chuẩn xác');
  
  let errorTriggered = false;
  stt.registerCallbacks({
    onError: (msg) => {
      errorTriggered = true;
    }
  });
  // Trong môi trường Node, gọi start sẽ kích hoạt callback báo không hỗ trợ mà không văng Exception
  stt.start();
  assert(errorTriggered, 'Xử lý an toàn khi môi trường không có SpeechRecognition (không crash)');

  // TEST SUITE 2: HalfDuplexController Triệt tiêu Dội âm
  console.log('\n--- PHẦN 2: KIỂM THỬ HALF-DUPLEX CONTROLLER (300MS ECHO-GUARD) ---');
  const hd = new HalfDuplexController();
  assert(!hd.isSpeaking && !hd.isListening, 'Khởi tạo: Loa tắt, Mic tắt');
  assert(hd.canSafelyListen() === true, 'Ban đầu: Đủ điều kiện an toàn để lắng nghe');

  // Loa bắt đầu phát
  hd.onAudioPlaybackStart();
  assert(hd.isSpeaking === true, 'Khi loa phát: isSpeaking = true');
  assert(hd.isListening === false, 'Khi loa phát: Micro bị khóa cứng (isListening = false)');
  assert(hd.canSafelyListen() === false, 'Khi loa phát: canSafelyListen = false');

  // Người dùng bấm Mic ngắt loa
  const { shouldPauseSpeaker } = hd.onMicPress();
  assert(shouldPauseSpeaker === true, 'Bấm Mic khi đang phát loa: Phát tín hiệu ngắt loa ngay');
  assert(hd.isSpeaking === false, 'Sau khi bấm Mic: Loa bị ngắt ngay lập tức');
  assert(hd.isListening === true, 'Sau khi bấm Mic: Mic chuyển sang trạng thái thu');

  // Nhả Mic
  hd.onMicRelease();
  assert(hd.isListening === false, 'Nhả Mic: isListening = false');

  // Loa phát lại rồi kết thúc
  hd.onAudioPlaybackStart();
  hd.onAudioPlaybackEnd();
  assert(hd.isSpeaking === false, 'Loa kết thúc: isSpeaking = false');
  assert(hd.canSafelyListen() === false, 'Ngay sau khi dứt loa (0ms): Vẫn bị khóa bởi Echo-Guard 300ms');

  // Chờ 350ms
  console.log('  ⏳ Đang chờ 350ms kiểm chứng bộ đếm Echo-Guard...');
  await new Promise(resolve => setTimeout(resolve, 350));
  assert(hd.canSafelyListen() === true, 'Sau 350ms (> 300ms Echo-Guard): Đã mở khóa an toàn để thu âm');

  console.log('\n===============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passed}/${total} TIÊU CHÍ ĐẠT CHUẨN`);
  console.log('===============================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runSTTTests().catch(err => {
  console.error('Lỗi khi chạy test STT:', err);
  process.exit(1);
});
