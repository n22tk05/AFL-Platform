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
  return typeof workflow.formCode === 'string' && typeof workflow.formTitle === 'string' &&
    Array.isArray(workflow.steps) && workflow.steps.length > 0 &&
    workflow.steps.every(step => step && Number.isFinite(step.stepIndex) && typeof step.label === 'string');
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
