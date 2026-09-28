import { createDocumentExtractionService } from '@/modules/documents/server';
import { handleDocumentExtraction } from '@/modules/documents/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  return handleDocumentExtraction(req, createDocumentExtractionService);
}
