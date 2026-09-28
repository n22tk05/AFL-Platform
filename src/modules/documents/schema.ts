export const TRAFFIC_FIELDS = {
  recordNumber: 'Số biên bản', recordDate: 'Ngày lập biên bản', citizenName: 'Họ và tên',
  citizenId: 'Số CCCD', address: 'Địa chỉ', vehiclePlate: 'Biển số xe',
  violationDescription: 'Hành vi vi phạm', decisionNumber: 'Số quyết định',
  fineAmount: 'Số tiền phạt', paymentDeadline: 'Hạn nộp phạt',
} as const;
export type TrafficFieldKey = keyof typeof TRAFFIC_FIELDS;
export const CRITICAL_FIELDS = new Set<string>(['citizenId', 'recordNumber', 'fineAmount', 'recordDate']);
export const LEGACY_FIELD_KEYS: Record<string, TrafficFieldKey> = {
  so_bien_ban: 'recordNumber', ngay_lap: 'recordDate', ho_va_ten_nguoi_vi_pham: 'citizenName',
  so_cccd: 'citizenId', dia_chi_thuong_tru: 'address', bien_so_xe: 'vehiclePlate',
  loi_vi_pham: 'violationDescription', so_quyet_dinh: 'decisionNumber', so_tien_phat: 'fineAmount', han_nop_phat: 'paymentDeadline',
};
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['fields'], properties: {
    fields: { type: 'object', additionalProperties: false, properties: Object.fromEntries(
      Object.entries(TRAFFIC_FIELDS).map(([key, label]) => [key, {
        type: 'object', description: label, additionalProperties: false,
        required: ['value', 'rawText', 'confidence', 'evidenceText', 'sourceLineIds'],
        properties: {
          value: { type: [key === 'fineAmount' ? 'number' : 'string', 'null'] },
          rawText: { type: ['string', 'null'] }, confidence: { type: 'number' },
          evidenceText: { type: ['string', 'null'] }, sourceLineIds: { type: 'array', items: { type: 'string' } },
        },
      }]),
    ) },
  },
};
