import { GoogleDocumentAiProvider } from '@/modules/documents/providers/google-document-ai';
import { GeminiMarkdownProvider } from '@/modules/documents/providers/gemini-markdown';
import { MarkdownExportService } from '@/modules/documents/services/markdown-export.service';
import { InputError, parseDocumentImage } from '@/modules/documents/api';
import { DocumentPipelineError } from '@/modules/documents/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  try {
    const input = await parseDocumentImage(req);
    if ((process.env.DOCUMENT_OCR_PROVIDER || 'google-document-ai') !== 'google-document-ai') throw new DocumentPipelineError('OCR_NOT_CONFIGURED');
    const markdown = await new MarkdownExportService(new GoogleDocumentAiProvider(), new GeminiMarkdownProvider()).convert(input);
    return new Response(markdown, { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="document.md"',
      'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    const code = error instanceof InputError || error instanceof DocumentPipelineError ? error.code : 'DOCUMENT_EXPORT_FAILED';
    const status = error instanceof InputError ? error.status : code === 'OCR_NOT_CONFIGURED' ? 503 : 502;
    return Response.json({ success: false, error: { code, message_vi: 'Không thể xuất Markdown. Kiểm tra cấu hình Google Document AI/Gemini hoặc thử ảnh khác.' } },
      { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
  }
}
