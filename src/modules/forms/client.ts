'use client';

import type { FormWorkflow } from '@/shared/contracts';

export type WorkflowStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type WorkflowFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function canonicalFormCode(formCode: string): string {
  let value = formCode;
  try { value = decodeURIComponent(formCode); } catch { /* use the original code when it is not encoded */ }
  return value.trim().normalize('NFC').toUpperCase().replace(/\s+/g, ' ');
}

export function workflowStorageKey(formCode: string): string {
  return `afl:forms:workflow:${encodeURIComponent(canonicalFormCode(formCode))}`;
}

function validWorkflow(value: unknown): value is FormWorkflow {
  if (!value || typeof value !== 'object') return false;
  const workflow = value as Partial<FormWorkflow>;
  const statuses = ['draft', 'pending_review', 'active', 'archived', 'DRAFT', 'ACTIVE', 'ARCHIVED'];
  if (typeof workflow.formCode !== 'string' || !workflow.formCode.trim() ||
      typeof workflow.formTitle !== 'string' || !workflow.formTitle.trim() ||
      !Array.isArray(workflow.steps) || workflow.steps.length === 0 ||
      (workflow.status !== undefined && !statuses.includes(workflow.status)) ||
      (workflow.version !== undefined && (!Number.isSafeInteger(workflow.version) || workflow.version < 1)) ||
      (workflow.totalPages !== undefined && (!Number.isSafeInteger(workflow.totalPages) || workflow.totalPages < 1)) ||
      (workflow.totalSteps !== undefined && (!Number.isSafeInteger(workflow.totalSteps) || workflow.totalSteps < 1)) ||
      (workflow.publishedAt !== undefined && typeof workflow.publishedAt !== 'string') ||
      (workflow.formTitleVi !== undefined && typeof workflow.formTitleVi !== 'string') ||
      (workflow.circularInfo !== undefined && typeof workflow.circularInfo !== 'string')) return false;
  if (workflow.pages !== undefined && (!Array.isArray(workflow.pages) || workflow.pages.some(page =>
    !page || !Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 || typeof page.imageUrl !== 'string' ||
    !Number.isFinite(page.width) || page.width <= 0 || !Number.isFinite(page.height) || page.height <= 0))) return false;
  return workflow.steps.every((step, index) => step && Number.isSafeInteger(step.stepIndex) && step.stepIndex === index + 1 &&
    typeof step.boxId === 'string' && !!step.boxId.trim() &&
    typeof step.sectionName === 'string' && !!step.sectionName.trim() &&
    typeof step.label === 'string' && !!step.label.trim() &&
    typeof step.voiceGuidance === 'string' && !!step.voiceGuidance.trim() &&
    typeof step.audioUrl === 'string' && typeof step.exampleRedText === 'string' &&
    Array.isArray(step.highlightCoords) && step.highlightCoords.length === 4 &&
    step.highlightCoords.every(coord => Number.isFinite(coord) && coord >= 0 && coord <= 1) &&
    step.highlightCoords[0] < step.highlightCoords[2] && step.highlightCoords[1] < step.highlightCoords[3] &&
    (step.requiresPrerequisiteDoc === undefined || typeof step.requiresPrerequisiteDoc === 'boolean') &&
    (step.sourceFieldFromPrerequisite === undefined || typeof step.sourceFieldFromPrerequisite === 'string') &&
    (step.legalWarningFlag === undefined || typeof step.legalWarningFlag === 'boolean') &&
    (step.pageNumber === undefined || (Number.isSafeInteger(step.pageNumber) && step.pageNumber >= 1)) &&
    (step.faqs === undefined || (Array.isArray(step.faqs) && step.faqs.every(faq =>
      faq && typeof faq.question === 'string' && !!faq.question.trim() &&
      typeof faq.answer === 'string' && !!faq.answer.trim()))));
}

function cachedWorkflow(storage: WorkflowStorage | undefined, formCode: string): FormWorkflow | null {
  try {
    const raw = storage?.getItem(workflowStorageKey(formCode));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return validWorkflow(value) && canonicalFormCode(value.formCode) === canonicalFormCode(formCode) ? value : null;
  } catch {
    return null;
  }
}

export async function fetchWorkflow(
  formCode: string,
  options: {
    fetcher?: WorkflowFetch;
    storage?: WorkflowStorage;
    fallback?: FormWorkflow | (() => FormWorkflow | null | undefined);
  } = {}
): Promise<FormWorkflow> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/forms/${encodeURIComponent(formCode)}/workflow`);
    if (!response.ok) throw new Error(`WORKFLOW_HTTP_${response.status}`);
    const envelope: unknown = await response.json();
    const data = envelope && typeof envelope === 'object' && 'success' in envelope &&
      (envelope as { success?: unknown }).success === true
      ? (envelope as { data?: unknown }).data
      : undefined;
    if (!validWorkflow(data) || canonicalFormCode(data.formCode) !== canonicalFormCode(formCode)) {
      throw new Error('INVALID_WORKFLOW_RESPONSE');
    }
    try { options.storage?.setItem(workflowStorageKey(formCode), JSON.stringify(data)); } catch { /* storage is optional */ }
    return data;
  } catch {
    const cached = cachedWorkflow(options.storage, formCode);
    if (cached) return cached;
    const fallback = typeof options.fallback === 'function' ? options.fallback() : options.fallback;
    if (validWorkflow(fallback)) return fallback;
    throw new Error('WORKFLOW_UNAVAILABLE');
  }
}
