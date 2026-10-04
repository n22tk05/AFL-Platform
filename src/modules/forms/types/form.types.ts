export interface SaveManifestResult {
  success: boolean;
  templateId?: string;
  manifestId?: string;
  source: 'database';
}

export interface SaveWorkflowResult {
  success: boolean;
  workflowId?: string;
  stepCount?: number;
  source: 'database';
}

export interface ApproveWorkflowResult {
  success: boolean;
  newStatus: string;
}

export interface GetWorkflowDto {
  rawFormCode?: string;
}

export interface ApproveWorkflowDto {
  rawFormCode?: string;
  authorization?: string | null;
  adminKey?: string | null;
  body?: unknown;
}

export interface ApprovalInput {
  performedBy: string;
  note: string;
}

export interface AdminFormSummary {
  formId: string;
  formCode: string;
  formTitle: string;
  status: string;
  version: number;
  stepCount: number;
  updatedAt: string;
}

export interface ListFormsDto {
  authorization?: string | null;
  adminKey?: string | null;
}

export interface ReviewWorkflowDto extends ApproveWorkflowDto {}

export interface SaveReviewWorkflowDto extends ApproveWorkflowDto {}