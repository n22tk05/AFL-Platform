/**
 * CẤU HÌNH HỆ THỐNG TOÀN CỤC (APP CONFIG) - DỰ ÁN AFL
 * Chứa công tắc chuyển đổi Mock Switcher (useMockData).
 * Khi bật `useMockData: true`, toàn bộ FE có thể chạy độc lập không phụ thuộc BE/API.
 */

import mockManifestJson from '../../assets/mock-data/mock-manifest.json';
import mockWorkflowJson from '../../assets/mock-data/mock-workflow.json';
import mockWorkflowLptb from '../../assets/mock-data/mock-workflow-01-lptb.json';
import mockWorkflowKhaiSinh from '../../assets/mock-data/mock-workflow-khai-sinh.json';
import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';

export interface AppConfig {
  /** Công tắc bật/tắt chế độ dữ liệu giả lập cho toàn bộ ứng dụng */
  useMockData: boolean;
  
  /** Cấu hình giọng đọc mặc định cho người cao tuổi */
  voiceSettings: {
    languageCode: string;
    northVoice: string; // Giọng Bắc ấm áp
    southVoice: string; // Giọng Nam ấm áp
    speakingRate: number; // 0.9x: chậm rãi, rõ ràng
    pitch: number;
  };

  /** Cấu hình hiển thị chữ mẫu cho người cao tuổi */
  accessibility: {
    redTextColor: string; // #D32F2F (WCAG AAA)
    minFontSizePt: number; // Tối thiểu 18pt
    contrastRatioMin: number; // 7.0:1
  };

  /** Dữ liệu mock nạp sẵn phục vụ dev và test */
  fixtures: {
    manifest: FormGeometricManifest;
    workflow: FormWorkflow;
  };
}

export const APP_CONFIG: AppConfig = {
  // Bật true để Người 2 (FE) code màn hình không cần chờ API Người 3, Người 4
  useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false',

  voiceSettings: {
    languageCode: 'vi-VN',
    northVoice: 'vi-VN-Neural2-A',
    southVoice: 'vi-VN-Neural2-D',
    speakingRate: 0.9,
    pitch: 0.0,
  },

  accessibility: {
    redTextColor: '#D32F2F',
    minFontSizePt: 18,
    contrastRatioMin: 7.0,
  },

  fixtures: {
    manifest: mockManifestJson as unknown as FormGeometricManifest,
    workflow: mockWorkflowJson as unknown as FormWorkflow,
  },
};

/**
 * Registry quản lý tập trung các kịch bản biểu mẫu Mock (Mock Switcher Registry)
 */
export const MOCK_WORKFLOW_REGISTRY: Record<string, FormWorkflow> = {
  tpl_01_lptb: mockWorkflowLptb as unknown as FormWorkflow,
  tpl_03_khai_sinh: mockWorkflowKhaiSinh as unknown as FormWorkflow,
};

/**
 * Trả về kịch bản theo mã templateId, mặc định rơi về tpl_01_lptb
 */
export function getMockWorkflow(templateId: string): FormWorkflow {
  return MOCK_WORKFLOW_REGISTRY[templateId] || MOCK_WORKFLOW_REGISTRY['tpl_01_lptb'];
}
