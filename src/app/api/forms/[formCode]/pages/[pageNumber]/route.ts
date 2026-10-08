import { formPersistenceService } from '@/modules/forms';
import { formArtifactStore } from '@/modules/forms/services/form-artifact-store';
import { handleFormImage } from '@/modules/forms/form-image.api';

export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { formCode: string; pageNumber: string } }) {
  return handleFormImage(req, params.formCode, params.pageNumber, {
    load: code => formPersistenceService.getWorkflowByFormCode(code), store: formArtifactStore,
  });
}
