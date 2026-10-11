import type { FieldCandidate } from '@/modules/opencv/field-types';
import type { DocumentJsonExport, SourceBlock } from '@/shared/document-export.types';
import type { FormGeometricBox, FormInputKind, NormalizedBoundingBox, RegionRole } from '@/shared/contracts';
import { classifyLine } from '@/modules/documents/json-content-classifier';

export interface RecognitionEvidence {
  candidateId: string; pageNumber?: number; role: RegionRole; normalizedCoords: NormalizedBoundingBox; reason: string;
}
interface Anchor {
  key: string; label: string; rect: NormalizedBoundingBox; sourceBlockIds: string[]; estimated: boolean;
}
interface Entry { candidate: FieldCandidate; rect: NormalizedBoundingBox }
interface DetectedField {
  label: string; anchorKey: string; entries: Entry[]; inputKind: FormInputKind; sourceBlockIds: string[]; reasons: string[];
}
export interface TableHeaderContext {
  columns: { left: number; right: number; title: string }[];
}
const STATIC_TYPES = new Set(['national_heading', 'motto', 'document_title', 'document_code', 'date_line', 'section_heading', 'signature_title', 'signature_instruction', 'description_instruction', 'legal_reference']);
const DESCRIPTION_TYPES = new Set(['signature_instruction', 'description_instruction']);
const PRIORITY_REVIEW_REASONS = new Set(['LABEL_POSITION_ESTIMATED', 'OCR_CONFIDENCE_UNAVAILABLE', 'TABLE_ROW_COLUMN_GROUNDING',
  'TABLE_HEADER_CARRIED', 'OPEN_TOP_ROW_INFERRED', 'OPEN_BOTTOM_ROW_INFERRED', 'TABLE_LONG_GRID_CONTINUATION',
  'SHIFTED_MULTILINE_CONTINUATION', 'REPEATED_LABEL_SCOPE_REVIEW', 'ACTOR_SCOPE_INFERRED', 'COLUMN_ACTOR_SCOPE_INFERRED',
  'DATE_PART_SCOPE_INFERRED', 'ADMIN_NUMBER_SCOPE_INFERRED', 'SHORT_GUIDE_GEOMETRY_REVIEW', 'INLINE_DOTTED_SLOT_INFERRED',
  'FRAGMENTED_DOTTED_GUIDE_REVIEW', 'CHECKBOX_QUESTION_SCOPE_INFERRED', 'OCR_LABEL_RECONSTRUCTED_FROM_SAME_ROW_DATE_CONTEXT', 'AMBIGUOUS_LABEL', 'AMBIGUOUS_ROLE',
  'MISSING_LABEL', 'DUPLICATE_LABEL_NOT_A_CONTINUATION']);
const TABLE_HEADER = /^(?:STT|TT|Thông tin|Bên nam|Bên nữ|Họ(?:,?\s+chữ\s+đệm|\s+và)?\s+tên|Họ,?\s+chữ\s+đệm|Tên (?:vật liệu|ngành)|Đơn vị|Khối lượng|Ghi chú|Có|Không|Các dạng|Các hoạt động|Mức độ|(?:Ngày.*)?năm sinh|Giới(?:\s+tính)?|Số định danh|Mã.*thuế|Tỷ lệ|Số thuế|Mối quan hệ|Chữ ký)/iu;
const CHOICE_HEADER = /^(?:Có|Không|Thực hiện được|Không thực hiện|Không xác định)/iu;
const TRAILING_CHOICE_GLYPH = /^(Có|Không|Nam|Nữ)\s+[LIl1|]$/iu;
const SIMPLE_CHOICE = /^(?:Có|Không|Nam|Nữ)$/iu;
const DATE_PART = /^[-•]?\s*(ngày|tháng|năm)\s*[.…_]*$/iu;
const SECTION_PROMPT = /^Đề nghị\s+cơ\s+quan\s+.{5,120}\s+(?:sau|dưới)\s+đây\s*:?$/iu;
const COLUMN_ACTOR_NAME = /^Họ(?:,?\s+chữ\s+(?:đệm|dệm))?,?\s+tên\s+bên\s+(nữ|nam)\s*:?$/iu;
const STATIC_RECIPIENT_LABEL = /^Kính\s+gửi\b/iu;
const GENERIC_ACTOR_LABEL = /^(?:Họ(?:,?\s+chữ\s+(?:đệm|dệm))?,?\s+tên|Ngày,?\s+tháng,?\s+năm\s+sinh|Năm\s+sinh|Giới\s+tính|Dân\s+tộc|Quốc\s+tịch|Nơi\s+sinh|Quê\s+quán|Nơi\s+cư\s+trú|Giấy\s+tờ\s+tùy\s+thân)$/iu;
const UNPUNCTUATED_LABEL = /^(?:[-•]\s*)?(?:[.\-\s]*\d{1,2}[.)]?\s*)?(Họ(?:,?\s+chữ\s+đệm|\s+và)?\s+tên(?:\s*\([^)]{1,30}\))?|Người\s+nộp\s+thuế|Sinh\s+ngày|Nơi\s+sinh(?:\s*\([^)]{1,30}\))?|Số\s+(?:ĐDCN\s*\/\s*CMND|CCCD|định\s+danh\s+cá\s+nhân)(?:\s*\(\d+\))?|Dân\s+tộc|Tôn\s+giáo|Số\s+điện\s+thoại(?:\s+liên\s+hệ)?|Địa\s+chỉ\s+đăng\s+ký\s+(?:thường|tạm)\s+trú|Nghề\s+nghiệp|Tên\s+và\s+địa\s+chỉ\s+cơ\s+quan(?:\s*\([^)]{1,30}\))?|Nội\s+dung\s+đề\s+nghị(?:\s*\(\d+\))?)[\s.:…_]*$/iu;
const normalizeText = (text: string) => text.trim().normalize('NFC').replace(/chữ\s+dệm/giu, 'chữ đệm').replace(/\s+/gu, ' ');
const normalizeOutputLabel = (label: string) => normalizeText(label)
  .replace(/(?:[.…_]\s*){2,}$/u, '')
  .replace(/^[.…_]+\s+(?=\p{L})/u, '')
  .replace(/DDCN/gu, 'ĐDCN')
  .trim();
const normalizeTableHeaderText = (text: string) => normalizeText(text)
  .replace(/\s*\((?:trường hợp|(?:chi\s+)?chi tiết|ghi chú|lưu ý)\b[^)]*(?:\)|$)/giu, '')
  .replace(/\s*\(\d+\)\s*$/u, '')
  .replace(/\s*\/\s*/gu, '/')
  .replace(/số diện thoại/giu, 'số điện thoại')
  .replace(/loại trọ cấp/giu, 'Loại trợ cấp')
  .replace(/bhxh/giu, 'BHXH').trim();
export const prioritizedReviewReasons = (reasons: string[] | undefined) => (reasons ?? []).filter(reason => PRIORITY_REVIEW_REASONS.has(reason));
export function nextPriorityReviewIndex(boxes: (Pick<FormGeometricBox, 'rawText'> & {
  recognition?: Pick<NonNullable<FormGeometricBox['recognition']>, 'status'>;
})[], selectedIndex: number): number | undefined {
  const priorityIndices = boxes.flatMap((box, index) => box.recognition?.status === 'needs_review' || !box.rawText ? [index] : []);
  if (!priorityIndices.length) return undefined;
  return priorityIndices.find(index => index > selectedIndex) ?? priorityIndices[0];
}
function hasPrintedRecipientValue(block: SourceBlock): boolean {
  if (!STATIC_RECIPIENT_LABEL.test(normalizeText(block.text))) return false;
  const recipientText = normalizeText(block.text).replace(STATIC_RECIPIENT_LABEL, '')
    .replace(/^\s*[:：]?\s*/u, '').replace(/^\(\d+\)\s*/u, '').replace(/^[.…_\s]+/u, '').trim();
  return /[\p{L}\p{N}]/u.test(recipientText);
}
function recipientPlaceholderLabel(block: SourceBlock): string | undefined {
  const recipientText = normalizeText(block.text).replace(STATIC_RECIPIENT_LABEL, '')
    .replace(/^\s*[:：]?\s*/u, '').replace(/^\(\d+\)\s*/u, '').trim();
  return /^\(([^)]{3,120})\)[.…_\s]*$/u.exec(recipientText)?.[1]?.trim();
}
function isLocalConstructionRecipient(block: SourceBlock): boolean {
  return /^Kính\s+gửi\s*[:：]?\s*Sở\s+Xây\s+dựng[.…_\s]*$/iu.test(normalizeText(block.text));
}
function isFootnoteSeparator(entry: Entry, blocks: SourceBlock[]): boolean {
  if (entry.candidate.source !== 'writing_guide' || entry.candidate.guideStyle !== 'underline') return false;
  return blocks.some(block => {
    if (!/^(?:[?*¹²³⁴⁵⁶⁷⁸⁹⁰]\s*)?(?:Trường hợp|Ghi chú|Chú thích)\b/iu.test(normalizeText(block.text))) return false;
    const footnote = xyxy(block);
    const gap = footnote[0] - entry.rect[2];
    return gap >= -0.002 && gap <= 0.02
      && overlapX(entry.rect, footnote) / Math.min(rectWidth(entry.rect), rectWidth(footnote)) >= 0.6;
  });
}
function copyRequestOption(text: string): string | undefined {
  const normalized = normalizeText(text);
  const optionMatch = /(?:^|[\s([(%])(Có|Không|Nam|Nữ)(?:\s*[LIl1|])?\s*$/iu.exec(normalized);
  if (!optionMatch) return undefined;
  const questionPrefix = normalized.slice(0, optionMatch.index).replace(/^mình\s+/iu, '').replace(/[([%.,;:…_\s]+$/u, '').trim();
  if (!/^đề nghị\s+cấp\s+bản\s+sao$/iu.test(questionPrefix)) return undefined;
  return optionMatch[1][0].toLocaleUpperCase('vi-VN') + optionMatch[1].slice(1).toLocaleLowerCase('vi-VN');
}

function checkboxOptionLabel(text: string): string {
  const normalized = normalizeText(text.split(':').at(-1) ?? text)
    .replace(/^[☐☑☒□\[\]\s]+/u, '').replace(/^[xX1Il|oO0ỞỜ]\s+(?=\p{L})/u, '');
  const copyOption = copyRequestOption(text);
  if (copyOption) return copyOption;
  return normalized.replace(TRAILING_CHOICE_GLYPH, (_, option: string) => option[0].toLocaleUpperCase('vi-VN') + option.slice(1).toLocaleLowerCase('vi-VN'));
}
const centerY = (rect: NormalizedBoundingBox) => (rect[0] + rect[2]) / 2;
const centerX = (rect: NormalizedBoundingBox) => (rect[1] + rect[3]) / 2;
const rectHeight = (rect: NormalizedBoundingBox) => rect[2] - rect[0];
const rectWidth = (rect: NormalizedBoundingBox) => rect[3] - rect[1];
const area = (rect: NormalizedBoundingBox) => rectWidth(rect) * rectHeight(rect);
const overlapX = (first: NormalizedBoundingBox, second: NormalizedBoundingBox) => Math.max(0, Math.min(first[3], second[3]) - Math.max(first[1], second[1]));
const overlapY = (first: NormalizedBoundingBox, second: NormalizedBoundingBox) => Math.max(0, Math.min(first[2], second[2]) - Math.max(first[0], second[0]));
const coverage = (first: NormalizedBoundingBox, second: NormalizedBoundingBox) => overlapX(first, second) * overlapY(first, second) / Math.max(area(first), 1e-8);
const xyxy = (block: SourceBlock): NormalizedBoundingBox => [block.bbox![1], block.bbox![0], block.bbox![3], block.bbox![2]];

function administrativeDateCaption(blocks: SourceBlock[]): { line: SourceBlock; number: SourceBlock } | undefined {
  return blocks.flatMap(line => {
    if (!/^ngày[.…_]{2,}\s+tháng[.…_]{2,}\s+năm[.…_]{2,}$/iu.test(normalizeText(line.text))) return [];
    const lineRect = xyxy(line);
    const number = blocks.find(block => {
      const rect = xyxy(block);
      if (!/^(?:Văn bản\s+)?Số\s*:/iu.test(normalizeText(block.text))) return false;
      const above = rect[2] <= lineRect[0] + 0.005 && lineRect[0] - rect[2] <= 0.03
        && overlapX(rect, lineRect) > 0.05;
      const beside = lineRect[0] < 0.2 && rect[3] <= lineRect[1] - 0.05
        && lineRect[1] - rect[3] <= 0.3
        && Math.abs(centerY(rect) - centerY(lineRect)) <= 0.025;
      return above || beside;
    });
    return number ? [{ line, number }] : [];
  })[0];
}

function hasAdministrativeNumberContext(entry: Entry, blocks: SourceBlock[]): boolean {
  const caption = administrativeDateCaption(blocks);
  if (!caption) return false;
  const printed = xyxy(caption.number);
  const dateLine = xyxy(caption.line);
  if (printed[3] < dateLine[1] - 0.05) return Math.abs(centerY(printed) - centerY(entry.rect)) <= 0.02
    && entry.rect[1] >= printed[1] + 0.02 && entry.rect[3] <= printed[3] + 0.01;
  return Math.abs(centerY(printed) - centerY(entry.rect)) <= 0.02
    && entry.rect[1] >= printed[1] + rectWidth(printed) * 0.5
    && entry.rect[3] <= printed[3] + 0.01;
}

function hasFusedDateContext(entry: Entry, blocks: SourceBlock[]): boolean {
  const administrative = administrativeDateCaption(blocks);
  return blocks.some(block => {
    const text = normalizeText(block.text);
    const lineRect = xyxy(block);
    if (Math.abs(centerY(lineRect) - centerY(entry.rect)) > 0.02
      || overlapX(lineRect, entry.rect) / Math.min(rectWidth(lineRect), rectWidth(entry.rect)) < 0.5) return false;
    if (/ngày[.…_\s-]{2,20}tháng[.…_\s-]{2,20}năm/iu.test(text)) {
      if (administrative?.line === block) return true;
      return blocks.some(context => /^Làm tại\s*:/iu.test(normalizeText(context.text))
        && xyxy(context)[3] <= lineRect[1] + 0.02
        && Math.abs(centerY(xyxy(context)) - centerY(lineRect)) <= 0.02);
    }
    return /^tháng[.…_\s-]+năm/iu.test(text) && blocks.some(context => /^cấp ngày[.…_\s-]*$/iu.test(normalizeText(context.text))
      && xyxy(context)[3] <= lineRect[1] + 0.02
      && Math.abs(centerY(xyxy(context)) - centerY(lineRect)) <= 0.02);
  });
}

function inlineDottedGuideLabels(entries: Entry[], blocks: SourceBlock[]): Map<string, { block: SourceBlock; label: string; slot: number }> {
  const labels = new Map<string, { block: SourceBlock; label: string; slot: number }>();
  for (const block of blocks) {
    if (block.confidence === null || block.confidence === undefined || block.confidence < 0.6) continue;
    const text = block.text.normalize('NFC');
    if (/^(?:[-•]\s*)?Lưu\s*:\s*VT\b/iu.test(text)) continue;
    if (/ngày[.…_\s-]{2,20}tháng[.…_\s-]{2,20}năm/iu.test(text)
      || /^tháng[.…_\s-]+năm/iu.test(text)) continue;
    const printed = xyxy(block);
    if (/ngày\s+cấp\b[\s.…_/()-]*nơi\s+cấp\b/iu.test(text)) {
      const datePlaceGuides = entries.filter(entry => entry.candidate.source === 'writing_guide'
        && entry.candidate.guideStyle === 'dotted'
        && Math.abs(centerY(entry.rect) - centerY(printed)) <= Math.min(rectHeight(entry.rect), rectHeight(printed)) * 0.5
        && entry.rect[1] >= printed[1] - 0.01 && entry.rect[1] <= printed[3] + 0.025)
        .sort((first, second) => first.rect[1] - second.rect[1]);
      if (datePlaceGuides.length === 2) {
        ['Ngày cấp', 'Nơi cấp'].forEach((label, index) => {
          if (!labels.has(datePlaceGuides[index].candidate.candidateId)) {
            labels.set(datePlaceGuides[index].candidate.candidateId, { block, label, slot: index });
          }
        });
        continue;
      }
    }
    const precedingDecision = blocks.find(previous => previous !== block
      && /số[.…_\s-]{2,20}ngày[.…_\s-]{2,20}tháng/iu.test(previous.text)
      && centerY(xyxy(previous)) < centerY(xyxy(block))
      && xyxy(previous)[2] <= xyxy(block)[0] + 0.012
      && xyxy(block)[0] - xyxy(previous)[2] <= 0.03);
    const wrappedDate = /^năm[.…_]{2,}/iu.test(text) && !!precedingDecision;
    const decisionDate = /số[.…_\s-]{2,20}ngày[.…_\s-]{2,20}tháng/iu.test(text) || wrappedDate;
    const decisionContext = wrappedDate ? precedingDecision?.text ?? '' : text;
    if (STATIC_TYPES.has(classifyLine(block.text).type) && !decisionDate) continue;
    const blanks = [...text.matchAll(decisionDate ? /[.…_]{2,}/gu : /[.…_]{3,}/gu)];
    if (!blanks.length || blanks.length > 10) continue;
    const guides = entries.filter(entry => entry.candidate.source === 'writing_guide'
      && entry.candidate.guideStyle === 'dotted'
      && Math.abs(centerY(entry.rect) - centerY(printed)) <= Math.min(rectHeight(entry.rect), rectHeight(printed)) * 0.5
      && entry.rect[1] >= printed[1] - 0.01 && entry.rect[3] <= printed[3] + 0.01)
      .sort((first, second) => first.rect[1] - second.rect[1]);
    if (guides.length !== blanks.length) continue;
    blanks.forEach((blank, index) => {
      if (!guides[index].candidate.shortGuide) return;
      const preceding = normalizeText(text.slice(index ? blanks[index - 1].index! + blanks[index - 1][0].length : 0, blank.index));
      const words = [...preceding.matchAll(/\p{L}+/gu)].map(match => match[0]);
      const last = words.at(-1)?.toLocaleLowerCase('vi-VN');
      let label = words.slice(-3).join(' ');
      if (last === 'từ' && /thời\s+gian\s+từ$/iu.test(preceding)) label = 'Thời gian từ';
      else if (last === 'đến' && /thời\s+gian\s+từ[.…_]{3,}/iu.test(text)) label = 'Thời gian đến';
      else if (/công\s+việc$/iu.test(preceding)) label = 'Công việc';
      else if (decisionDate && /quyết\s+định/iu.test(decisionContext)) {
        if (last === 'số') label = 'Số quyết định';
        else if (last === 'ngày') label = 'Ngày quyết định';
        else if (last === 'tháng') label = 'Tháng quyết định';
        else if (last === 'năm') label = 'Năm quyết định';
      }
      const dateLabel = /^(?:Số|Ngày|Tháng|Năm) quyết định$/u.test(label);
      if ((words.length < 2 && label !== 'Thời gian đến' && !dateLabel)
        || !words.some(word => word.length >= 3) && !dateLabel || !label) return;
      if (!labels.has(guides[index].candidate.candidateId)) labels.set(guides[index].candidate.candidateId, { block, label, slot: index });
    });
  }
  return labels;
}

function isDottedBridge(entry: Entry, entries: Entry[], blocks: SourceBlock[]): boolean {
  if (entry.candidate.source !== 'writing_guide' || entry.candidate.guideStyle !== 'dotted'
    || !entry.candidate.shortGuide || rectWidth(entry.rect) > 0.04) return false;
  const aligned = (other: Entry) => other.candidate.source === 'writing_guide'
    && other.candidate.guideStyle === 'dotted' && !other.candidate.shortGuide
    && Math.abs(centerY(other.rect) - centerY(entry.rect)) <= Math.min(rectHeight(other.rect), rectHeight(entry.rect)) * 0.5;
  const left = entries.filter(other => aligned(other) && other.rect[3] <= entry.rect[1]
    && entry.rect[1] - other.rect[3] <= 0.025).sort((first, second) => second.rect[3] - first.rect[3])[0];
  const right = entries.filter(other => aligned(other) && other.rect[1] >= entry.rect[3]
    && other.rect[1] - entry.rect[3] <= 0.025).sort((first, second) => first.rect[1] - second.rect[1])[0];
  if (!left || !right) return false;
  return !blocks.some(block => {
    const printed = xyxy(block);
    return /\p{L}{2}/u.test(block.text)
      && Math.abs(centerY(printed) - centerY(entry.rect)) <= Math.max(rectHeight(printed), rectHeight(entry.rect)) * 0.8
      && printed[1] >= left.rect[3] - 0.005 && printed[3] <= right.rect[1] + 0.005;
  });
}

function hasAdjacentShortGuideAnchor(entry: Entry, entries: Entry[], anchors: Anchor[]): boolean {
  if (entry.candidate.source !== 'writing_guide' || !entry.candidate.shortGuide) return false;
  const rowHeight = Math.max(rectHeight(entry.rect), 0.005);
  const cluster = new Set([entry]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const other of entries) {
      if (cluster.has(other) || other.candidate.source !== 'writing_guide' || !other.candidate.shortGuide
        || Math.abs(centerY(other.rect) - centerY(entry.rect)) > rowHeight * 0.8) continue;
      if ([...cluster].some(item => Math.abs(centerY(item.rect) - centerY(other.rect)) <= rowHeight * 0.8
        && (item.rect[1] >= other.rect[3] && item.rect[1] - other.rect[3] <= 0.15
          || other.rect[1] >= item.rect[3] && other.rect[1] - item.rect[3] <= 0.15))) {
        cluster.add(other);
        expanded = true;
      }
    }
  }
  const firstGuide = Math.min(...[...cluster].map(item => item.rect[1]));
  return anchors.some(anchor => {
    const gap = firstGuide - anchor.rect[3];
    return Math.abs(centerY(anchor.rect) - centerY(entry.rect)) <= rowHeight * 0.8
      && gap >= -0.1 && gap <= 0.15
      && !anchors.some(other => other !== anchor && Math.abs(centerY(other.rect) - centerY(entry.rect)) <= rowHeight * 0.8
        && other.rect[1] >= anchor.rect[3] && other.rect[1] < firstGuide)
      && /\p{L}{2}/u.test(anchor.label) && !STATIC_TYPES.has(classifyLine(anchor.label).type);
  });
}

function sourceAnchors(document: DocumentJsonExport, blocks: SourceBlock[]): Anchor[] {
  const fields = [...document.structure.fields, ...document.structure.checkboxes];
  const anchors: Anchor[] = [];
  for (const field of fields) {
    const label = normalizeText(field.label);
    const blocksForField = blocks.filter(item => field.sourceBlockIds.includes(item.id));
    if (!/[\p{L}\p{N}]/u.test(label) || SECTION_PROMPT.test(label)
      || STATIC_RECIPIENT_LABEL.test(label) && blocksForField.some(hasPrintedRecipientValue)) continue;
    for (const block of blocksForField) {
      const siblings = fields.filter(item => item.sourceBlockIds.includes(block.id));
      const rect = xyxy(block);
      const text = block.text.normalize('NFC');
      const start = text.indexOf(field.label.normalize('NFC'));
      if (siblings.length > 1 && start >= 0) {
        const left = rect[1];
        rect[1] = left + rectWidth(rect) * start / Math.max(text.length, 1);
        rect[3] = left + (block.bbox![2] - block.bbox![0]) * (start + field.label.normalize('NFC').length) / Math.max(text.length, 1);
      }
      anchors.push({ key: `${field.sourceBlockIds.join('|')}:${label}`, label, rect,
        sourceBlockIds: [...field.sourceBlockIds], estimated: siblings.length > 1 });
    }
  }
  for (const block of blocks) {
    if (anchors.some(anchor => anchor.sourceBlockIds.includes(block.id))) continue;
    const corruptedFootnote = /[:：]\s*C\d{1,2}\)\s*$/iu.test(block.text);
    const fieldText = block.text.replace(/[:：]?\s*\(\d+\)\s*$/u, ':')
      .replace(/^[.…_\s]+(?=\[?\s*\d)/u, '')
      .replace(/[:：]\s*C\d{1,2}\)\s*$/iu, ':');
    const generic = /^\s*(?:\[\d+(?:\.\d+)*\]\s*|\d+(?:\.\d+)*[.)]\s*|[-•]\s*)?([^:]{2,90}):\s*[._…\s]*$/u.exec(fieldText);
    const unpunctuated = UNPUNCTUATED_LABEL.exec(fieldText);
    const numbered = /^\s*(?:\[\s*)?\d+(?:\.\d+)*\s*[\]).,]*\s+([\p{L}][\p{L}\p{M}\s,()/\-]{1,79})\s*[:：.…_]*$/u.exec(fieldText);
    const columnActorName = COLUMN_ACTOR_NAME.exec(normalizeText(fieldText));
    const normalizedFieldText = normalizeText(fieldText);
    const applicantName = /^Tôi là(?=$|[\s'’]).*(?:ghi họ tên|họ tên)/iu.test(normalizedFieldText);
    const birthDateLabel = /^(Ngày,?\s*tháng,?\s*năm\s+sinh)\s*[:：]/iu.exec(normalizedFieldText)?.[1];
    const label = generic?.[1] ?? unpunctuated?.[1] ?? numbered?.[1] ?? columnActorName?.[0].replace(/:\s*$/u, '')
      ?? birthDateLabel ?? (applicantName ? normalizedFieldText.replace(/^Tôi là['’]?\s*/iu, 'Tôi là ')
        .replace(/[;:]+$/u, '').trim() : undefined);
    const recognizedFieldLabel = !!generic || !!unpunctuated || !!numbered || !!columnActorName || !!birthDateLabel || applicantName;
    if (label && (!STATIC_TYPES.has(classifyLine(block.text).type) || recognizedFieldLabel)
      && !(STATIC_RECIPIENT_LABEL.test(normalizeText(label)) && hasPrintedRecipientValue(block)) && !SECTION_PROMPT.test(normalizeText(label))
      && !/^(?:Chú thích|Ghi chú|Lưu ý|Ví dụ|Tôi.*cam đoan)/iu.test(label)) {
      anchors.push({ key: block.id, label: normalizeText(label.replace(/\(\d+\)$/u, '')), rect: xyxy(block), sourceBlockIds: [block.id], estimated: corruptedFootnote });
    }
  }
  return anchors;
}

function blocksInside(entry: Entry, blocks: SourceBlock[]): SourceBlock[] {
  return blocks.filter(block => coverage(xyxy(block), entry.rect) >= 0.65)
    .sort((first, second) => xyxy(first)[0] - xyxy(second)[0] || xyxy(first)[1] - xyxy(second)[1]);
}

function isInlineLabelBoundary(previous: NormalizedBoundingBox, next: NormalizedBoundingBox, blocks: SourceBlock[], numberedOnly = false): boolean {
  return blocks.some(block => {
    const printed = xyxy(block);
    const text = normalizeText(block.text);
    const containsNumberedFieldLabel = /(?:\[\s*\d+(?:\.\d+)*\s*[\]).,]*|\b\d+(?:\.\d+)*[\]).,])\s*[\p{L}][^:：]{1,60}[:：]/u.test(text);
    return printed[0] >= previous[2] - 0.001 && printed[0] < next[2] && printed[2] > next[0]
      && overlapX(printed, next) > 0 && printed[1] < next[1]
      && next[1] - printed[3] <= 0.025 && (numberedOnly ? containsNumberedFieldLabel : text.length <= 60 || containsNumberedFieldLabel)
      && /\p{L}{3}/u.test(text);
  });
}

function isGroupedCheckboxOption(entry: Entry, entries: Entry[], blocks: SourceBlock[]): boolean {
  if (entry.candidate.source !== 'checkbox') return false;
  const hasAdjacentOptionText = (rect: NormalizedBoundingBox) => blocks.some(block => {
    const printed = xyxy(block);
    const text = normalizeText(block.text);
    const wordCount = text.match(/\p{L}+/gu)?.length ?? 0;
    const gap = printed[1] - rect[3];
    return wordCount >= 2 && !STATIC_TYPES.has(classifyLine(block.text).type)
      && Math.abs(centerY(printed) - centerY(rect)) <= Math.max(rectHeight(printed), rectHeight(rect)) * 0.8
      && gap >= -0.04 && gap <= 0.04;
  });
  const questionAbove = blocks.some(block => {
    const printed = xyxy(block);
    const text = normalizeText(block.text);
    return /^\[\s*\d+(?:\.\d+)*\]/u.test(text) && printed[2] <= entry.rect[0] + 0.01
      && entry.rect[0] - printed[2] <= 0.12 && overlapX(printed, entry.rect) > 0;
  });
  if (!questionAbove || !hasAdjacentOptionText(entry.rect)) return false;
  const options = entries.filter(candidate => candidate.candidate.source === 'checkbox'
    && Math.abs(centerX(candidate.rect) - centerX(entry.rect)) <= Math.max(rectWidth(candidate.rect), rectWidth(entry.rect)) * 0.8
    && Math.abs(centerY(candidate.rect) - centerY(entry.rect)) >= 0.01
    && Math.abs(centerY(candidate.rect) - centerY(entry.rect)) <= 0.06
    && hasAdjacentOptionText(candidate.rect));
  return options.length >= 2;
}

function normalizeActorBaseLabel(label: string): string {
  return label.replace(/^[-•]\s*/u, '').replace(/[:：.…]+$/u, '').trim();
}

function inferBirthDateWordsLabel(fields: DetectedField[], blocks: SourceBlock[]) {
  const dateLabels = blocks.filter(block => /^Ngày,?\s*tháng,?\s*năm\s+sinh\s*[:：]?$/iu.test(normalizeText(block.text)));
  const wordsLabels = blocks.filter(block => /^nghi\s+bằng\s+chữ\s*[:：]?$/iu.test(normalizeText(block.text)));
  for (const wordsBlock of wordsLabels) {
    const wordsRect = xyxy(wordsBlock);
    const dateBlock = dateLabels.find(block => {
      const rect = xyxy(block);
      return Math.abs(centerY(rect) - centerY(wordsRect)) <= 0.02
        && rect[1] < wordsRect[1] && wordsRect[1] - rect[3] <= 0.35;
    });
    if (!dateBlock) continue;
    const dateRect = xyxy(dateBlock);
    const wordsField = fields.find(field => normalizeActorBaseLabel(field.label).toLocaleLowerCase('vi-VN') === 'nghi bằng chữ'
      && field.sourceBlockIds.includes(wordsBlock.id) && field.entries.length === 1
      && field.entries[0].candidate.source === 'writing_guide'
      && Math.abs(centerY(field.entries[0].rect) - centerY(wordsRect)) <= 0.02
      && field.entries[0].rect[1] >= wordsRect[3] - 0.02);
    const wordsFieldLeft = wordsField?.entries[0].rect[1];
    const dateField = fields.find(field => normalizeActorBaseLabel(field.label).toLocaleLowerCase('vi-VN') === 'ngày, tháng, năm sinh'
      && field.entries.length === 1 && field.entries[0].candidate.source === 'writing_guide'
      && Math.abs(centerY(field.entries[0].rect) - centerY(dateRect)) <= 0.02
      && field.entries[0].rect[1] >= dateRect[1] - 0.01
      && wordsFieldLeft !== undefined && field.entries[0].rect[1] < wordsFieldLeft);
    if (!wordsField || !dateField) continue;
    wordsField.label = 'Ngày sinh ghi bằng chữ';
    wordsField.sourceBlockIds.push(dateBlock.id);
    wordsField.reasons.push('OCR_LABEL_RECONSTRUCTED_FROM_SAME_ROW_DATE_CONTEXT');
  }
}

function checkboxQuestion(blocks: SourceBlock[], option: SourceBlock): { label: string; block: SourceBlock } | undefined {
  if (!SIMPLE_CHOICE.test(checkboxOptionLabel(option.text))) return undefined;
  const optionRect = xyxy(option);
  return blocks.flatMap(block => {
    const text = normalizeText(block.text);
    const separator = text.lastIndexOf(':');
    if (!SIMPLE_CHOICE.test(checkboxOptionLabel(text))) return [];
    const copyRequest = !!copyRequestOption(text);
    if (separator < 0 && !copyRequest) return [];
    const label = copyRequest ? 'Đề nghị cấp bản sao'
      : normalizeText(text.slice(0, separator).replace(/\s*\([^)]{1,8}\)\s*$/u, '').replace(/^(?:[-•]\s*)?\d{1,3}[.)]\s*/u, ''));
    if (label.length < 4 || label.length > 90 || !/\p{L}{3}/u.test(label)) return [];
    const rect = xyxy(block);
    const nearbyCopyOption = copyRequest && rect[2] <= optionRect[0] + 0.005 && optionRect[0] - rect[2] <= 0.02
      && overlapX(rect, optionRect) > 0;
    if (block !== option && !nearbyCopyOption && (rect[3] > optionRect[1] + 0.005 || optionRect[1] - rect[3] > 0.1
      || Math.abs(centerY(rect) - centerY(optionRect)) > Math.max(rectHeight(rect), rectHeight(optionRect)) * 0.8)) return [];
    return [{ label, block, gap: block === option ? -1 : optionRect[1] - rect[3] }];
  }).sort((first, second) => first.gap - second.gap)[0];
}

function checkboxOptionContinuation(blocks: SourceBlock[], option: SourceBlock): SourceBlock | undefined {
  const text = checkboxOptionLabel(option.text);
  if (text.length < 65) return undefined;
  const rect = xyxy(option);
  return blocks.filter(block => {
    if (block === option || !/\p{L}{3}/u.test(block.text) || STATIC_TYPES.has(classifyLine(block.text).type)) return false;
    const next = xyxy(block);
    const gap = next[0] - rect[2];
    return gap >= -0.005 && gap <= 0.02 && Math.abs(next[1] - rect[1]) <= 0.02
      && normalizeText(block.text).length >= 4 && normalizeText(block.text).length <= 90
      && !/^(?:\[?\d|[-•]|[oO0ỞỜ]\s)/u.test(normalizeText(block.text));
  }).sort((first, second) => xyxy(first)[0] - xyxy(second)[0])[0];
}

function inferActorScopes(fields: DetectedField[], blocks: SourceBlock[]) {
  const scopeHeaders = blocks.flatMap(block => {
    const text = normalizeText(block.text);
    const person = /^Họ[^:]{0,70}tên\s+người\s+(mẹ|cha|yêu\s+cầu)\s*:?$/iu.exec(text);
    const deathScope = /^Đề nghị[^:]{0,160}khai tử cho người có tên dưới đây\s*:/iu.test(text);
    const birthScope = /^Đề nghị[^:]{0,120}đăng ký khai sinh cho người dưới đây\s*:/iu.test(text);
    const role = person ? `người ${person[1]}`
      : deathScope ? 'người đã chết'
        : birthScope ? 'người được khai sinh' : '';
    return role ? [{ block, sourceBlockIds: [block.id], role,
      grounded: deathScope || birthScope || !!person, rect: xyxy(block) }] : [];
  }).sort((first, second) => first.rect[0] - second.rect[0]);
  const appendPairedScope = (lead: SourceBlock, continuation: SourceBlock, role: string) => {
    const leadRect = xyxy(lead);
    const continuationRect = xyxy(continuation);
    scopeHeaders.push({ block: continuation, sourceBlockIds: [lead.id, continuation.id], role, grounded: true,
      rect: [Math.min(leadRect[0], continuationRect[0]), Math.min(leadRect[1], continuationRect[1]),
        Math.max(leadRect[2], continuationRect[2]), Math.max(leadRect[3], continuationRect[3])] as NormalizedBoundingBox });
  };
  for (const continuation of blocks.filter(block => /^cho người dưới đây\s*:?$/iu.test(normalizeText(block.text)))) {
    const rect = xyxy(continuation);
    const lead = blocks.filter(block => {
      const text = normalizeText(block.text);
      const leadRect = xyxy(block);
      return /^Đề nghị[^:]{0,140}ghi vào Sổ hộ tịch việc\s*(?:\(\d+\))?$/iu.test(text)
        && leadRect[2] <= rect[0] && rect[0] - leadRect[2] <= 0.04
        && Math.abs(leadRect[1] - rect[1]) <= 0.02;
    }).sort((first, second) => xyxy(second)[2] - xyxy(first)[2])[0];
    if (lead) appendPairedScope(lead, continuation, 'người dưới đây');
  }
  for (const continuation of blocks.filter(block => /^của người có tên dưới đây\s*:?$/iu.test(normalizeText(block.text)))) {
    const rect = xyxy(continuation);
    const lead = blocks.filter(block => {
      const leadRect = xyxy(block);
      return /^Là\s*[:：]/iu.test(normalizeText(block.text))
        && Math.abs(centerY(leadRect) - centerY(rect)) <= 0.02
        && leadRect[3] <= rect[1] + 0.01;
    }).sort((first, second) => rect[1] - xyxy(first)[3] - (rect[1] - xyxy(second)[3]))[0];
    if (lead) appendPairedScope(lead, continuation, 'người có tên dưới đây');
  }
  scopeHeaders.sort((first, second) => first.rect[0] - second.rect[0]);
  for (const field of fields) {
    const baseLabel = normalizeActorBaseLabel(field.label);
    if (!['single_line_text', 'multiline_text'].includes(field.inputKind) || !GENERIC_ACTOR_LABEL.test(baseLabel)) continue;
    const fieldTop = field.entries[0].rect[0];
    const scope = scopeHeaders.filter(header => header.rect[0] <= fieldTop + 0.003
      && fieldTop - header.rect[2] <= 0.15).at(-1);
    if (!scope || blocks.some(block => !scope.sourceBlockIds.includes(block.id) && xyxy(block)[0] > scope.rect[2] + 0.005
      && xyxy(block)[2] < fieldTop - 0.005 && classifyLine(block.text).type === 'section_heading')) continue;
    field.label = `${baseLabel} ${scope.role}`;
    field.sourceBlockIds.push(...scope.sourceBlockIds);
    field.reasons.push(scope.grounded ? 'ACTOR_SCOPE_GROUNDED' : 'ACTOR_SCOPE_INFERRED');
  }
}

function inferColumnActorScopes(fields: DetectedField[], blocks: SourceBlock[]) {
  const headers = blocks.flatMap(block => {
    const role = COLUMN_ACTOR_NAME.exec(normalizeText(block.text))?.[1];
    return role ? [{ block, role: `bên ${role}`, rect: xyxy(block) }] : [];
  });
  const pairs = headers.flatMap((first, index) => headers.slice(index + 1).flatMap(second => {
    if (first.role === second.role || Math.abs(centerY(first.rect) - centerY(second.rect)) > 0.02
      || Math.abs(first.rect[1] - second.rect[1]) < 0.15) return [];
    return [first.rect[1] < second.rect[1] ? { left: first, right: second } : { left: second, right: first }];
  }));
  for (const field of fields) {
    const baseLabel = normalizeActorBaseLabel(field.label);
    if (!['single_line_text', 'multiline_text'].includes(field.inputKind) || !GENERIC_ACTOR_LABEL.test(baseLabel)) continue;
    const rect = field.entries[0].rect;
    const pair = pairs.filter(item => rect[0] >= Math.max(item.left.rect[2], item.right.rect[2]) - 0.005
      && rect[0] - Math.max(item.left.rect[2], item.right.rect[2]) <= 0.22)
      .sort((first, second) => second.left.rect[0] - first.left.rect[0])[0];
    if (!pair) continue;
    const header = rect[1] < pair.right.rect[1] - 0.005 && rect[3] <= pair.right.rect[1] + 0.02
      ? pair.left : rect[1] >= pair.right.rect[1] - 0.005 ? pair.right : undefined;
    if (!header) continue;
    const otherHeader = header === pair.left ? pair.right : pair.left;
    const pairedField = fields.some(other => {
      if (other === field || other.inputKind !== field.inputKind
        || normalizeActorBaseLabel(other.label.replace(/\s+bên\s+(?:nam|nữ)$/iu, '')) !== baseLabel) return false;
      const otherRect = other.entries[0].rect;
      const sameRow = Math.abs(centerY(rect) - centerY(otherRect)) <= 0.025;
      const oppositeColumn = otherHeader === pair.right
        ? otherRect[1] >= pair.right.rect[1] - 0.02
        : otherRect[3] <= pair.right.rect[1] + 0.02;
      return sameRow && oppositeColumn;
    });
    field.label = `${baseLabel} ${header.role}`;
    field.sourceBlockIds.push(header.block.id);
    field.reasons.push(pairedField ? 'COLUMN_ACTOR_SCOPE_GROUNDED' : 'COLUMN_ACTOR_SCOPE_INFERRED');
  }
}

function splitRegistrationDateGuides(fields: DetectedField[], blocks: SourceBlock[]) {
  const registration = blocks.find(block => /^Đã đăng ký kết hôn tại\b/iu.test(normalizeText(block.text)));
  const day = blocks.find(block => /^cấp ngày[.…_\s-]*$/iu.test(normalizeText(block.text)));
  if (!registration || !day) return;
  const dayRect = xyxy(day);
  const rest = blocks.find(block => /^tháng[.…_\s-]+năm/iu.test(normalizeText(block.text))
    && xyxy(block)[1] > dayRect[1] && Math.abs(centerY(xyxy(block)) - centerY(dayRect)) <= 0.02);
  if (!rest) return;
  const restRect = xyxy(rest);
  const entries = fields.flatMap(field => field.entries)
    .filter(entry => entry.candidate.source === 'writing_guide'
      && Math.abs(centerY(entry.rect) - centerY(dayRect)) <= 0.02
      && entry.rect[1] >= dayRect[1] + 0.04 && entry.rect[1] <= restRect[3] + 0.02)
    .sort((first, second) => first.rect[1] - second.rect[1]);
  if (entries.length !== 3) return;
  for (const [index, entry] of entries.entries()) {
    const field = fields.find(item => item.entries.includes(entry));
    if (!field) continue;
    const label = ['Ngày cấp', 'Tháng cấp', 'Năm cấp'][index];
    if (field.entries.length > 1) {
      field.entries = field.entries.filter(item => item !== entry);
      fields.push({ label, anchorKey: `registration-date:${entry.candidate.candidateId}`, entries: [entry],
        inputKind: 'single_line_text', sourceBlockIds: [registration.id, day.id, rest.id], reasons: ['DATE_PART_SCOPE_INFERRED'] });
    } else {
      field.label = label;
      field.sourceBlockIds.push(registration.id, day.id, rest.id);
      field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
      field.reasons.push('DATE_PART_SCOPE_INFERRED');
    }
  }
}

function inferMaritalHistoryField(fields: DetectedField[], blocks: SourceBlock[]) {
  for (const block of blocks.filter(item => /^Trước khi kết hôn lần này\b/iu.test(normalizeText(item.text)))) {
    const printed = xyxy(block);
    const match = fields.flatMap(field => field.entries.map(entry => ({ field, entry })))
      .filter(({ field, entry }) => !field.label && ['single_line_text', 'multiline_text'].includes(field.inputKind)
        && entry.candidate.source === 'writing_guide' && rectWidth(entry.rect) >= 0.5
        && entry.rect[0] >= printed[2] - 0.005 && entry.rect[0] - printed[2] <= 0.02
        && overlapX(entry.rect, printed) / Math.min(rectWidth(entry.rect), rectWidth(printed)) >= 0.75)
      .sort((first, second) => first.entry.rect[0] - second.entry.rect[0])[0];
    if (!match) continue;
    const { field, entry } = match;
    const targetTop = printed[2] + rectHeight(printed) * 0.55;
    const verticalOffset = Math.max(0, targetTop - entry.rect[0]);
    if (verticalOffset > 0 && entry.rect[2] + verticalOffset <= 1) {
      entry.rect = [entry.rect[0] + verticalOffset, entry.rect[1], entry.rect[2] + verticalOffset, entry.rect[3]];
    }
    field.label = 'Tình trạng hôn nhân trước lần kết hôn này';
    field.sourceBlockIds.push(block.id);
    field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
    field.reasons.push('LABEL_POSITION_ESTIMATED');
  }
}

function inferCopyCountField(fields: DetectedField[], blocks: SourceBlock[]) {
  const contexts = blocks.flatMap(block => {
    const text = normalizeText(block.text);
    if (/^Số lượng\s*[.:…_]*\s*bản\s*[.:…_]*$/iu.test(text)) {
      const rect = xyxy(block);
      return [{ sourceBlockIds: [block.id], top: rect[0], left: rect[1], bottom: rect[2], right: rect[3] }];
    }
    if (!/^Số lượng\s*[.:…_]*$/iu.test(text)) return [];
    const rect = xyxy(block);
    const unit = blocks.find(item => /^bản\s*[.:…_]*$/iu.test(normalizeText(item.text))
      && xyxy(item)[1] >= rect[3] - 0.005 && xyxy(item)[1] - rect[3] <= 0.08
      && Math.abs(centerY(xyxy(item)) - centerY(rect)) <= 0.02);
    if (!unit) return [];
    const unitRect = xyxy(unit);
    return [{ sourceBlockIds: [block.id, unit.id], top: Math.min(rect[0], unitRect[0]), left: rect[1],
      bottom: Math.max(rect[2], unitRect[2]), right: unitRect[3] }];
  });
  for (const context of contexts) {
    const field = fields.filter(item => !item.label && item.inputKind === 'single_line_text' && item.entries.length === 1
      && item.entries[0].candidate.source === 'writing_guide'
      && Math.abs(centerY(item.entries[0].rect) - (context.top + context.bottom) / 2) <= 0.02
      && item.entries[0].rect[1] >= context.left + 0.06
      && item.entries[0].rect[1] <= context.right + 0.01
      && item.entries[0].rect[3] <= context.right + 0.02)
      .sort((first, second) => first.entries[0].rect[1] - second.entries[0].rect[1])[0];
    if (!field) continue;
    field.label = 'Số lượng bản sao';
    field.sourceBlockIds.push(...context.sourceBlockIds);
    field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
    field.reasons.push('LABEL_POSITION_ESTIMATED');
  }
}

function suppressMaritalDeclarationOverlap(fields: DetectedField[], blocks: SourceBlock[], regions: RecognitionEvidence[]) {
  const history = blocks.find(block => /^Trước khi kết hôn lần này\b/iu.test(normalizeText(block.text)));
  const declaration = blocks.find(block => /^Tôi cam đoan những nội dung khai trên\b/iu.test(normalizeText(block.text)));
  if (!history || !declaration) return;
  const historyRect = xyxy(history);
  const declarationRect = xyxy(declaration);
  for (const field of [...fields]) {
    const entry = field.entries.length === 1 ? field.entries[0] : undefined;
    if (!entry || field.label || field.inputKind !== 'single_line_text' || entry.candidate.source !== 'writing_guide'
      || rectWidth(entry.rect) >= 0.5 || Math.abs(entry.rect[2] - declarationRect[0]) > 0.002
      || entry.rect[0] < historyRect[2] - 0.005 || entry.rect[0] - historyRect[2] > 0.025
      || overlapX(entry.rect, declarationRect) / Math.min(rectWidth(entry.rect), rectWidth(declarationRect)) < 0.75) continue;
    regions.push({ candidateId: entry.candidate.candidateId, normalizedCoords: entry.rect,
      role: 'static_text', reason: 'DECLARATION_ADJACENT_GUIDE' });
    fields.splice(fields.indexOf(field), 1);
  }
}

function suppressSignatureGuides(fields: DetectedField[], blocks: SourceBlock[], regions: RecognitionEvidence[]) {
  const instructions = blocks.filter(block => /(?:ký,?\s*ghi rõ|chữ ký|ký tên)/iu.test(normalizeText(block.text)))
    .map(block => xyxy(block));
  if (!instructions.length) return;
  for (const field of [...fields]) {
    const entry = field.entries.length === 1 ? field.entries[0] : undefined;
    if (!entry || field.label || field.inputKind !== 'single_line_text' || entry.candidate.source !== 'writing_guide') continue;
    const instruction = instructions.find(rect => entry.rect[0] >= rect[2] - 0.005
      && entry.rect[0] - rect[2] <= 0.075
      && overlapX(entry.rect, rect) / Math.min(rectWidth(entry.rect), rectWidth(rect)) >= 0.75);
    if (!instruction) continue;
    regions.push({ candidateId: entry.candidate.candidateId, normalizedCoords: entry.rect,
      role: 'static_text', reason: 'SIGNATURE_GUIDE_NOT_CITIZEN_INPUT' });
    fields.splice(fields.indexOf(field), 1);
  }
}

function inferSigningDateParts(fields: DetectedField[], blocks: SourceBlock[]) {
  const dateParts = blocks.flatMap(block => {
    const part = DATE_PART.exec(normalizeText(block.text))?.[1]?.toLocaleLowerCase('vi-VN');
    return part ? [{ block, part, rect: xyxy(block) }] : [];
  }).sort((first, second) => first.rect[1] - second.rect[1]);
  for (const day of dateParts.filter(item => item.part === 'ngày')) {
    const month = dateParts.find(item => item.part === 'tháng' && item.rect[1] > day.rect[1]
      && item.rect[1] - day.rect[3] <= 0.15 && Math.abs(centerY(item.rect) - centerY(day.rect)) <= 0.02);
    const year = month && dateParts.find(item => item.part === 'năm' && item.rect[1] > month.rect[1]
      && item.rect[1] - month.rect[3] <= 0.15 && Math.abs(centerY(item.rect) - centerY(month.rect)) <= 0.02);
    if (!month || !year) continue;
    const location = blocks.find(block => /^Làm tại\s*:/iu.test(normalizeText(block.text))
      && xyxy(block)[3] < day.rect[1] && day.rect[1] - xyxy(block)[3] <= 0.2
      && Math.abs(centerY(xyxy(block)) - centerY(day.rect)) <= 0.02);
    if (!location) continue;
    const matches = [day, month, year].map(item => fields.filter(field => !field.label
      && field.inputKind === 'single_line_text' && field.entries.every(entry => entry.candidate.source === 'writing_guide')
      && Math.abs(centerY(field.entries[0].rect) - centerY(item.rect)) <= 0.02
      && field.entries[0].rect[1] >= item.rect[1] && field.entries[0].rect[1] <= item.rect[3] + 0.02
      && field.entries[0].rect[3] >= item.rect[3] - 0.01)
      .sort((first, second) => Math.abs(first.entries[0].rect[1] - item.rect[3])
        - Math.abs(second.entries[0].rect[1] - item.rect[3]))[0]);
    if (matches.some(field => !field) || new Set(matches).size !== 3) continue;
    [day, month, year].forEach((item, index) => {
      const field = matches[index]!;
      field.label = `${item.part[0].toLocaleUpperCase('vi-VN')}${item.part.slice(1)} ký`;
      field.sourceBlockIds.push(item.block.id, location.id);
      field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
      field.reasons.push('DATE_PART_SCOPE_INFERRED');
    });
  }
  for (const line of blocks.filter(block => /ngày[.…_\s-]{2,20}tháng[.…_\s-]{2,20}năm/iu.test(normalizeText(block.text)))) {
    const lineRect = xyxy(line);
    const location = blocks.find(block => /^Làm tại\s*:/iu.test(normalizeText(block.text))
      && xyxy(block)[3] <= lineRect[1] + 0.02
      && Math.abs(centerY(xyxy(block)) - centerY(lineRect)) <= 0.02);
    if (!location) continue;
    const triplet = fields.filter(field => !field.label && field.inputKind === 'single_line_text'
      && field.entries.length === 1 && field.entries[0].candidate.source === 'writing_guide'
      && rectWidth(field.entries[0].rect) <= 0.06
      && field.entries[0].rect[1] >= lineRect[1] + 0.02
      && field.entries[0].rect[3] <= lineRect[3] + 0.01
      && Math.abs(centerY(field.entries[0].rect) - centerY(lineRect)) <= 0.02)
      .sort((first, second) => first.entries[0].rect[1] - second.entries[0].rect[1]);
    if (triplet.length !== 3) continue;
    ['Ngày ký', 'Tháng ký', 'Năm ký'].forEach((label, index) => {
      triplet[index].label = label;
      triplet[index].sourceBlockIds.push(line.id, location.id);
      triplet[index].reasons = triplet[index].reasons.filter(reason => reason !== 'MISSING_LABEL');
      triplet[index].reasons.push('DATE_PART_SCOPE_INFERRED');
    });
  }
  for (const day of blocks.filter(block => /^cấp ngày[.…_\s-]*$/iu.test(normalizeText(block.text)))) {
    const dayRect = xyxy(day);
    const rest = blocks.find(block => /^tháng[.…_\s-]+năm/iu.test(normalizeText(block.text))
      && xyxy(block)[1] > dayRect[1]
      && Math.abs(centerY(xyxy(block)) - centerY(dayRect)) <= 0.02);
    if (!rest) continue;
    const restRect = xyxy(rest);
    const triplet = fields.filter(field => field.inputKind === 'single_line_text'
      && field.entries.length === 1 && field.entries[0].candidate.source === 'writing_guide'
      && Math.abs(centerY(field.entries[0].rect) - centerY(dayRect)) <= 0.02
      && field.entries[0].rect[1] >= dayRect[1] + 0.04
      && field.entries[0].rect[1] <= restRect[3] + 0.02)
      .sort((first, second) => first.entries[0].rect[1] - second.entries[0].rect[1]);
    if (triplet.length !== 3 || triplet[1].entries[0].rect[1] < restRect[1]
      || triplet[2].entries[0].rect[1] < restRect[1]) continue;
    ['Ngày cấp', 'Tháng cấp', 'Năm cấp'].forEach((label, index) => {
      triplet[index].label = label;
      triplet[index].sourceBlockIds.push(day.id, rest.id);
      triplet[index].reasons = triplet[index].reasons.filter(reason => reason !== 'MISSING_LABEL');
      triplet[index].reasons.push('DATE_PART_SCOPE_INFERRED');
    });
  }
}

function inferAdministrativeNumber(fields: DetectedField[], blocks: SourceBlock[]) {
  const caption = administrativeDateCaption(blocks);
  if (!caption) return;
  const printed = xyxy(caption.number);
  const parts = fields.filter(field => field.inputKind === 'single_line_text' && field.entries.length === 1
    && field.entries[0].candidate.source === 'writing_guide' && field.entries[0].candidate.shortGuide
    && hasAdministrativeNumberContext(field.entries[0], blocks)
    && Math.abs(centerY(field.entries[0].rect) - centerY(printed)) <= 0.02)
    .sort((first, second) => first.entries[0].rect[1] - second.entries[0].rect[1]);
  if (!parts.length || parts.length > 2) return;
  const field = parts[0];
  field.label = 'Văn bản số';
  field.entries = parts.flatMap(part => part.entries);
  field.sourceBlockIds = [...new Set([...field.sourceBlockIds, caption.number.id, caption.line.id])];
  field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
  field.reasons.push('ADMIN_NUMBER_SCOPE_INFERRED');
  for (const part of parts.slice(1)) fields.splice(fields.indexOf(part), 1);
}

function inferRegistrationNumber(fields: DetectedField[], blocks: SourceBlock[]) {
  const registrations = blocks.filter(block => /^Đã đăng ký kết hôn tại\b/iu.test(normalizeText(block.text)));
  for (const registration of registrations) {
    const registrationRect = xyxy(registration);
    const numberCaption = blocks.find(block => /^số\s*:?$/iu.test(normalizeText(block.text))
      && xyxy(block)[0] >= registrationRect[2] - 0.005
      && xyxy(block)[0] - registrationRect[2] <= 0.04);
    if (!numberCaption) continue;
    const numberRect = xyxy(numberCaption);
    const match = fields.flatMap(field => field.entries.map(entry => ({ field, entry })))
      .filter(({ field, entry }) => (!field.label || /^Đã đăng ký kết hôn tại$/iu.test(field.label))
        && ['single_line_text', 'multiline_text'].includes(field.inputKind) && entry.candidate.source === 'writing_guide'
        && Math.abs(centerY(entry.rect) - centerY(numberRect)) <= 0.02
        && entry.rect[1] >= numberRect[3] - 0.005 && entry.rect[1] - numberRect[3] <= 0.04
        && entry.rect[3] > numberRect[3] + 0.08)
      .sort((first, second) => first.entry.rect[1] - second.entry.rect[1])[0];
    if (!match) continue;
    const { field, entry } = match;
    field.entries = field.entries.filter(item => item !== entry);
    if (!field.entries.length) fields.splice(fields.indexOf(field), 1);
    fields.push({ label: 'Số đăng ký', anchorKey: `registration-number:${entry.candidate.candidateId}`,
      entries: [entry], inputKind: 'single_line_text', sourceBlockIds: [registration.id, numberCaption.id],
      reasons: ['ADMIN_NUMBER_SCOPE_INFERRED'] });
  }
}

function inferAdministrativeDateParts(fields: DetectedField[], blocks: SourceBlock[]) {
  const caption = administrativeDateCaption(blocks);
  if (!caption) return;
  const printed = xyxy(caption.line);
  const parts = fields.filter(field => field.inputKind === 'single_line_text' && field.entries.length === 1
    && field.entries[0].candidate.source === 'writing_guide' && field.entries[0].candidate.shortGuide
    && rectWidth(field.entries[0].rect) <= 0.06
    && field.entries[0].rect[1] >= printed[1] && field.entries[0].rect[3] <= printed[3] + 0.01
    && Math.abs(centerY(field.entries[0].rect) - centerY(printed)) <= 0.02)
    .sort((first, second) => first.entries[0].rect[1] - second.entries[0].rect[1]);
  if (parts.length !== 4) return;
  ['Nơi lập văn bản', 'Ngày lập', 'Tháng lập', 'Năm lập'].forEach((label, index) => {
    const field = parts[index];
    field.label = label;
    field.sourceBlockIds.push(caption.line.id, caption.number.id);
    field.reasons = field.reasons.filter(reason => reason !== 'MISSING_LABEL');
    field.reasons.push('DATE_PART_SCOPE_INFERRED');
  });
}

function isNotesOnlyPage(blocks: SourceBlock[], candidates: FieldCandidate[], width: number, height: number): boolean {
  const readingOrder = [...blocks].sort((first, second) => xyxy(first)[0] - xyxy(second)[0] || xyxy(first)[1] - xyxy(second)[1]);
  const heading = readingOrder.find(block => /\p{L}/u.test(block.text));
  if (!heading || !/^(?:Chú thích|Ghi chú|Hướng dẫn(?: kê khai|điền|sử dụng)?)\s*:/iu.test(normalizeText(heading.text))) return false;
  if (blocks.filter(block => normalizeText(block.text).split(' ').length >= 6).length < 8) return false;
  return !candidates.some(candidate => {
    if (candidate.source === 'writing_guide') {
      if (!candidate.shortGuide) return true;
      const { x, y, width: guideWidth, height: guideHeight } = candidate.rect;
      const entry: Entry = { candidate, rect: [y / height, x / width,
        (y + guideHeight) / height, (x + guideWidth) / width] };
      return hasFusedDateContext(entry, blocks) || hasAdministrativeNumberContext(entry, blocks);
    }
    return candidate.source === 'closed_contour' && !candidate.isContainer && candidate.rect.width >= 20 && candidate.rect.height >= 20
      || candidate.source === 'checkbox' && candidate.rect.width >= 14 && candidate.rect.height >= 14 && candidate.rectangularity >= 0.8;
  });
}

function tableFields(entries: Entry[], blocks: SourceBlock[], diagnostics: RecognitionEvidence[], width: number, height: number,
  previousHeader?: TableHeaderContext): {
  fields: DetectedField[]; consumed: Set<string>; continuationHeader?: TableHeaderContext;
} {
  const localHeaderContainer = (entry: Entry) => entry.candidate.source === 'closed_contour' && entry.candidate.isContainer
    && area(entry.rect) < 0.04 && !entries.some(child => child !== entry && !child.candidate.isContainer
      && child.candidate.source === 'closed_contour' && coverage(child.rect, entry.rect) >= 0.9
      && area(child.rect) >= area(entry.rect) * 0.15);
  const cells = entries.filter(entry => ['closed_contour', 'checkbox'].includes(entry.candidate.source)
    && (!entry.candidate.isContainer || localHeaderContainer(entry))
    && !entries.some(parent => parent !== entry && parent.candidate.source === 'closed_contour'
      && (!parent.candidate.isContainer || localHeaderContainer(parent))
      && area(parent.rect) >= area(entry.rect) * 4 && coverage(entry.rect, parent.rect) >= 0.9));
  const rows: Entry[][] = [];
  for (const cell of cells) {
    const row = rows.find(items => overlapY(items[0].rect, cell.rect) / Math.min(rectHeight(items[0].rect), rectHeight(cell.rect)) > 0.65
      && Math.abs(centerY(items[0].rect) - centerY(cell.rect)) < Math.max(rectHeight(items[0].rect), rectHeight(cell.rect)) * 0.4);
    if (row) row.push(cell); else rows.push([cell]);
  }
  rows.forEach(row => row.sort((first, second) => first.rect[1] - second.rect[1]));
  const headers = rows.filter(row => row.length >= 2 && row.filter(cell => TABLE_HEADER.test(normalizeTableHeaderText(
    blocksInside(cell, blocks).map(block => normalizeText(block.text)).filter(Boolean).join(' ')))).length >= 2);
  const alignedColumns = (row: Entry[], columns: TableHeaderContext['columns']) => row.length >= columns.length
    && columns.every(column => row.some(cell => Math.abs(cell.rect[1] - column.left) <= 0.025
      && Math.abs(cell.rect[3] - column.right) <= 0.025));
  let continuationHeader: TableHeaderContext | undefined;
  for (const header of headers) {
    const columns = header.map(cell => ({ left: cell.rect[1], right: cell.rect[3],
      title: normalizeTableHeaderText(blocksInside(cell, blocks).map(block => normalizeText(block.text)).filter(Boolean).join(' ')) }));
    const firstChoiceIndex = columns.findIndex(column => CHOICE_HEADER.test(column.title));
    const ordinalColumn = /^(?:STT|TT)$/iu.test(columns[0].title)
      || !columns[0].title && columns[0].right - columns[0].left < (columns[1].right - columns[1].left) * 0.45;
    if (columns.length < 4 || !ordinalColumn || !columns[1].title || firstChoiceIndex < 2
      || !columns.slice(firstChoiceIndex).every(column => CHOICE_HEADER.test(column.title))) continue;
    const alignedRows = rows.filter(row => row[0].rect[0] >= header[0].rect[2] - 0.005 && alignedColumns(row, columns));
    if (alignedRows.length >= 3 && Math.max(...alignedRows.flatMap(row => row.map(cell => cell.rect[2]))) >= 0.75) {
      continuationHeader = { columns };
    }
  }
  const extendedRows = new Set<Entry[]>();
  const headerContext = continuationHeader;
  const extendedHeader = headerContext && headers.find(header => header.length === headerContext.columns.length
    && header.every((cell, index) => Math.abs(cell.rect[1] - headerContext.columns[index].left) <= 0.025));
  if (extendedHeader && headerContext) {
    const firstChoiceIndex = headerContext.columns.findIndex(column => CHOICE_HEADER.test(column.title));
    let lastBottom = Math.max(...extendedHeader.map(cell => cell.rect[2]));
    for (const row of rows.filter(item => item !== extendedHeader && item[0].rect[0] >= lastBottom - 0.005)
      .sort((first, second) => first[0].rect[0] - second[0].rect[0])) {
      if (!alignedColumns(row, headerContext.columns.slice(firstChoiceIndex))) continue;
      if (row[0].rect[0] - lastBottom > 0.12) break;
      extendedRows.add(row);
      lastBottom = Math.max(...row.map(cell => cell.rect[2]));
    }
  }
  const carriedRows = new Set<Entry[]>();
  if (previousHeader?.columns.length && previousHeader.columns.length >= 4) {
    const firstChoiceIndex = previousHeader.columns.findIndex(column => CHOICE_HEADER.test(column.title));
    const firstNewHeaderTop = Math.min(1, ...headers.map(header => header[0].rect[0]));
    let lastBottom = 0;
    for (const row of rows.sort((first, second) => first[0].rect[0] - second[0].rect[0])) {
      if (row[0].rect[0] >= firstNewHeaderTop - 0.005) break;
      const labelColumn = previousHeader.columns[firstChoiceIndex - 1];
      const labelEvidence = blocks.some(block => {
        const rect = xyxy(block);
        return overlapY(rect, row[0].rect) / Math.min(rectHeight(rect), rectHeight(row[0].rect)) >= 0.5
          && overlapX(rect, [rect[0], labelColumn.left, rect[2], labelColumn.right]) / rectWidth(rect) >= 0.5
          && /\p{L}/u.test(block.text);
      });
      if (firstChoiceIndex < 2 || !alignedColumns(row, previousHeader.columns.slice(firstChoiceIndex))
        || (!alignedColumns(row, previousHeader.columns) && !labelEvidence)) continue;
      if (carriedRows.size === 0 && row[0].rect[0] > 0.25) break;
      if (carriedRows.size > 0 && row[0].rect[0] - lastBottom > 0.12) break;
      carriedRows.add(row);
      lastBottom = Math.max(...row.map(cell => cell.rect[2]));
    }
    if (carriedRows.size < 2) carriedRows.clear();
  }
  const consumed = new Set<string>();
  const fields: DetectedField[] = [];
  if (carriedRows.size >= 2 && previousHeader) {
    const firstRowTop = Math.min(...[...carriedRows][0].map(cell => cell.rect[0]));
    const columns = previousHeader.columns;
    const firstChoiceIndex = columns.findIndex(column => CHOICE_HEADER.test(column.title));
    const labelColumn = columns[firstChoiceIndex - 1];
    const upperLabelBlocks = blocks.filter(block => {
      const rect = xyxy(block);
      return rect[0] >= 0.045 && rect[0] < firstRowTop - 0.008 && rect[2] <= firstRowTop + 0.01
        && overlapX(rect, [rect[0], labelColumn.left, rect[2], labelColumn.right]) / rectWidth(rect) >= 0.5
        && /\p{L}/u.test(block.text) && normalizeText(block.text).length >= 8;
    }).sort((first, second) => xyxy(first)[0] - xyxy(second)[0]);
    const upperOrdinalBlocks = blocks.filter(block => {
      const rect = xyxy(block);
      return rect[0] >= 0.045 && rect[0] < firstRowTop - 0.008 && rect[2] <= firstRowTop + 0.01
        && overlapX(rect, [rect[0], columns[0].left, rect[2], columns[0].right]) / rectWidth(rect) >= 0.65
        && /^\d{1,3}(?:\.\d{1,2})?$/u.test(normalizeText(block.text));
    });
    const top = Math.max(0.03, Math.min(...upperLabelBlocks.map(block => xyxy(block)[0])) - 0.006);
    const hasTableFrame = entries.some(entry => entry.candidate.isContainer
      && entry.rect[0] <= top + 0.015 && entry.rect[2] >= firstRowTop
      && entry.rect[1] <= columns[0].left + 0.015 && entry.rect[3] >= columns.at(-1)!.right - 0.015);
    const hasExistingChoice = entries.some(entry => entry.rect[0] < firstRowTop - 0.01
      && entry.rect[2] > top && columns.slice(firstChoiceIndex).some(column => Math.abs(entry.rect[1] - column.left) <= 0.025
        && Math.abs(entry.rect[3] - column.right) <= 0.025));
    if (upperLabelBlocks.length && (upperOrdinalBlocks.length === 1 || /^\d{1,3}(?:\.\d{1,2})?\s+\p{L}/u.test(normalizeText(upperLabelBlocks[0].text)))
      && hasTableFrame && !hasExistingChoice && firstRowTop - top >= 0.025 && firstRowTop - top <= 0.12) {
      const labelText = upperLabelBlocks.map(block => normalizeText(block.text)).join(' ');
      const label = upperOrdinalBlocks.length === 1 && !labelText.startsWith(`${normalizeText(upperOrdinalBlocks[0].text)} `)
        ? `${normalizeText(upperOrdinalBlocks[0].text)} ${labelText}` : labelText;
      for (let index = firstChoiceIndex; index < columns.length; index++) {
        const column = columns[index];
        const rect: NormalizedBoundingBox = [top, column.left, firstRowTop, column.right];
        const pixelWidth = (column.right - column.left) * width;
        const pixelHeight = (firstRowTop - top) * height;
        const candidateId = `inferred_open_top_${index}`;
        const candidate: FieldCandidate = { candidateId, source: 'closed_contour',
          rect: { x: column.left * width, y: top * height, width: pixelWidth, height: pixelHeight },
          areaRatio: pixelWidth * pixelHeight / (width * height), aspectRatio: pixelWidth / pixelHeight,
          contourArea: pixelWidth * pixelHeight, rectangularity: 1, parentIndex: -1, childIndex: -1 };
        fields.push({ label: `${label} — ${column.title}`, anchorKey: `inferred:${candidateId}`, entries: [{ candidate, rect }],
          inputKind: 'checkbox', sourceBlockIds: [...upperOrdinalBlocks, ...upperLabelBlocks].map(block => block.id),
          reasons: ['TABLE_HEADER_CARRIED', 'OPEN_TOP_ROW_INFERRED'] });
      }
    }
  }
  for (const row of headers) for (const cell of row) {
    consumed.add(cell.candidate.candidateId);
    diagnostics.push({ candidateId: cell.candidate.candidateId, normalizedCoords: cell.rect, role: 'label', reason: 'TABLE_HEADER' });
    for (const artifact of entries.filter(entry => entry !== cell && !consumed.has(entry.candidate.candidateId)
      && coverage(entry.rect, cell.rect) >= 0.9 && area(entry.rect) < area(cell.rect) * 0.25)) {
      consumed.add(artifact.candidate.candidateId);
      diagnostics.push({ candidateId: artifact.candidate.candidateId, normalizedCoords: artifact.rect, role: 'label', reason: 'TABLE_HEADER_ARTIFACT' });
    }
  }
  for (const row of rows.filter(items => items.length >= 2 && !headers.includes(items))) {
    const header = headers.filter(items => items[0].rect[2] <= row[0].rect[0] + 0.002
      && row.every(cell => items.some(top => overlapX(cell.rect, top.rect) / Math.min(rectWidth(cell.rect), rectWidth(top.rect)) > 0.7)))
      .sort((first, second) => second[0].rect[2] - first[0].rect[2])[0] ?? (extendedRows.has(row) ? extendedHeader : undefined);
    const inherited = !header && carriedRows.has(row) && previousHeader;
    if (!header && !inherited) continue;
    const tableContainer = header && entries.filter(entry => entry.candidate.isContainer && header.every(cell => coverage(cell.rect, entry.rect) >= 0.9))
      .sort((first, second) => area(first.rect) - area(second.rect))[0];
    if (tableContainer && row.some(cell => coverage(cell.rect, tableContainer.rect) < 0.9)) continue;
    if (header && !extendedRows.has(row)) {
      const gap = row[0].rect[0] - header[0].rect[2];
      if (gap > 0.35 || blocks.some(block => STATIC_TYPES.has(classifyLine(block.text).type)
        && xyxy(block)[0] > header[0].rect[2] && xyxy(block)[2] < row[0].rect[0])) continue;
    }
    const columns = header ? header.map(cell => ({ left: cell.rect[1], right: cell.rect[3],
      title: normalizeTableHeaderText(blocksInside(cell, blocks).map(block => normalizeText(block.text)).filter(Boolean).join(' ')) })) : previousHeader!.columns;
    const headingText = columns.map(column => column.title);
    const firstWidth = columns[0].right - columns[0].left;
    const nextWidth = columns[1].right - columns[1].left;
    const repeating = /^(?:STT|TT)$/iu.test(headingText[0])
      || (columns.length >= 3 && firstWidth < nextWidth * 0.45 && rows.filter(items => items.length >= 3
        && items[0].rect[0] > (header?.[0].rect[2] ?? 0)).length >= 2);
    const firstChoiceIndex = headingText.findIndex(title => CHOICE_HEADER.test(title));
    const labelColumnIndex = repeating && firstChoiceIndex >= 2 ? firstChoiceIndex - 1 : 0;
    const columnIndex = (cell: Entry) => header
      ? header.findIndex(top => overlapX(cell.rect, top.rect) / Math.min(rectWidth(cell.rect), rectWidth(top.rect)) > 0.7)
      : columns.findIndex(column => Math.abs(cell.rect[1] - column.left) <= 0.025
        && Math.abs(cell.rect[3] - column.right) <= 0.025);
    const followingHeaderTop = headers.filter(items => items !== header && items[0].rect[0] > (header?.[0].rect[0] ?? 1))
      .map(items => items[0].rect[0]).sort((first, second) => first - second)[0] ?? 1;
    const groundedRowCount = header ? rows.filter(items => items[0].rect[0] >= header[0].rect[2] - 0.005
      && items[0].rect[0] < followingHeaderTop && items.length >= 3
      && items.every(cell => columnIndex(cell) >= 0)).length : 0;
    const labelCell = row.filter(cell => columnIndex(cell) === labelColumnIndex)
      .sort((first, second) => area(second.rect) - area(first.rect))[0];
    const rowTop = Math.min(...row.map(cell => cell.rect[0]));
    const rowBottom = Math.max(...row.map(cell => cell.rect[2]));
    const labelBounds: NormalizedBoundingBox = [rowTop, columns[labelColumnIndex].left, rowBottom, columns[labelColumnIndex].right];
    const directLabelBlocks = labelCell ? blocksInside(labelCell, blocks) : [];
    const labelBlocks = directLabelBlocks.length ? directLabelBlocks : blocks.filter(block => coverage(xyxy(block), labelBounds) >= 0.65)
      .sort((first, second) => xyxy(first)[0] - xyxy(second)[0]);
    const ordinalBlocks = repeating && labelColumnIndex > 0 ? blocks.filter(block => {
      const rect = xyxy(block);
      return coverage(rect, [rowTop, columns[0].left, rowBottom, columns[0].right]) >= 0.65
        && /^\d+(?:\.\d+)*$/u.test(normalizeText(block.text));
    }) : [];
    const labelText = labelBlocks.map(block => normalizeText(block.text)).join(' ');
    const ordinal = ordinalBlocks.map(block => normalizeText(block.text)).join(' ');
    const label = labelText && ordinal && !labelText.startsWith(`${ordinal} `) ? `${ordinal} ${labelText}` : labelText;
    if (repeating && firstChoiceIndex >= 2 && headingText.slice(firstChoiceIndex).every(title => CHOICE_HEADER.test(title))
      && row[0].rect[2] >= 0.75) continuationHeader = { columns };
    const choiceMatrix = firstChoiceIndex >= 1 && headingText.slice(firstChoiceIndex).every(title => CHOICE_HEADER.test(title));
    for (let column = 0; column < row.length; column++) {
      const cell = row[column];
      const headerIndex = columnIndex(cell);
      if (headerIndex < 0) continue;
      const parentHeader = header?.[headerIndex];
      const nestedHeader = parentHeader && rectWidth(parentHeader.rect) >= rectWidth(cell.rect) * 1.5
        ? entries.find(entry => entry !== parentHeader && entry.candidate.source === 'closed_contour'
          && Math.abs(entry.rect[1] - cell.rect[1]) <= 0.01 && Math.abs(entry.rect[3] - cell.rect[3]) <= 0.01
          && entry.rect[0] >= parentHeader.rect[2] - 0.005 && entry.rect[2] <= rowTop + 0.005)
        : undefined;
      const nestedBlocks = nestedHeader ? blocksInside(nestedHeader, blocks) : [];
      const title = nestedBlocks.length
        ? `${headingText[headerIndex]} — ${nestedBlocks.map(block => normalizeText(block.text)).join(' ')}`
        : headingText[headerIndex];
      consumed.add(cell.candidate.candidateId);
      if ((repeating && (headerIndex === 0 && firstWidth < nextWidth * 0.45 || firstChoiceIndex >= 2 && headerIndex === labelColumnIndex))
        || (!repeating && column === 0)) {
        diagnostics.push({ candidateId: cell.candidate.candidateId, normalizedCoords: cell.rect, role: 'label', reason: 'TABLE_ROW_LABEL' });
        continue;
      }
      const inputKind = CHOICE_HEADER.test(title) ? 'checkbox' : 'table_cell';
      const rowNumber = rows.filter(items => items[0].rect[0] >= (header?.[0].rect[2] ?? 0) - 0.002 && items.length >= 2).indexOf(row) + 1;
      const fieldLabel = choiceMatrix ? `${label} — ${title}` : repeating ? `${title} — dòng ${rowNumber}` : `${label} — ${title}`;
      const known = choiceMatrix ? !!label && !!title : repeating ? !!title : !!label && !!title;
      const groundedTable = inputKind === 'table_cell' && repeating && !!header && !inherited && !extendedRows.has(row)
        && row.every(cell => columnIndex(cell) >= 0) && groundedRowCount >= 2;
      fields.push({ label: known ? fieldLabel : '', anchorKey: `cell:${cell.candidate.candidateId}`, entries: [cell], inputKind,
        sourceBlockIds: [...ordinalBlocks.map(block => block.id), ...labelBlocks.map(block => block.id),
          ...(parentHeader ? blocksInside(parentHeader, blocks).map(block => block.id) : []),
          ...nestedBlocks.map(block => block.id)],
        reasons: [known ? groundedTable ? 'TABLE_ROW_COLUMN_GROUNDED' : 'TABLE_ROW_COLUMN_GROUNDING' : 'TABLE_LABEL_MISSING', ...(inherited ? ['TABLE_HEADER_CARRIED'] : []),
          ...(extendedRows.has(row) && row[0].rect[0] - header![0].rect[2] > 0.35 ? ['TABLE_LONG_GRID_CONTINUATION'] : [])] });
    }
    if (choiceMatrix || inherited || extendedRows.has(row)) for (const artifact of entries.filter(entry => !consumed.has(entry.candidate.candidateId) && !entry.candidate.isContainer
      && entry.rect[1] >= columns[0].left - 0.015 && entry.rect[3] <= columns[labelColumnIndex].right + 0.015
      && area(entry.rect) < area(labelBounds) * 0.15
      && overlapY(entry.rect, [rowTop, columns[0].left, rowBottom, columns[labelColumnIndex].right])
        / Math.min(rectHeight(entry.rect), rowBottom - rowTop) > 0.6)) {
      consumed.add(artifact.candidate.candidateId);
      diagnostics.push({ candidateId: artifact.candidate.candidateId, normalizedCoords: artifact.rect, role: 'label', reason: 'TABLE_ROW_LABEL_ARTIFACT' });
    }
  }
  for (const header of headers) {
    const columns = header.map(cell => ({ left: cell.rect[1], right: cell.rect[3],
      title: normalizeTableHeaderText(blocksInside(cell, blocks).map(block => normalizeText(block.text)).filter(Boolean).join(' ')) }));
    if (columns.length < 3 || !columns.slice(1).every(column => CHOICE_HEADER.test(column.title))) continue;
    const alignedRows = rows.filter(row => row[0].rect[0] >= header[0].rect[2] - 0.005 && alignedColumns(row, columns))
      .sort((first, second) => first[0].rect[0] - second[0].rect[0]);
    if (alignedRows.length < 3) continue;
    const lastRow = alignedRows.at(-1)!;
    const lastBottom = Math.max(...lastRow.map(cell => cell.rect[2]));
    if (lastBottom < 0.75 || lastBottom > 0.94) continue;
    const labelBounds: NormalizedBoundingBox = [lastRow[0].rect[0], columns[0].left, lastBottom, columns[0].right];
    const previousText = blocks.filter(block => coverage(xyxy(block), labelBounds) >= 0.65)
      .sort((first, second) => xyxy(first)[0] - xyxy(second)[0]).map(block => normalizeText(block.text)).join(' ');
    const previousNumber = /^(\d{1,2})\./u.exec(previousText);
    if (!previousNumber) continue;
    const nextBlocks = blocks.filter(block => {
      const rect = xyxy(block);
      return rect[0] >= lastBottom - 0.002 && rect[0] - lastBottom <= 0.1
        && coverage(rect, [lastBottom, columns[0].left, Math.min(1, lastBottom + 0.14), columns[0].right]) >= 0.65;
    }).sort((first, second) => xyxy(first)[0] - xyxy(second)[0]);
    if (!nextBlocks.length || xyxy(nextBlocks[0])[0] - lastBottom > 0.025) continue;
    const firstText = normalizeText(nextBlocks[0].text);
    const ordinal = /^(\d{1,2}|B)\.\s+(.+)$/u.exec(firstText);
    const expectedNumber = Number(previousNumber[1]) + 1;
    if (!ordinal || Number(ordinal[1]) !== expectedNumber && !(ordinal[1] === 'B' && expectedNumber === 8)) continue;
    const label = `${expectedNumber}. ${[ordinal[2], ...nextBlocks.slice(1).map(block => normalizeText(block.text))].join(' ')}`;
    const bottom = Math.min(0.96, Math.max(lastBottom + rectHeight(lastRow[0].rect),
      ...nextBlocks.map(block => xyxy(block)[2] + 0.005)));
    if (bottom - lastBottom > 0.14) continue;
    for (let index = 1; index < columns.length; index++) {
      const column = columns[index];
      const rect: NormalizedBoundingBox = [lastBottom, column.left, bottom, column.right];
      const pixelWidth = (column.right - column.left) * width;
      const pixelHeight = (bottom - lastBottom) * height;
      const candidateId = `inferred_open_bottom_${index}`;
      const candidate: FieldCandidate = { candidateId, source: 'closed_contour',
        rect: { x: column.left * width, y: lastBottom * height, width: pixelWidth, height: pixelHeight },
        areaRatio: pixelWidth * pixelHeight / (width * height), aspectRatio: pixelWidth / pixelHeight,
        contourArea: pixelWidth * pixelHeight, rectangularity: 1, parentIndex: -1, childIndex: -1 };
      fields.push({ label: `${label} — ${column.title}`, anchorKey: `inferred:${candidateId}`, entries: [{ candidate, rect }],
        inputKind: 'checkbox', sourceBlockIds: nextBlocks.map(block => block.id),
        reasons: ['OPEN_BOTTOM_ROW_INFERRED', ...(ordinal[1] === 'B' ? ['OCR_ORDINAL_INFERRED'] : [])] });
    }
    for (const artifact of entries.filter(entry => !consumed.has(entry.candidate.candidateId)
      && ['closed_contour', 'writing_guide'].includes(entry.candidate.source) && entry.rect[0] >= 0.975 && entry.rect[2] >= 0.999
      && entry.rect[1] >= columns[0].left && entry.rect[3] <= columns[0].right
      && rectWidth(entry.rect) <= 0.1 && !blocks.some(block => coverage(xyxy(block), entry.rect) >= 0.5))) {
      consumed.add(artifact.candidate.candidateId);
      diagnostics.push({ candidateId: artifact.candidate.candidateId, normalizedCoords: artifact.rect,
        role: 'static_text', reason: 'PAGE_EDGE_TABLE_ARTIFACT' });
    }
  }
  return { fields, consumed, continuationHeader };
}

function segmentInlineCandidates(
  entries: Entry[],
  anchors: Anchor[],
  consumed: Set<string>,
  width: number,
  height: number
): Entry[] {
  const result: Entry[] = [];
  for (const entry of entries) {
    if (consumed.has(entry.candidate.candidateId) || !['writing_guide', 'field_row'].includes(entry.candidate.source)) {
      result.push(entry);
      continue;
    }
    const lineScale = Math.max(rectHeight(entry.rect), 0.015);
    const rowAnchors = anchors.filter(anchor =>
      Math.abs(centerY(anchor.rect) - centerY(entry.rect)) <= lineScale * 0.8
    ).sort((a, b) => a.rect[1] - b.rect[1]);

    const intermediateAnchors = rowAnchors.filter(anchor =>
      anchor.rect[1] > entry.rect[1] + 0.02 && anchor.rect[1] < entry.rect[3] - 0.02
    );

    if (!intermediateAnchors.length) {
      result.push(entry);
      continue;
    }

    const precedingAnchor = rowAnchors.filter(anchor =>
      anchor.rect[3] <= entry.rect[1] + 0.03 && entry.rect[1] - anchor.rect[3] <= 0.15
    ).at(-1);

    const relevantAnchors = precedingAnchor ? [precedingAnchor, ...intermediateAnchors] : intermediateAnchors;
    const subEntries: Entry[] = [];

    for (let i = 0; i < relevantAnchors.length; i++) {
      const anchor = relevantAnchors[i];
      const nextAnchor = relevantAnchors[i + 1];
      const startX = Math.max(entry.rect[1], anchor.rect[3] + 0.003);
      const endX = nextAnchor ? Math.min(entry.rect[3], nextAnchor.rect[1] - 0.003) : entry.rect[3];

      if (endX - startX >= 0.015) {
        const subRect: NormalizedBoundingBox = [entry.rect[0], startX, entry.rect[2], endX];
        const pixelW = (endX - startX) * width;
        const pixelH = (entry.rect[2] - entry.rect[0]) * height;
        const subCandidate: FieldCandidate = {
          ...entry.candidate,
          candidateId: `${entry.candidate.candidateId}_sub_${i + 1}`,
          rect: {
            x: startX * width,
            y: entry.rect[0] * height,
            width: pixelW,
            height: pixelH,
          },
          aspectRatio: pixelW / Math.max(pixelH, 1),
          areaRatio: (pixelW * pixelH) / (width * height),
          contourArea: pixelW * pixelH,
          rectangularity: 1,
          shortGuide: (endX - startX) < 0.1 || entry.candidate.shortGuide,
        };
        subEntries.push({ candidate: subCandidate, rect: subRect });
      }
    }

    if (subEntries.length > 1) {
      result.push(...subEntries);
    } else {
      result.push(entry);
    }
  }
  return result;
}

export function recognizeFormRegions(input: { candidates: FieldCandidate[]; document: DocumentJsonExport; width: number; height: number;
  previousTableHeader?: TableHeaderContext }): {
  boxes: FormGeometricBox[]; regions: RecognitionEvidence[]; summary: { detectedFields: number; labeledFields: number; needsReview: number; excludedRegions: number };
  continuationHeader?: TableHeaderContext;
} {
  const blocks = input.document.blocks.filter(block => block.page === 1 && block.bbox && (block.kind === 'line' || block.kind === undefined));
  const anchors = sourceAnchors(input.document, blocks);
  const regions: RecognitionEvidence[] = [];
  const entries = input.candidates.map(candidate => {
    const { x, y, width, height } = candidate.rect;
    return { candidate, rect: [y / input.height, x / input.width, (y + height) / input.height, (x + width) / input.width] as NormalizedBoundingBox };
  }).sort((first, second) => first.rect[0] - second.rect[0] || first.rect[1] - second.rect[1]);
  if (isNotesOnlyPage(blocks, input.candidates, input.width, input.height)) {
    const regions = entries.map(entry => ({ candidateId: entry.candidate.candidateId, normalizedCoords: entry.rect,
      role: (entry.candidate.source === 'field_row' ? 'description' : 'static_text') as RegionRole, reason: 'NOTES_ONLY_PAGE_REVIEW_REQUIRED' }));
    return { boxes: [], regions, summary: { detectedFields: 0, labeledFields: 0, needsReview: 0, excludedRegions: regions.length } };
  }
  const table = tableFields(entries, blocks, regions, input.width, input.height, input.previousTableHeader);
  const fields = table.fields;
  const consumed = table.consumed;
  for (const container of entries.filter(entry => entry.candidate.isContainer && area(entry.rect) < 0.04)) {
    const pixelAspect = rectWidth(container.rect) * input.width / (rectHeight(container.rect) * input.height);
    const children = entries.filter(entry => entry !== container && coverage(entry.rect, container.rect) >= 0.9);
    const code = blocks.find(block => block.confidence !== null && block.confidence !== undefined && block.confidence < 0.5
      && /^[0-9OIl]{8,}$/u.test(normalizeText(block.text)) && coverage(xyxy(block), container.rect) >= 0.65);
    if (pixelAspect < 0.75 || pixelAspect > 1.35 || children.length < 3 || !code) continue;
    for (const entry of [container, ...children]) {
      if (consumed.has(entry.candidate.candidateId)) continue;
      consumed.add(entry.candidate.candidateId);
      regions.push({ candidateId: entry.candidate.candidateId, normalizedCoords: entry.rect, role: 'static_text', reason: 'QR_OR_GRAPHIC_REGION' });
    }
  }
  const record = (entry: Entry, role: RegionRole, reason: string) => regions.push({ candidateId: entry.candidate.candidateId, normalizedCoords: entry.rect, role, reason });
  const staticRecipientBlocks = blocks.filter(hasPrintedRecipientValue);
  for (const entry of entries) {
    if (consumed.has(entry.candidate.candidateId) || entry.candidate.source !== 'writing_guide') continue;
    const recipient = staticRecipientBlocks.find(block => {
      const rect = xyxy(block);
      return Math.abs(centerY(rect) - centerY(entry.rect)) <= Math.max(rectHeight(rect), rectHeight(entry.rect)) * 0.6
        && entry.rect[1] >= rect[1] - 0.01 && entry.rect[1] <= rect[3] + 0.2;
    });
    if (recipient) {
      consumed.add(entry.candidate.candidateId);
      const placeholderLabel = recipientPlaceholderLabel(recipient);
      if (placeholderLabel && entry.rect[3] > xyxy(recipient)[3] - 0.02 && rectWidth(entry.rect) >= 0.04) {
        fields.push({ label: placeholderLabel, anchorKey: `recipient-placeholder:${entry.candidate.candidateId}`,
          entries: [entry], inputKind: 'single_line_text', sourceBlockIds: [recipient.id], reasons: ['LABEL_POSITION_ESTIMATED'] });
        continue;
      }
      if (isLocalConstructionRecipient(recipient) && rectWidth(entry.rect) >= 0.04
        && Math.abs(centerY(xyxy(recipient)) - centerY(entry.rect)) <= Math.max(rectHeight(xyxy(recipient)), rectHeight(entry.rect)) * 0.6) {
        fields.push({ label: 'Sở Xây dựng (địa phương)', anchorKey: `recipient:${entry.candidate.candidateId}`,
          entries: [entry], inputKind: 'single_line_text', sourceBlockIds: [recipient.id], reasons: ['LABEL_POSITION_ESTIMATED'] });
        continue;
      }
      record(entry, 'static_text', 'STATIC_RECIPIENT_LINE');
    }
  }
  const slotEntries = entries.filter(entry => !consumed.has(entry.candidate.candidateId) && !entry.candidate.isContainer
    && ['checkbox', 'closed_contour'].includes(entry.candidate.source) && entry.candidate.aspectRatio >= 0.6 && entry.candidate.aspectRatio <= 1.6);
  for (const anchor of anchors.filter(item => /(?:CCCD|CMND|định danh|mã số thuế)/iu.test(item.label))) {
    const possible = slotEntries.filter(entry => !consumed.has(entry.candidate.candidateId)
      && Math.abs(centerY(entry.rect) - centerY(anchor.rect)) <= Math.max(rectHeight(anchor.rect), rectHeight(entry.rect)) * 1.7
      && entry.rect[1] >= anchor.rect[1]).sort((first, second) => first.rect[1] - second.rect[1]);
    let sequence: Entry[] = [];
    let longest: Entry[] = [];
    for (const entry of possible) {
      const previous = sequence.at(-1);
      if (previous && (entry.rect[1] - previous.rect[3] > rectWidth(previous.rect) * 0.6
        || Math.abs(centerY(entry.rect) - centerY(previous.rect)) > rectHeight(previous.rect) * 0.3)) sequence = [];
      sequence.push(entry);
      if (sequence.length > longest.length) longest = [...sequence];
    }
    if (longest.length < 4) continue;
    longest.forEach(entry => consumed.add(entry.candidate.candidateId));
    fields.push({ label: anchor.label, anchorKey: anchor.key, entries: longest, inputKind: 'character_slots', sourceBlockIds: anchor.sourceBlockIds, reasons: ['CHARACTER_SLOT_SEQUENCE'] });
  }
  const candidateEntries = segmentInlineCandidates(entries, anchors, consumed, input.width, input.height);
  const guides = candidateEntries.filter(entry => entry.candidate.source === 'writing_guide');
  const pairedDecorativeGuideIds = new Set<string>();
  for (let index = 0; index < guides.length; index++) for (let otherIndex = index + 1; otherIndex < guides.length; otherIndex++) {
    const first = guides[index];
    const second = guides[otherIndex];
    if (first.candidate.guideStyle === 'underline' && second.candidate.guideStyle === 'underline'
      && rectWidth(first.rect) >= 0.2
      && overlapY(first.rect, second.rect) / Math.min(rectHeight(first.rect), rectHeight(second.rect)) >= 0.2
      && overlapX(first.rect, second.rect) / Math.min(rectWidth(first.rect), rectWidth(second.rect)) >= 0.9
      && Math.abs(first.rect[1] - second.rect[1]) <= 0.01 && Math.abs(first.rect[3] - second.rect[3]) <= 0.01) {
      pairedDecorativeGuideIds.add(first.candidate.candidateId);
      pairedDecorativeGuideIds.add(second.candidate.candidateId);
    }
  }
  const inlineLabels = inlineDottedGuideLabels(candidateEntries, blocks);
  const readingEntries = [...candidateEntries].sort((first, second) => {
    const sameRow = Math.abs(centerY(first.rect) - centerY(second.rect)) <= Math.min(rectHeight(first.rect), rectHeight(second.rect)) * 0.5;
    return sameRow ? first.rect[1] - second.rect[1] : first.rect[0] - second.rect[0] || first.rect[1] - second.rect[1];
  });
  for (const entry of readingEntries) {
    if (consumed.has(entry.candidate.candidateId)) continue;
    const candidate = entry.candidate;
    if (isFootnoteSeparator(entry, blocks)) { record(entry, 'static_text', 'FOOTNOTE_SEPARATOR'); continue; }
    const overlappingDecorativeRules = guides.filter(guide => pairedDecorativeGuideIds.has(guide.candidate.candidateId)
      && coverage(entry.rect, guide.rect) >= 0.5);
    if (candidate.source === 'field_row' && rectHeight(entry.rect) <= 0.01 && rectWidth(entry.rect) >= 0.5
      && overlappingDecorativeRules.length >= 2) {
      record(entry, 'static_text', 'REDUNDANT_ROW_OVER_PAIRED_RULE'); continue;
    }
    const dottedBridge = isDottedBridge(entry, entries, blocks) && fields.some(field => {
      const previous = field.entries.at(-1);
      return field.label && field.inputKind === 'single_line_text' && previous?.candidate.source === 'writing_guide'
        && previous.candidate.guideStyle === 'dotted' && !previous.candidate.shortGuide
        && entry.rect[1] >= previous.rect[3] && entry.rect[1] - previous.rect[3] <= 0.03
        && Math.abs(centerY(entry.rect) - centerY(previous.rect)) <= Math.min(rectHeight(entry.rect), rectHeight(previous.rect)) * 0.5;
    });
    const adjacentShortGuideAnchor = hasAdjacentShortGuideAnchor(entry, candidateEntries, anchors);
    if (entry.rect[1] <= 0.001 && rectWidth(entry.rect) >= 0.2
      && (entry.rect[0] <= 0.001 && entry.rect[2] <= 0.015
        || entry.rect[2] >= 0.999 && entry.rect[0] >= 0.985)) {
      record(entry, 'static_text', 'PAGE_EDGE_SCAN_ARTIFACT'); continue;
    }
    if (candidate.isContainer) { record(entry, 'container', 'GROUP_CONTAINER'); continue; }
    if (candidate.source === 'phrase_cluster') { record(entry, 'static_text', 'TEXT_CLUSTER_NOT_WRITING_REGION'); continue; }
    if (candidate.source === 'checkbox' && area(entry.rect) < 0.0002) {
      const prose = blocks.find(block => {
        const rect = xyxy(block);
        const text = normalizeText(block.text);
        const wordCount = text.match(/\p{L}+/gu)?.length ?? 0;
        return wordCount >= 6 && !/[☐☑☒□]/u.test(text)
          && !/^(?:đề nghị|chọn|tích|có|không|nam|nữ)\b/iu.test(text)
          && entry.rect[3] <= rect[1] + 0.004 && rect[1] - entry.rect[3] >= -0.002
          && overlapY(entry.rect, rect) / rectHeight(entry.rect) >= 0.75;
      });
      if (prose && !isGroupedCheckboxOption(entry, entries, blocks)) {
        record(entry, 'static_text', 'PROSE_ADJACENT_GLYPH_NOT_CHECKBOX'); continue;
      }
    }
    if (candidate.source === 'writing_guide' && candidate.shortGuide
      && !hasFusedDateContext(entry, blocks) && !hasAdministrativeNumberContext(entry, blocks)
      && !inlineLabels.has(candidate.candidateId) && !dottedBridge && !adjacentShortGuideAnchor) {
      record(entry, 'unresolved', 'SHORT_GUIDE_WITHOUT_DATE_CONTEXT'); continue;
    }
    if (['closed_contour', 'writing_guide'].includes(candidate.source) && rectHeight(entry.rect) < 0.02
      && !(candidate.source === 'writing_guide' && candidate.guideStyle === 'dotted' && hasAdministrativeNumberContext(entry, blocks))
      && !(candidate.source === 'writing_guide' && candidate.guideStyle === 'dotted' && inlineLabels.has(candidate.candidateId))
      && blocks.some(block => {
        if (!STATIC_TYPES.has(classifyLine(block.text).type)) return false;
        const printed = xyxy(block);
        const overlap = overlapY(entry.rect, printed) / rectHeight(entry.rect);
        const gap = entry.rect[0] - printed[2];
        const widthRatio = rectWidth(entry.rect) / rectWidth(printed);
        const centeredDecoration = gap >= -0.004 && gap <= 0.01
          && Math.abs(centerX(entry.rect) - centerX(printed)) <= 0.02
          && widthRatio >= 0.65 && widthRatio <= 1.1;
        return (overlap > 0.3 || centeredDecoration)
          && overlapX(entry.rect, printed) / rectWidth(entry.rect) > 0.7;
      })) {
      record(entry, 'static_text', 'PRINTED_HEADING_UNDERLINE'); continue;
    }
    if (candidate.source === 'writing_guide' && candidate.guideStyle === 'underline'
      && blocks.some(block => {
        const printed = xyxy(block);
        return /^Về việc\b/iu.test(normalizeText(block.text))
          && overlapY(entry.rect, printed) / rectHeight(entry.rect) >= 0.65
          && overlapX(entry.rect, printed) / rectWidth(entry.rect) >= 0.7;
      })) {
      record(entry, 'static_text', 'UNDERLINED_FORM_TITLE'); continue;
    }
    if (['checkbox', 'closed_contour'].includes(candidate.source) && area(entry.rect) < 0.00035
      && blocks.some(block => coverage(entry.rect, xyxy(block)) >= 0.8
        && /\p{L}{2}/u.test(block.text) && !/[☐☑☒□]/u.test(block.text))
      && !isGroupedCheckboxOption(entry, entries, blocks)) {
      record(entry, 'static_text', 'PRINTED_STRUCTURE_ARTIFACT'); continue;
    }
    if (['checkbox', 'closed_contour'].includes(candidate.source)
      && anchors.some(anchor => coverage(entry.rect, anchor.rect) >= 0.75 && area(entry.rect) < area(anchor.rect) * 0.7)) {
      record(entry, 'label', 'PRINTED_LABEL_ARTIFACT'); continue;
    }
    const contents = blocksInside(entry, blocks);
    if (candidate.source === 'field_row' && contents.some(block => coverage(entry.rect, xyxy(block)) >= 0.85
      && /\p{L}{3}/u.test(block.text) && !/[._…]{3,}/u.test(block.text)
      && !anchors.some(anchor => anchor.sourceBlockIds.includes(block.id)))) {
      record(entry, 'description', 'PRINTED_TEXT_WITHOUT_WRITING_AREA'); continue;
    }
    const staticBlock = contents.find(block => STATIC_TYPES.has(classifyLine(block.text).type) || SECTION_PROMPT.test(normalizeText(block.text))
      || /^(?:Ảnh\b|Chú thích\b|Ghi chú\b|Tôi.*cam đoan\b|Ký bởi\b)/iu.test(normalizeText(block.text)));
    if (staticBlock && !anchors.some(anchor => anchor.sourceBlockIds.includes(staticBlock.id))) { record(entry, 'static_text', 'PRINTED_STRUCTURE'); continue; }
    const staticTextCoverage = Math.min(1, blocks.filter(block => STATIC_TYPES.has(classifyLine(block.text).type)
      && !/[._…]{3,}/u.test(block.text)).reduce((total, block) => total + coverage(entry.rect, xyxy(block)), 0));
    if (candidate.source === 'field_row' && staticTextCoverage >= 0.55
      && !guides.some(guide => coverage(guide.rect, entry.rect) > 0.55)) {
      record(entry, 'static_text', 'LEGAL_OR_STATIC_TEXT_ROW'); continue;
    }
    if (candidate.source === 'field_row' && guides.some(guide => coverage(guide.rect, entry.rect) > 0.55)) {
      record(entry, 'static_text', 'ROW_REPLACED_BY_PRECISE_WRITING_GUIDE'); continue;
    }
    if (candidate.source === 'field_row' && contents.length && contents.every(block => {
      const printed = xyxy(block);
      return anchors.some(anchor => anchor.sourceBlockIds.includes(block.id)) && !/[._…]{3,}/u.test(block.text)
        && coverage(entry.rect, printed) > 0.85;
    })) { record(entry, 'label', 'PRINTED_LABEL_WITHOUT_WRITING_AREA'); continue; }
    if (candidate.source === 'writing_guide' && fields.some(field => field.entries.some(cell => coverage(entry.rect, cell.rect) > 0.8))) {
      record(entry, 'container', 'WRITING_GUIDE_INSIDE_TABLE_FIELD'); continue;
    }
    if (candidate.source === 'writing_guide' && candidate.guideStyle === 'underline'
      && entry.rect[0] < 0.2 && rectWidth(entry.rect) <= 0.12
      && blocks.some(block => {
        const printed = xyxy(block);
        const value = normalizeText(block.text);
        return value === value.toLocaleUpperCase('vi-VN') && /\p{L}{3}/u.test(value)
          && !/[:：]/u.test(value) && printed[3] - printed[1] < 0.3
          && printed[2] <= entry.rect[0] + 0.003 && entry.rect[0] - printed[2] <= 0.015
          && entry.rect[1] >= printed[1] && entry.rect[3] <= printed[3];
      })) {
      record(entry, 'static_text', 'DECORATIVE_HEADING_UNDERLINE'); continue;
    }
    if (candidate.source === 'writing_guide' && candidate.guideStyle === 'underline'
      && rectHeight(entry.rect) < 0.025
      && blocks.some(block => {
        const printed = xyxy(block);
        return /ngày[.…_]{2,}\s+tháng[.…_]{2,}\s+năm[.…_]{2,}/iu.test(normalizeText(block.text))
          && entry.rect[0] >= printed[2] - 0.004 && entry.rect[0] <= printed[2] + 0.008
          && entry.rect[1] >= printed[1] && entry.rect[3] <= printed[3]
          && rectWidth(entry.rect) <= rectWidth(printed) * 0.6;
      })) {
      record(entry, 'static_text', 'DECORATIVE_DATE_UNDERLINE'); continue;
    }
    if (candidate.source === 'writing_guide' && candidate.guideStyle === 'underline'
      && rectWidth(entry.rect) >= 0.2
      && guides.some(other => other !== entry && other.candidate.guideStyle === 'underline'
        && overlapY(entry.rect, other.rect) / Math.min(rectHeight(entry.rect), rectHeight(other.rect)) >= 0.2
        && overlapX(entry.rect, other.rect) / Math.min(rectWidth(entry.rect), rectWidth(other.rect)) >= 0.9
        && Math.abs(entry.rect[1] - other.rect[1]) <= 0.01 && Math.abs(entry.rect[3] - other.rect[3]) <= 0.01)) {
      record(entry, 'static_text', 'PAIRED_DECORATIVE_RULE'); continue;
    }
    if (candidate.source === 'writing_guide' && candidate.guideStyle === 'dotted' && (!candidate.shortGuide || dottedBridge)) {
      const preceding = fields.filter(field => field.label && field.inputKind === 'single_line_text'
        && (field.entries.length === 1 || field.entries.length === 2
          && field.entries[1].candidate.shortGuide && field.reasons.includes('FRAGMENTED_DOTTED_GUIDE_REVIEW'))
        && field.entries.every(item => item.candidate.source === 'writing_guide')
        && field.entries.every(item => item.candidate.guideStyle === 'dotted')
        && !field.entries[0].candidate.shortGuide)
        .filter(field => {
          const previous = field.entries.at(-1)!.rect;
          const gap = entry.rect[1] - previous[3];
          return gap >= 0 && gap <= 0.03
            && Math.abs(centerY(entry.rect) - centerY(previous)) <= Math.min(rectHeight(entry.rect), rectHeight(previous)) * 0.5
            && !blocks.some(block => {
              const printed = xyxy(block);
              return overlapY(printed, entry.rect) / Math.min(rectHeight(printed), rectHeight(entry.rect)) >= 0.3
                && printed[1] < entry.rect[1] && printed[3] > previous[3];
            });
        }).sort((left, right) => right.entries.at(-1)!.rect[3] - left.entries.at(-1)!.rect[3])[0];
      if (preceding) {
        preceding.entries.push(entry);
        preceding.reasons.push('SAME_LINE_CONTINUATION');
        if (dottedBridge || preceding.entries.some(item => item.candidate.shortGuide)) preceding.reasons.push('FRAGMENTED_DOTTED_GUIDE_REVIEW');
        continue;
      }
    }
    const matches = anchors.map(anchor => {
      const verticalGap = Math.max(anchor.rect[0] - entry.rect[2], entry.rect[0] - anchor.rect[2], 0);
      const horizontalGap = Math.max(anchor.rect[1] - entry.rect[3], entry.rect[1] - anchor.rect[3], 0);
      const lineScale = Math.max(rectHeight(anchor.rect), rectHeight(entry.rect), 0.005);
      const aligned = Math.abs(centerY(anchor.rect) - centerY(entry.rect)) <= lineScale * 0.8;
      const above = anchor.rect[2] <= entry.rect[0] + lineScale * 0.3 && overlapX(anchor.rect, entry.rect) > 0;
      const score = verticalGap * 6 + horizontalGap + (candidate.shortGuide && !aligned ? 0.1 : 0);
      const leftOfLabel = candidate.source !== 'checkbox' && entry.rect[3] < anchor.rect[1] - 0.005;
      const nextInlineLabel = candidate.source === 'writing_guide' && aligned
        && anchor.rect[1] > entry.rect[1] + Math.min(rectWidth(entry.rect) * 0.2, 0.035);
      return { anchor, verticalGap, horizontalGap, score, allowed: !leftOfLabel && !nextInlineLabel && (aligned || above)
        && verticalGap <= Math.min(0.05, lineScale * 2)
        && horizontalGap <= (candidate.shortGuide && adjacentShortGuideAnchor ? 0.4 : 0.18) };
    }).filter(match => match.allowed).sort((first, second) => first.score - second.score);
    const bestMatch = matches[0];
    let first: (typeof matches)[number] | undefined = bestMatch;
    let ambiguous = !!bestMatch && matches.some(match => {
      if (match.anchor.key === bestMatch.anchor.key) return false;
      const bestAligned = Math.abs(centerY(bestMatch.anchor.rect) - centerY(entry.rect)) <= 0.015;
      const matchAligned = Math.abs(centerY(match.anchor.rect) - centerY(entry.rect)) <= 0.015;
      if (bestAligned && !matchAligned && Math.abs(bestMatch.anchor.rect[0] - match.anchor.rect[0]) >= 0.01) {
        return false;
      }
      return match.score <= bestMatch.score + 0.012;
    });
    let questionScoped = false;
    const inlineLabel = inlineLabels.get(candidate.candidateId);
    if (inlineLabel) {
      first = { anchor: { key: `${inlineLabel.block.id}:${inlineLabel.slot}`, label: inlineLabel.label,
        rect: xyxy(inlineLabel.block), sourceBlockIds: [inlineLabel.block.id], estimated: true },
      verticalGap: 0, horizontalGap: 0, score: 0, allowed: true };
      ambiguous = false;
    }
    if (candidate.source === 'checkbox') {
      const options = blocks.filter(block => {
        const printed = xyxy(block);
        return /\p{L}{2}/u.test(checkboxOptionLabel(block.text))
          && !STATIC_TYPES.has(classifyLine(block.text).type)
          && Math.abs(centerY(printed) - centerY(entry.rect)) <= Math.max(rectHeight(entry.rect), rectHeight(printed)) * 0.8;
      });
      const leftOption = options.filter(block => {
        const printed = xyxy(block);
        const endsBesideSquare = printed[1] < entry.rect[1] - 0.025 && printed[3] >= entry.rect[1] - 0.025
          && printed[3] <= entry.rect[3] + 0.02;
        const squareInsideLineStart = printed[1] >= entry.rect[1] - 0.04 && printed[1] <= entry.rect[1]
          && printed[3] > entry.rect[3];
        return endsBesideSquare || squareInsideLineStart;
      }).sort((left, right) => xyxy(right)[3] - xyxy(left)[3])[0];
      const rightOption = options.filter(block => xyxy(block)[1] >= entry.rect[3] - 0.005 && xyxy(block)[1] - entry.rect[3] <= 0.08)
        .sort((left, right) => xyxy(left)[1] - xyxy(right)[1])[0];
      const option = leftOption ?? (!first ? rightOption : undefined) ?? options.find(block => {
        const printed = xyxy(block);
        return !!copyRequestOption(block.text) && centerX(entry.rect) >= printed[1] - 0.01 && centerX(entry.rect) <= printed[3] + 0.01;
      });
      if (option) {
        const optionText = normalizeText(option.text.split(':').at(-1) ?? option.text);
        const question = checkboxQuestion(blocks, option);
        const continuation = isGroupedCheckboxOption(entry, entries, blocks) ? checkboxOptionContinuation(blocks, option) : undefined;
        const optionLabel = [checkboxOptionLabel(option.text), continuation ? normalizeText(continuation.text) : ''].filter(Boolean).join(' ');
        questionScoped = !!question;
        first = { anchor: { key: option.id, label: question ? `${question.label} — ${optionLabel}` : optionLabel,
          rect: xyxy(option), sourceBlockIds: [...new Set([option.id, ...(continuation ? [continuation.id] : []), ...(question ? [question.block.id] : [])])],
          estimated: !!question || TRAILING_CHOICE_GLYPH.test(optionText) }, verticalGap: 0, horizontalGap: 0, score: 0, allowed: true };
        ambiguous = false;
      }
    }
    if (!first && ['writing_guide', 'closed_contour'].includes(candidate.source) && rectWidth(entry.rect) >= 0.08) {
      const inlineLabel = blocks.filter(block => {
        const printed = xyxy(block);
        const lineScale = Math.max(rectHeight(printed), rectHeight(entry.rect));
        return /\p{L}{3}/u.test(block.text) && !STATIC_TYPES.has(classifyLine(block.text).type)
          && Math.abs(centerY(printed) - centerY(entry.rect)) <= lineScale * 0.8
          && printed[1] < entry.rect[1] - 0.05 && printed[3] >= entry.rect[1] - 0.035
          && printed[3] <= entry.rect[3] + 0.02;
      }).sort((left, right) => xyxy(right)[3] - xyxy(left)[3])[0];
      if (inlineLabel) {
        first = { anchor: { key: inlineLabel.id, label: normalizeText(inlineLabel.text), rect: xyxy(inlineLabel),
          sourceBlockIds: [inlineLabel.id], estimated: true }, verticalGap: 0, horizontalGap: 0, score: 0, allowed: true };
        ambiguous = false;
      }
    }
    const newRowLabel = candidate.source === 'writing_guide' && (
      anchors.find(anchor => Math.abs(centerY(anchor.rect) - centerY(entry.rect)) <= Math.max(rectHeight(anchor.rect), rectHeight(entry.rect)) * 0.8
        && anchor.rect[3] <= entry.rect[1] + 0.01 && entry.rect[1] - anchor.rect[3] <= 0.25)
      || blocks.find(block => {
        const printed = xyxy(block);
        return /\p{L}{3}/u.test(block.text) && !STATIC_TYPES.has(classifyLine(block.text).type)
          && Math.abs(centerY(printed) - centerY(entry.rect)) <= Math.max(rectHeight(printed), rectHeight(entry.rect)) * 0.8
          && printed[1] < entry.rect[1] - 0.02 && printed[3] <= entry.rect[1] + 0.01
          && entry.rect[1] - printed[3] <= 0.25;
      })
    );
    const fusedDateLabel = candidate.source === 'writing_guide' && rectWidth(entry.rect) <= 0.06
      && hasFusedDateContext(entry, blocks);
    if (newRowLabel && first && first.anchor.rect[2] < entry.rect[0] - 0.005) {
      first = undefined;
      ambiguous = false;
    }
    if (fusedDateLabel) { first = undefined; ambiguous = false; }
    if (candidate.source === 'writing_guide' && !first && !newRowLabel && !fusedDateLabel) {
      const previous = fields.filter(field => ['single_line_text', 'multiline_text'].includes(field.inputKind) && field.label
        && field.entries.every(item => item.candidate.source === 'writing_guide')).filter(field => {
        const last = field.entries.at(-1)!.rect;
        const gap = entry.rect[0] - last[2];
        const sharedColumn = overlapX(entry.rect, last) / Math.min(rectWidth(entry.rect), rectWidth(last)) >= 0.6;
        const boundary = blocks.some(block => xyxy(block)[0] >= last[2] && xyxy(block)[0] < entry.rect[0]
          && overlapX(xyxy(block), entry.rect) > 0 && (STATIC_TYPES.has(classifyLine(block.text).type) || anchors.some(anchor => anchor.sourceBlockIds.includes(block.id))));
        const inlineLabelBoundary = isInlineLabelBoundary(last, entry.rect, blocks);
        return gap >= -0.001 && gap <= Math.max(rectHeight(last), rectHeight(entry.rect)) * 2.2
          && sharedColumn && !boundary && !inlineLabelBoundary;
      }).sort((left, right) => right.entries.at(-1)!.rect[2] - left.entries.at(-1)!.rect[2])[0];
      if (previous) { previous.entries.push(entry); previous.inputKind = 'multiline_text'; previous.reasons.push('MULTILINE_CONTINUATION'); continue; }
    }
    if (!first && candidate.source === 'field_row' && contents.length) {
      record(entry, 'description', 'PRINTED_TEXT_WITHOUT_INPUT_LABEL'); continue;
    }
    const collidingAnchor = anchors.find(anchor => anchor.key !== first?.anchor.key
      && Math.abs(centerY(anchor.rect) - centerY(entry.rect)) <= Math.max(rectHeight(anchor.rect), rectHeight(entry.rect)) * 0.8
      && overlapX(anchor.rect, entry.rect) >= Math.min(rectWidth(anchor.rect) * 0.4, 0.035));
    if (collidingAnchor) ambiguous = true;
    const unanchoredNewRowLabel = candidate.source === 'writing_guide' && blocks.find(block => {
      const printed = xyxy(block);
      const text = normalizeText(block.text);
      const knownShortLabel = /^(?:Tại|Nơi cấp|Tại nơi cấp)$/iu.test(text);
      const horizontalGap = entry.rect[1] - printed[3];
      return knownShortLabel && text.length <= 25 && /\p{L}{3}/u.test(text)
        && Math.abs(centerY(printed) - centerY(entry.rect)) <= Math.max(rectHeight(printed), rectHeight(entry.rect)) * 0.8
        && printed[1] < entry.rect[1] - 0.02 && horizontalGap >= -0.025 && horizontalGap <= 0.025;
    });
    if (unanchoredNewRowLabel) {
      first = { anchor: { key: `inline:${unanchoredNewRowLabel.id}`, label: normalizeText(unanchoredNewRowLabel.text).replace(/[:：]\s*$/u, ''),
        rect: xyxy(unanchoredNewRowLabel), sourceBlockIds: [unanchoredNewRowLabel.id], estimated: true },
      verticalGap: 0, horizontalGap: 0, score: 0, allowed: true };
      ambiguous = false;
    }
    const label = first && !ambiguous ? first.anchor.label
      : unanchoredNewRowLabel ? normalizeText(unanchoredNewRowLabel.text).replace(/[:：]\s*$/u, '') : '';
    const anchorKey = first && !ambiguous ? first.anchor.key
      : unanchoredNewRowLabel ? `inline:${unanchoredNewRowLabel.id}` : `unknown:${candidate.candidateId}`;
    const existing = fields.find(field => field.anchorKey === anchorKey);
    if (existing?.inputKind === 'character_slots') {
      fields.push({ label: '', anchorKey: `unknown:${candidate.candidateId}`, entries: [entry], inputKind: 'single_line_text',
        sourceBlockIds: [], reasons: ['LABEL_ALREADY_ASSIGNED_TO_CHARACTER_SLOTS'] });
      continue;
    }
    if (existing && candidate.source === 'writing_guide' && !newRowLabel && !fusedDateLabel
      && existing.entries.every(item => item.candidate.source === 'writing_guide')
      && !isInlineLabelBoundary(existing.entries.at(-1)!.rect, entry.rect, blocks, true)
      && entry.rect[0] >= existing.entries.at(-1)!.rect[2] && overlapX(entry.rect, existing.entries.at(-1)!.rect) / Math.min(rectWidth(entry.rect), rectWidth(existing.entries.at(-1)!.rect)) > 0.5
      && entry.rect[0] - existing.entries.at(-1)!.rect[2] <= Math.max(rectHeight(entry.rect), rectHeight(existing.entries.at(-1)!.rect)) * 2.2) {
      if (overlapX(entry.rect, existing.entries.at(-1)!.rect) / Math.min(rectWidth(entry.rect), rectWidth(existing.entries.at(-1)!.rect)) < 0.6) {
        existing.reasons.push('SHIFTED_MULTILINE_CONTINUATION');
      }
      existing.entries.push(entry); existing.inputKind = 'multiline_text'; existing.reasons.push('MULTILINE_CONTINUATION'); continue;
    }
    if (existing && candidate.source === 'writing_guide' && !fusedDateLabel
      && existing.entries.every(item => item.candidate.source === 'writing_guide')) {
      const last = existing.entries.at(-1)!.rect;
      const gap = entry.rect[1] - last[3];
      const sameRow = Math.abs(centerY(entry.rect) - centerY(last)) <= Math.min(rectHeight(entry.rect), rectHeight(last)) * 0.5;
      if (sameRow && gap >= -0.002 && (gap <= 0.06
        || candidate.shortGuide && existing.entries.at(-1)!.candidate.shortGuide && gap <= 0.15)) {
        existing.entries.push(entry); existing.reasons.push('SAME_LINE_CONTINUATION'); continue;
      }
    }
    const reasons = ambiguous ? ['AMBIGUOUS_LABEL'] : !label ? ['MISSING_LABEL']
      : first?.anchor.estimated || unanchoredNewRowLabel ? ['LABEL_POSITION_ESTIMATED'] : ['LABEL_GEOMETRY_MATCH'];
    if (candidate.shortGuide) reasons.push('SHORT_GUIDE_GEOMETRY_REVIEW');
    if (inlineLabel) reasons.push('INLINE_DOTTED_SLOT_INFERRED');
    if (newRowLabel && !label) reasons.push('INLINE_LABEL_UNPARSED');
    if (questionScoped) reasons.push('CHECKBOX_QUESTION_SCOPE_INFERRED');
    if (existing) {
      const duplicateGeometry = existing.entries.some(previous => previous.rect.every((coordinate, index) => Math.abs(coordinate - entry.rect[index]) <= 0.001));
      if (duplicateGeometry) existing.label = '';
      existing.reasons.push('DUPLICATE_LABEL_NOT_A_CONTINUATION'); reasons.push('DUPLICATE_LABEL_NOT_A_CONTINUATION');
    }
    fields.push({ label: existing ? '' : label, anchorKey, entries: [entry], inputKind: candidate.source === 'checkbox' ? 'checkbox' : 'single_line_text',
      sourceBlockIds: first?.anchor.sourceBlockIds ?? (newRowLabel ? ('sourceBlockIds' in newRowLabel ? newRowLabel.sourceBlockIds : [newRowLabel.id]) : []), reasons });
  }
  inferBirthDateWordsLabel(fields, blocks);
  inferActorScopes(fields, blocks);
  inferColumnActorScopes(fields, blocks);
  splitRegistrationDateGuides(fields, blocks);
  inferMaritalHistoryField(fields, blocks);
  inferCopyCountField(fields, blocks);
  suppressMaritalDeclarationOverlap(fields, blocks, regions);
  suppressSignatureGuides(fields, blocks, regions);
  inferSigningDateParts(fields, blocks);
  inferAdministrativeNumber(fields, blocks);
  inferRegistrationNumber(fields, blocks);
  inferAdministrativeDateParts(fields, blocks);
  const labelCounts = new Map<string, number>();
  for (const field of fields) if (field.label) labelCounts.set(field.label, (labelCounts.get(field.label) ?? 0) + 1);
  for (const field of fields) if (field.label && (labelCounts.get(field.label) ?? 0) > 1) field.reasons.push('REPEATED_LABEL_SCOPE_REVIEW');
  const boxes: FormGeometricBox[] = fields.sort((first, second) => {
    const firstRect = first.entries[0].rect, secondRect = second.entries[0].rect;
    const sameRow = Math.abs(centerY(firstRect) - centerY(secondRect)) <= Math.min(rectHeight(firstRect), rectHeight(secondRect)) * 0.5;
    return sameRow ? firstRect[1] - secondRect[1] : firstRect[0] - secondRect[0] || firstRect[1] - secondRect[1];
  }).map((field, index) => {
    const sourceBlocks = blocks.filter(block => field.sourceBlockIds.includes(block.id));
    if (sourceBlocks.some(block => block.confidence === null || block.confidence === undefined)) field.reasons.push('OCR_CONFIDENCE_UNAVAILABLE');
    else if (sourceBlocks.some(block => block.confidence! < 0.93)) field.reasons.push('OCR_LOW_CONFIDENCE');
    const boxId = `box_${String(index + 1).padStart(3, '0')}`;
    const fragmentedGuideRow = field.entries.length > 1 && field.entries.every(entry => entry.candidate.shortGuide
      && entry.candidate.source === 'writing_guide'
      && Math.abs(centerY(entry.rect) - centerY(field.entries[0].rect)) <= Math.min(rectHeight(entry.rect), rectHeight(field.entries[0].rect)) * 0.5)
      && !field.entries.slice(1).some((entry, index) => blocks.some(block => {
        if (block.confidence === null || block.confidence === undefined || block.confidence < 0.6
          || !/[\p{L}\p{N}]/u.test(block.text)) return false;
        const previous = field.entries[index].rect;
        const printed = xyxy(block);
        const overlapsGuideGap = printed[1] < entry.rect[1] && printed[3] > previous[3];
        return overlapsGuideGap && Math.abs(centerY(printed) - centerY(entry.rect))
          <= Math.max(rectHeight(printed), rectHeight(entry.rect)) * 0.8;
      }));
    const mergedGuideRect = fragmentedGuideRow ? field.entries.reduce((rect, entry) => [
      Math.min(rect[0], entry.rect[0]), Math.min(rect[1], entry.rect[1]),
      Math.max(rect[2], entry.rect[2]), Math.max(rect[3], entry.rect[3]),
    ] as NormalizedBoundingBox, field.entries[0].rect) : undefined;
    const inputRegions = mergedGuideRect
      ? [{ regionId: `${boxId}_region_1`, pageNumber: 1, normalizedCoords: mergedGuideRect }]
      : field.entries.map((entry, regionIndex) => ({ regionId: `${boxId}_region_${regionIndex + 1}`, pageNumber: 1, normalizedCoords: entry.rect }));
    const inputKind = field.inputKind;
    const role: RegionRole = inputKind === 'checkbox' ? 'checkbox' : inputKind === 'character_slots' ? 'character_slots' : 'input';
    field.entries.forEach(entry => record(entry, field.label ? role : 'unresolved', field.reasons.join('; ')));
    const rawText = normalizeOutputLabel(field.label);
    return { boxId, rawText, normalizedCoords: inputRegions[0].normalizedCoords, estimatedWidthRatio: rectWidth(inputRegions[0].normalizedCoords),
      boxType: inputKind === 'checkbox' ? 'checkbox' : inputKind === 'table_cell' ? 'table_cell' : 'text', inputKind, role, inputRegions,
      recognition: { status: !field.label || prioritizedReviewReasons(field.reasons).length > 0 ? 'needs_review' : 'suggested',
        sourceCandidateIds: field.entries.map(entry => entry.candidate.candidateId), sourceBlockIds: [...new Set(field.sourceBlockIds)], reviewReasons: [...new Set(field.reasons)] } };
  });
  return { boxes, regions, continuationHeader: table.continuationHeader, summary: { detectedFields: boxes.length, labeledFields: boxes.filter(box => box.rawText).length,
    needsReview: boxes.filter(box => box.recognition?.status === 'needs_review').length,
    excludedRegions: regions.filter(region => !['input', 'checkbox', 'character_slots', 'unresolved'].includes(region.role)).length } };
}
