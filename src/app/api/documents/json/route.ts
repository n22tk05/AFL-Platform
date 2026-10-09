import { createDocumentOcrProvider } from '@/modules/documents/server';
import { JsonExportService } from '@/modules/documents/services/json-export.service';
import { handleJsonConversion, handleJsonSchema } from '@/modules/documents/json-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;
export const GET = handleJsonSchema;

export async function POST(req: Request): Promise<Response> {
  return handleJsonConversion(req, () => new JsonExportService(createDocumentOcrProvider()));
}
