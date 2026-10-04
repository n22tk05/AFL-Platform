import { createDocumentOcrProvider } from '@/modules/documents/server';
import { MarkdownExportService } from '@/modules/documents/services/markdown-export.service';
import { handleMarkdownConversion } from '@/modules/documents/markdown-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: Request): Promise<Response> {
  return handleMarkdownConversion(req, () => new MarkdownExportService(createDocumentOcrProvider()));
}
