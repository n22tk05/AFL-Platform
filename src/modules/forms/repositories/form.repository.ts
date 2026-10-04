import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';
import type { AdminFormSummary, PublicFormSummary } from '@/modules/forms/types/form.types';
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
  listForms(): Promise<AdminFormSummary[]>;
  listActiveForms(): Promise<PublicFormSummary[]>;
  getWorkflowForReview(formCode: string): Promise<FormWorkflow | null>;
  saveReviewWorkflow(formCode: string, workflow: FormWorkflow): Promise<{ workflowId: string; stepCount: number }>;
  approveWorkflow(formCode: string, performedBy: string, note?: string, reviewerName?: string): Promise<void>;
}
