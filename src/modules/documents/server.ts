import 'server-only';
import { GoogleDocumentAiProvider } from './providers/google-document-ai';
import { VietOcrProvider } from './providers/vietocr-provider';
import { GeminiStructuredProvider } from './providers/gemini-structured';
import { DocumentExtractionService } from './services/document-extraction.service';
import { acceptanceThreshold } from './config';
import { DocumentPipelineError } from './errors';

export function createDocumentExtractionService(): DocumentExtractionService {
  const providerType = process.env.DOCUMENT_OCR_PROVIDER || 'vietocr';
  if (providerType !== 'vietocr' && providerType !== 'google-document-ai') {
    throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
  }
  const ocrProvider = providerType === 'vietocr'
    ? new VietOcrProvider()
    : new GoogleDocumentAiProvider();
  return new DocumentExtractionService(ocrProvider, new GeminiStructuredProvider(), acceptanceThreshold());
}
