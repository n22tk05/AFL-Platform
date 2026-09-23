import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';

export interface FormRepository {
  saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    templateId: string;
    manifestId: string;
  }>;
  saveWorkflow(workflow: FormWorkflow): Promise<{
    workflowId: string;
    stepCount: number;
  }>;
  getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null>;
  approveWorkflow(formCode: string, performedBy: string, note?: string): Promise<void>;
}
