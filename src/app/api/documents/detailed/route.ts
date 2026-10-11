import { handleDetailedExtraction } from '@/modules/documents/detailed-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(req: Request): Promise<Response> { return handleDetailedExtraction(req); }
