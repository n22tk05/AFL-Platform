export interface SaveManifestResult {
  success: boolean;
  templateId?: string;
  manifestId?: string;
  source: 'database' | 'local_fallback';
}

export interface SaveWorkflowResult {
  success: boolean;
  workflowId?: string;
  stepCount?: number;
  source: 'database' | 'local_fallback';
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
