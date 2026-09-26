import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';

export interface FormRepository {
  saveDraft(manifest: FormGeometricManifest, workflow: FormWorkflow): Promise<{
    templateId: string;
    manifestId: string;
    workflowId: string;
    stepCount: number;
  }>;
  saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    templateId: string;
    manifestId: string;
  }>;
  saveWorkflow(workflow: FormWorkflow): Promise<{
    workflowId: string;
    stepCount: number;
  }>;
  getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null>;
  approveWorkflow(formCode: string, performedBy: string, note?: string, reviewerName?: string): Promise<void>;
}
