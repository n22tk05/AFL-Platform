'use client';

import type { FormWorkflow } from '@/shared/contracts';
import type { AdminFormSummary } from '@/modules/forms/types/form.types';

export type AdminApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }

  get isConfigurationError() { return this.status === 503 && this.code === 'ADMIN_KEY_UNCONFIGURED'; }
  get isUnauthorized() { return this.status === 401 || this.code === 'UNAUTHORIZED'; }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: unknown };

function errorDetails(error: unknown): { code: string; message: string } {
  if (typeof error === 'string') return { code: error, message: error };
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; message_vi?: unknown };
    const code = typeof value.code === 'string' ? value.code : 'ADMIN_API_ERROR';
    const message = typeof value.message_vi === 'string' ? value.message_vi
      : typeof value.message === 'string' ? value.message : code;
    return { code, message };
  }
  return { code: 'ADMIN_API_ERROR', message: 'The admin API returned an invalid error.' };
}

async function request<T>(path: string, adminKey: string, init: RequestInit = {}, fetcher: AdminApiFetch = fetch): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: { ...init.headers, 'x-admin-key': adminKey, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  let envelope: Envelope<T> | undefined;
  try { envelope = await response.json() as Envelope<T>; } catch { /* classified below */ }
  if (!response.ok || !envelope || envelope.success !== true) {
    const details = errorDetails(envelope && envelope.success === false ? envelope.error : undefined);
    throw new AdminApiError(response.status, details.code, details.message);
  }
  return envelope.data;
}

function endpoint(formCode: string, suffix = '') {
  return `/api/admin/forms/${encodeURIComponent(formCode)}${suffix}`;
}

export function listAdminForms(adminKey: string, fetcher?: AdminApiFetch): Promise<{ forms: AdminFormSummary[] }> {
  return request('/api/admin/forms', adminKey, {}, fetcher);
}

export function readAdminWorkflow(formCode: string, adminKey: string, fetcher?: AdminApiFetch): Promise<FormWorkflow> {
  return request(endpoint(formCode, '/workflow'), adminKey, {}, fetcher);
}

export function saveAdminWorkflow(formCode: string, adminKey: string, workflow: FormWorkflow, fetcher?: AdminApiFetch): Promise<unknown> {
  return request(endpoint(formCode, '/workflow'), adminKey, { method: 'PUT', body: JSON.stringify(workflow) }, fetcher);
}

export function approveAdminWorkflow(
  formCode: string, adminKey: string, input: { performedBy: string; note: string }, fetcher?: AdminApiFetch
): Promise<{ formCode: string; status: string; approvedAt: string }> {
  const performedBy = input.performedBy.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120);
  const note = input.note.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 1000);
  return request(endpoint(formCode, '/approve'), adminKey, {
    method: 'POST', body: JSON.stringify({ reviewConfirmed: true, performedBy, note }),
  }, fetcher);
}
