import { adminAuthorizationService } from '@/modules/forms';
import { formArtifactStore } from '@/modules/forms/services/form-artifact-store';
import { handleFormAssetUpload } from '@/modules/forms/form-assets.api';

export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleFormAssetUpload(req, adminAuthorizationService, formArtifactStore); }
