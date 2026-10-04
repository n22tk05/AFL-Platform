import { handleCandidateOcr } from '@/modules/documents/candidates-api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request): Promise<Response> { return handleCandidateOcr(req); }
