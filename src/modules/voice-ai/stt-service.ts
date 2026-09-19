/**
 * AFL Platform - Web Speech API STT Service (FR-4)
 * Bộ nhận diện giọng nói tiếng Việt on-device cho công dân cao tuổi.
 * Chạy trực tiếp trên trình duyệt thiết bị (Zero network latency for STT).
 */

export interface STTConfig {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
}

export interface STTCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string, rawError?: any) => void;
  onEnd?: () => void;
}

export class WebSpeechSTT {
  private recognition: any = null;
  private isListeningState: boolean = false;
  private config: STTConfig;
  private callbacks: STTCallbacks = {};

  constructor(config?: STTConfig) {
    this.config = {
      lang: 'vi-VN',
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
      ...config
    };

    this.initRecognition();
  }

  /**
   * Khởi tạo đối tượng SpeechRecognition từ window
   */
  private initRecognition(): boolean {
    if (typeof window === 'undefined') {
      return false; // Server-side rendering safe
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return false;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.config.lang || 'vi-VN';
      this.recognition.continuous = this.config.continuous ?? false;
      this.recognition.interimResults = this.config.interimResults ?? true;
      this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;

      this.recognition.onstart = () => {
        this.isListeningState = true;
        this.callbacks.onStart?.();
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        const isFinal = Boolean(finalTranscript);
        const transcript = (finalTranscript || interimTranscript).trim();

        if (transcript) {
          this.callbacks.onResult?.(transcript, isFinal);
        }
      };

      this.recognition.onerror = (event: any) => {
        this.isListeningState = false;
        let friendlyMessage = 'Không thể nhận diện giọng nói. Bác vui lòng thử lại nhé!';

        switch (event.error) {
          case 'no-speech':
            friendlyMessage = 'Cháu chưa nghe rõ bác nói gì ạ. Bác bấm lại Mic để nói nhé!';
            break;
          case 'not-allowed':
          case 'service-not-allowed':
            friendlyMessage = 'Thiết bị chưa cho phép truy cập Micro. Bác bấm Cho phép Micro trên trình duyệt giúp cháu nhé!';
            break;
          case 'audio-capture':
            friendlyMessage = 'Không tìm thấy Micro trên thiết bị của bác.';
            break;
          case 'network':
            friendlyMessage = 'Đường truyền mạng yếu, bác có thể bấm chọn các nút câu hỏi bên dưới cho nhanh ạ!';
            break;
        }

        this.callbacks.onError?.(friendlyMessage, event);
      };

      this.recognition.onend = () => {
        this.isListeningState = false;
        this.callbacks.onEnd?.();
      };

      return true;
    } catch (err) {
      this.recognition = null;
      return false;
    }
  }

  /**
   * Đăng ký các hàm phản hồi sự kiện (callbacks)
   */
  public registerCallbacks(callbacks: STTCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Kiểm tra trình duyệt có hỗ trợ Web Speech API hay không
   */
  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Bắt đầu lắng nghe
   */
  public start(): boolean {
    if (!this.recognition) {
      const initialized = this.initRecognition();
      if (!initialized) {
        this.callbacks.onError?.('Trình duyệt không hỗ trợ nhận dạng giọng nói Web Speech API.');
        return false;
      }
    }

    if (this.isListeningState) {
      return true;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error: any) {
      // Một số trình duyệt báo lỗi nếu start khi đang active
      if (error.name !== 'InvalidStateError') {
        this.callbacks.onError?.('Không thể khởi động Micro.', error);
      }
      return false;
    }
  }

  /**
   * Dừng lắng nghe
   */
  public stop(): void {
    if (this.recognition && this.isListeningState) {
      try {
        this.recognition.stop();
      } catch {
        // bỏ qua lỗi dừng
      }
    }
    this.isListeningState = false;
  }

  /**
   * Hủy lắng nghe lập tức
   */
  public abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // bỏ qua lỗi hủy
      }
    }
    this.isListeningState = false;
  }

  /**
   * Trạng thái đang thu âm
   */
  public get isListening(): boolean {
    return this.isListeningState;
  }
}
