import 'server-only';
import { GoogleDocumentAiProvider } from './providers/google-document-ai';
import { GeminiStructuredProvider } from './providers/gemini-structured';
import { DocumentExtractionService } from './services/document-extraction.service';
import { acceptanceThreshold } from './config';
import { DocumentPipelineError } from './errors';

export function createDocumentExtractionService(): DocumentExtractionService {
  if ((process.env.DOCUMENT_OCR_PROVIDER || 'google-document-ai') !== 'google-document-ai') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
  return new DocumentExtractionService(new GoogleDocumentAiProvider(), new GeminiStructuredProvider(), acceptanceThreshold());
}
