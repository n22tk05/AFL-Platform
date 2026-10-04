import { GoogleDocumentAiProvider } from '@/modules/documents/providers/google-document-ai';
import { VietOcrProvider } from '@/modules/documents/providers/vietocr-provider';
import { MarkdownExportService } from '@/modules/documents/services/markdown-export.service';
import { handleMarkdownConversion } from '@/modules/documents/markdown-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: Request): Promise<Response> {
  const provider = (process.env.DOCUMENT_OCR_PROVIDER || 'vietocr') === 'vietocr'
    ? new VietOcrProvider()
    : new GoogleDocumentAiProvider();
  return handleMarkdownConversion(req, () => new MarkdownExportService(provider));
}
