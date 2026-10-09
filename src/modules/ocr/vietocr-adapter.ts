import type { DetectedLineText, NormalizedBoundingBox } from '@/shared/contracts';

export interface VietOcrLineInput {
  lineId: string;
  /** Image as Base64 string, data URL, or Buffer */
  image: string;
  coordinates: NormalizedBoundingBox;
  originalWidth?: number;
  originalHeight?: number;
}

export interface VietOcrConfig {
  /** Microservice REST endpoint for VietOCR (default: process.env.VIETOCR_ENDPOINT or 'http://127.0.0.1:8000/predict') */
  endpoint?: string;
  /** Network timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Concurrency batch size for line recognition requests (default: 8) */
  batchSize?: number;
  /** Explicit test-only mock fallback. Disabled by default, including development. */
  allowOfflineFallback?: boolean;
}

export interface VietOcrTableLayout {
  id: string;
  headerRowCount: number;
  rows: { lineIds: string[]; coordinates: NormalizedBoundingBox }[][];
}
export interface VietOcrDocumentLayout {
  lines: DetectedLineText[];
  tables: VietOcrTableLayout[];
  warnings: string[];
  skewDegrees: number;
}

const validCoordinates = (box: unknown): box is NormalizedBoundingBox => Array.isArray(box) && box.length === 4
  && box.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
  && box[0] < box[2] && box[1] < box[3];

function readLayout(data: Record<string, unknown>, lines: DetectedLineText[]): Omit<VietOcrDocumentLayout, 'lines'> {
  const tables = data.tables ?? [], warnings = data.warnings ?? [], skewDegrees = data.skewDegrees ?? 0;
  if (!Array.isArray(tables) || tables.length > 100 || !Array.isArray(warnings)
    || warnings.length > 100 || warnings.some(w => typeof w !== 'string' || !/^[A-Z0-9_]{1,100}$/.test(w))
    || typeof skewDegrees !== 'number' || !Number.isFinite(skewDegrees) || Math.abs(skewDegrees) > 12)
    throw new VietOcrResponseError('Invalid document layout metadata');
  const lineIds = new Set(lines.map(l => l.lineId)), assigned = new Set<string>(), tableIds = new Set<string>();
  let cells = 0;
  for (const table of tables) {
    if (!table || typeof table !== 'object' || typeof table.id !== 'string' || !table.id || tableIds.has(table.id)
      || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 100
      || !Number.isInteger(table.headerRowCount) || table.headerRowCount < 0 || table.headerRowCount > table.rows.length)
      throw new VietOcrResponseError('Invalid table layout');
    tableIds.add(table.id);
    const columns = table.rows[0]?.length;
    if (!columns || columns > 50) throw new VietOcrResponseError('Invalid table columns');
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== columns) throw new VietOcrResponseError('Invalid rectangular table layout');
      for (const cell of row) {
        if (++cells > 4000 || !cell || !validCoordinates(cell.coordinates) || !Array.isArray(cell.lineIds) || !cell.lineIds.length
          || cell.lineIds.some((id: unknown) => typeof id !== 'string' || !lineIds.has(id) || assigned.has(id)))
          throw new VietOcrResponseError('Invalid table cell source alignment');
        for (const id of cell.lineIds) {
          if (assigned.has(id)) throw new VietOcrResponseError('Duplicate table cell source alignment');
          assigned.add(id);
        }
      }
    }
  }
  return { tables, warnings, skewDegrees };
}

export const DEFAULT_VIETOCR_CONFIG: Readonly<VietOcrConfig> = Object.freeze({
  endpoint: process.env.VIETOCR_ENDPOINT || 'http://127.0.0.1:8000/predict',
  timeoutMs: Number(process.env.DOCUMENT_OCR_TIMEOUT_MS || 60_000),
  batchSize: 8,
  allowOfflineFallback: false,
});

class VietOcrResponseError extends Error {}
export class VietOcrTimeoutError extends Error {}

/**
 * Normalizes line image dimensions for VietOCR:
 * VietOCR models expect a fixed height of 32px while maintaining the original aspect ratio.
 */
export function calculateVietOcrDimensions(
  originalWidth: number,
  originalHeight: number,
  targetHeight = 32,
): { width: number; height: number } {
  if (originalHeight <= 0 || originalWidth <= 0) {
    return { width: targetHeight, height: targetHeight };
  }
  const aspectRatio = originalWidth / originalHeight;
  const width = Math.max(16, Math.min(1024, Math.round(targetHeight * aspectRatio)));
  return { width, height: targetHeight };
}

/**
 * Adapter for VietOCR Vietnamese text recognition
 */
export class VietOcrAdapter {
  private readonly config: VietOcrConfig;

  constructor(overrides: Partial<VietOcrConfig> = {}) {
    this.config = { ...DEFAULT_VIETOCR_CONFIG, ...overrides };
  }

  /**
   * Recognizes Vietnamese text from an array of cropped line images.
   * Returns sorted DetectedLineText with normalized bounding boxes.
   */
  async recognizeLines(
    lines: VietOcrLineInput[],
    signal?: AbortSignal,
  ): Promise<DetectedLineText[]> {
    return this.recognize(lines, signal);
  }

  private async recognize(lines: VietOcrLineInput[], signal?: AbortSignal, onLayout?: (data: Record<string, unknown>) => void): Promise<DetectedLineText[]> {
    if (!lines.length) return [];

    // Attempt to call VietOCR microservice if endpoint configured
    const endpoint = this.config.endpoint;
    if (endpoint) {
      try {
        // Empty predictions are a genuine OCR result, not a service failure.
        return await this.callMicroservice(lines, endpoint, signal, onLayout);
      } catch (error) {
        // A malformed response cannot be replaced with plausible-looking mock text.
        if (error instanceof VietOcrResponseError) throw error;
        if (error instanceof VietOcrTimeoutError) throw error;
        if (!this.config.allowOfflineFallback) {
          throw new Error(
            `VietOCR service unavailable at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        // In offline/test environments, proceed to fallback synthesizer
      }
    }

    if (!this.config.allowOfflineFallback) {
      throw new Error('VietOCR endpoint is not configured.');
    }

    // Explicit testing mock fallback
    return this.synthesizeOfflineResults(lines);
  }

  /**
   * Recognizes Vietnamese text from a full document image.
   * Auto-segments into lines and returns all recognized lines with coordinates.
   */
  async recognizeDocument(
    image: string,
    signal?: AbortSignal,
  ): Promise<DetectedLineText[]> {
    return this.recognizeLines(
      [
        {
          lineId: 'line_full_doc',
          image,
          coordinates: [0, 0, 1, 1],
        },
      ],
      signal,
    );
  }

  async recognizeDocumentWithLayout(image: string, signal?: AbortSignal): Promise<VietOcrDocumentLayout> {
    let metadata: Record<string, unknown> = {};
    const lines = await this.recognize([{ lineId: 'line_full_doc', image, coordinates: [0, 0, 1, 1] }], signal,
      data => { metadata = data; });
    return { lines, ...readLayout(metadata, lines) };
  }

  /**
   * Calls external Python/FastAPI VietOCR microservice
   */
  private async callMicroservice(
    lines: VietOcrLineInput[],
    endpoint: string,
    signal?: AbortSignal,
    onLayout?: (data: Record<string, unknown>) => void,
  ): Promise<DetectedLineText[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const payload = {
        lines: lines.map(line => ({
          lineId: line.lineId,
          image: line.image,
          dimensions: calculateVietOcrDimensions(
            line.originalWidth || 100,
            line.originalHeight || 32,
          ),
          coordinates: line.coordinates,
        })),
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`VietOCR service returned status ${res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data.predictions)) {
        throw new VietOcrResponseError('Invalid response structure from VietOCR service.');
      }
      onLayout?.(data);

      if (!data.predictions.length) return [];
      if (data.predictions.some((pred: unknown) => !pred || typeof pred !== 'object' || Array.isArray(pred)
        || ('text' in pred && typeof pred.text !== 'string' && pred.text !== null)
        || ('lineId' in pred && typeof pred.lineId !== 'string' && pred.lineId !== null))) {
        throw new VietOcrResponseError('Invalid prediction item from VietOCR service.');
      }

      if (
        data.predictions.length > 0 &&
        lines.length === 1 &&
        lines[0].coordinates[0] === 0 &&
        lines[0].coordinates[1] === 0 &&
        lines[0].coordinates[2] === 1 &&
        lines[0].coordinates[3] === 1
      ) {
        const ids = data.predictions.map((pred: { lineId?: string }, idx: number) => pred.lineId || `line_${String(idx + 1).padStart(3, '0')}`);
        if (new Set(ids).size !== ids.length) throw new VietOcrResponseError('Duplicate full-document line IDs prevent reliable OCR alignment.');
        return data.predictions.map(
          (
            pred: {
              lineId?: string;
              text?: string;
              confidence?: number;
              coordinates?: NormalizedBoundingBox;
            },
            idx: number,
          ) => ({
            lineId: pred.lineId || `line_${String(idx + 1).padStart(3, '0')}`,
            coordinates:
              Array.isArray(pred.coordinates) && pred.coordinates.length === 4
                ? (pred.coordinates as NormalizedBoundingBox)
                : null,
            rawText: String(pred.text ?? ''),
            confidence:
              typeof pred.confidence === 'number' && Number.isFinite(pred.confidence) && pred.confidence >= 0 && pred.confidence <= 1 ? pred.confidence : null,
          }),
        );
      }

      const inputIds = new Set(lines.map(line => line.lineId));
      if (inputIds.size !== lines.length) {
        throw new VietOcrResponseError('Duplicate input line IDs prevent reliable OCR alignment.');
      }
      const predictions = data.predictions as {
        lineId?: unknown;
        text?: string;
        confidence?: number;
        coordinates?: NormalizedBoundingBox;
      }[];
      if (predictions.some(pred => !pred || typeof pred !== 'object')) {
        throw new VietOcrResponseError('Invalid prediction item from VietOCR service.');
      }
      const allIdsMissing = predictions.every(pred => pred.lineId === undefined || pred.lineId === null);
      const byId = new Map<string, typeof predictions[number]>();
      if (allIdsMissing) {
        if (predictions.length !== lines.length) {
          throw new VietOcrResponseError('OCR result count prevents reliable positional alignment.');
        }
      } else {
        for (const pred of predictions) {
          if (typeof pred.lineId !== 'string' || !inputIds.has(pred.lineId) || byId.has(pred.lineId)) {
            throw new VietOcrResponseError('Unknown, duplicate or mixed OCR line IDs prevent reliable alignment.');
          }
          byId.set(pred.lineId, pred);
        }
      }

      return lines.map((line, idx) => {
        const pred = (allIdsMissing ? predictions[idx] : byId.get(line.lineId)) || {};
        return {
          lineId: line.lineId,
          coordinates:
            Array.isArray(pred.coordinates) && pred.coordinates.length === 4
              ? (pred.coordinates as NormalizedBoundingBox)
              : line.coordinates,
          rawText: String(pred.text ?? ''),
          confidence:
            typeof pred.confidence === 'number' && Number.isFinite(pred.confidence) && pred.confidence >= 0 && pred.confidence <= 1 ? pred.confidence : null,
        };
      });
    } catch (error) {
      if (controller.signal.aborted) throw new VietOcrTimeoutError('VietOCR request timed out or was cancelled.');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  /**
   * Offline / Testing fallback for line recognition
   */
  private synthesizeOfflineResults(lines: VietOcrLineInput[]): DetectedLineText[] {
    return lines.map((line, idx) => ({
      lineId: line.lineId,
      coordinates: line.coordinates,
      rawText: `Dòng văn bản nhận diện ${idx + 1}`,
      confidence: 0.98,
    }));
  }
}
