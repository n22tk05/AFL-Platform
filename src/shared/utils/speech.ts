/**
 * Tiện ích giọng đọc tiếng Việt chuẩn dành cho người cao tuổi và kiểm thử kịch bản
 */
export function speakVietnamese(text: string, rate: number = 0.9): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}
