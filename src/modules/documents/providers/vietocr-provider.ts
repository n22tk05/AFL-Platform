import type { DocumentOcrInput, DocumentOcrProvider, DocumentOcrResult } from '@/shared/document-extraction.types';
import { VietOcrAdapter, type VietOcrConfig } from '@/modules/ocr/vietocr-adapter';
import { DocumentPipelineError } from '../errors';

/**
 * VietOCR Vietnamese Document OCR Provider
 * Integrates line segmentation with VietOCR recognition
 */
export class VietOcrProvider implements DocumentOcrProvider {
  private readonly adapter: VietOcrAdapter;

  constructor(config: Partial<VietOcrConfig> = {}) {
    this.adapter = new VietOcrAdapter(config);
  }

  async extract(input: DocumentOcrInput): Promise<DocumentOcrResult> {
    if (typeof window !== 'undefined') {
      throw new Error('SERVER_ONLY');
    }

    if (input.signal?.aborted) {
      throw new DocumentPipelineError('OCR_TIMEOUT');
    }

    try {
      const base64 = Buffer.from(input.bytes).toString('base64');
      const dataUrl = `data:${input.mimeType};base64,${base64}`;

      // Call VietOCR recognition (microservice auto-segments full documents into lines)
      const detectedLines = await this.adapter.recognizeDocument(
        dataUrl,
        input.signal,
      );

      const lines = detectedLines.map((l, idx) => ({
        id: l.lineId || `line_${String(idx + 1).padStart(3, '0')}`,
        text: l.rawText,
        confidence: l.confidence,
        boundingBox: l.coordinates,
        page: 1,
        tokenIds: [],
      }));

      // Assemble fullText with natural paragraph and header breaks
      let fullText = '';
      for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        if (i === 0) {
          fullText += cur.text;
        } else {
          const prev = lines[i - 1];
          const verticalGap = cur.boundingBox[0] - prev.boundingBox[2];
          if (verticalGap > 0.025) {
            fullText += '\n\n' + cur.text;
          } else {
            fullText += '\n' + cur.text;
          }
        }
      }

      const warnings: string[] = [];
      if (!fullText.trim()) {
        warnings.push('OCR_EMPTY_TEXT');
      }

      return {
        provider: 'vietocr',
        fullText,
        lines,
        tokens: [],
        tables: [],
        pageCount: 1,
        warnings,
      };
    } catch (error) {
      if (error instanceof DocumentPipelineError) throw error;
      if (input.signal?.aborted) throw new DocumentPipelineError('OCR_TIMEOUT');
      throw new DocumentPipelineError('OCR_UNAVAILABLE');
    }
  }
}
