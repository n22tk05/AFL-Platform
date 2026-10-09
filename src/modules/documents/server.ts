import 'server-only';
import { VietOcrProvider } from './providers/vietocr-provider';
import { GeminiStructuredProvider } from './providers/gemini-structured';
import { DocumentExtractionService } from './services/document-extraction.service';
import { acceptanceThreshold } from './config';
import { DocumentPipelineError } from './errors';
import { JsonExportService } from './services/json-export.service';

export function createDocumentOcrProvider(): VietOcrProvider {
  const providerType = process.env.DOCUMENT_OCR_PROVIDER || 'vietocr';
  if (providerType !== 'vietocr') {
    throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
  }
  return new VietOcrProvider();
}

export function createDocumentExtractionService(): DocumentExtractionService {
  return new DocumentExtractionService(createDocumentOcrProvider(), new GeminiStructuredProvider(), acceptanceThreshold());
}

export function createJsonExportService(): JsonExportService {
  return new JsonExportService(createDocumentOcrProvider());
}
